/* SQL playground — SQLite compiled to WebAssembly (sql.js), running in the page. */
(function () {
  'use strict';

  var editor = document.querySelector('[data-pg-editor]');
  if (!editor) return;

  var out = document.querySelector('[data-pg-out]');
  var meta = document.querySelector('[data-pg-meta]');
  var statusDot = document.querySelector('[data-pg-status]');
  var engineLabel = document.querySelector('[data-pg-engine]');
  var runBtn = document.querySelector('[data-pg-run]');
  var resetBtn = document.querySelector('[data-pg-reset]');
  var csvBtn = document.querySelector('[data-pg-csv]');

  var INITIAL = editor.value;
  var db = null;
  var SQL = null;
  var lastResults = [];

  var EXAMPLES = [];
  [].slice.call(document.querySelectorAll('[data-example]')).forEach(function (b) {
    EXAMPLES.push(b);
  });

  // Examples are defined in the generated page; mirror them here by index.
  var EXAMPLE_SQL = [
"SELECT name, dept, salary,\n       RANK()       OVER (PARTITION BY dept ORDER BY salary DESC) AS rank_in_dept,\n       ROUND(AVG(salary) OVER (PARTITION BY dept))                AS dept_avg,\n       salary - LAG(salary) OVER (ORDER BY salary)                AS gap_below\nFROM   employees\nORDER  BY dept, rank_in_dept;",
"SELECT name, hired, salary,\n       SUM(salary) OVER (ORDER BY hired ROWS UNBOUNDED PRECEDING) AS running_payroll\nFROM   employees\nORDER  BY hired;",
"SELECT * FROM (\n  SELECT e.*, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY hired DESC, id DESC) AS rn\n  FROM   employees e\n) t WHERE rn = 1;",
"WITH RECURSIVE days(d) AS (\n  SELECT date('2026-01-01')\n  UNION ALL\n  SELECT date(d, '+1 day') FROM days WHERE d < date('2026-01-10')\n)\nSELECT d, CAST(strftime('%j', d) AS INTEGER) AS day_of_year FROM days;",
"SELECT dept,\n       SUM(salary) AS payroll,\n       ROUND(100.0 * SUM(salary) / (SELECT SUM(salary) FROM employees), 1) AS pct_of_total\nFROM   employees GROUP BY dept ORDER BY payroll DESC;",
"SELECT a.name, b.name AS same_dept_colleague, a.dept\nFROM   employees a\nJOIN   employees b ON b.dept = a.dept AND b.id > a.id\nORDER  BY a.dept;"
  ];

  function setStatus(cls, text) {
    if (statusDot) statusDot.className = 'dot ' + cls;
    if (engineLabel) engineLabel.textContent = text;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------------- engine loading ---------------- */

  // Vendored locally so the playground works offline and behind restrictive networks.
  var BASE = '/assets/vendor/';

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  var ready = loadScript(BASE + 'sql-wasm.js')
    .then(function () {
      return window.initSqlJs({ locateFile: function (f) { return BASE + f; } });
    })
    .then(function (mod) {
      SQL = mod;
      db = new SQL.Database();
      setStatus('dot--ok', 'SQLite ' + versionOf(db) + ' · sql.js · in-browser');
      if (runBtn) runBtn.disabled = false;
      return db;
    })
    .catch(function (err) {
      setStatus('dot--warn', 'engine unavailable');
      out.innerHTML =
        '<div class="result__err">Could not load the SQLite WebAssembly engine.\n\n' +
        escapeHtml(String(err.message || err)) +
        '\n\nThe engine ships with this site at /assets/vendor/sql-wasm.wasm, so this usually means\n' +
        'the file failed to download. The rest of the reference works normally — every code block\n' +
        'still has COPY, and the dialect diff shows the equivalent syntax for every engine.</div>';
      throw err;
    });

  function versionOf(d) {
    try {
      var r = d.exec('SELECT sqlite_version()');
      return r[0].values[0][0];
    } catch (e) {
      return '3.x';
    }
  }

  /* ---------------- running ---------------- */

  function render(results, ms, err) {
    if (err) {
      meta.innerHTML = '<span style="color:var(--red)">error</span>';
      out.innerHTML = '<div class="result__err">' + escapeHtml(err) + '</div>';
      return;
    }
    if (!results.length) {
      meta.innerHTML = '<span>ok</span><span>' + ms + ' ms</span><span>no rows returned</span>';
      out.innerHTML =
        '<p class="palette__empty">Statement executed. ' +
        'DDL and INSERT statements return no rows — add a SELECT to see data.</p>';
      return;
    }

    var html = '';
    var totalRows = 0;
    results.forEach(function (res, i) {
      totalRows += res.values.length;
      var head = res.columns.map(function (c) { return '<th scope="col">' + escapeHtml(c) + '</th>'; }).join('');
      var body = res.values
        .slice(0, 500)
        .map(function (row) {
          return '<tr>' + row.map(function (v) {
            if (v === null) return '<td style="color:var(--tx-4)">NULL</td>';
            return '<td>' + escapeHtml(v) + '</td>';
          }).join('') + '</tr>';
        })
        .join('');
      if (results.length > 1) {
        html += '<p class="hd hd--4" style="padding:10px 14px 0;margin:0">RESULT ' + (i + 1) + '</p>';
      }
      html += '<div class="tablewrap" style="border:0;border-radius:0;margin:0"><table><thead><tr>' +
              head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
      if (res.values.length > 500) {
        html += '<p class="palette__empty">showing first 500 of ' + res.values.length + ' rows</p>';
      }
    });

    meta.innerHTML =
      '<span style="color:var(--grn)">● ok</span>' +
      '<span>' + ms + ' ms</span>' +
      '<span>' + totalRows + ' row' + (totalRows === 1 ? '' : 's') + '</span>' +
      '<span>' + results.length + ' result set' + (results.length === 1 ? '' : 's') + '</span>';
    out.innerHTML = html;
    lastResults = results;
  }

  function run() {
    if (!db) return;
    var sql = editor.value;
    var t0 = performance.now();
    try {
      var results = db.exec(sql);
      render(results, (performance.now() - t0).toFixed(1), null);
    } catch (e) {
      render([], 0, String(e.message || e));
    }
  }

  if (runBtn) {
    runBtn.disabled = true;
    runBtn.addEventListener('click', run);
  }

  editor.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      run();
    }
    // Tab inserts two spaces rather than moving focus
    if (e.key === 'Tab') {
      e.preventDefault();
      var s = editor.selectionStart, en = editor.selectionEnd;
      editor.value = editor.value.slice(0, s) + '  ' + editor.value.slice(en);
      editor.selectionStart = editor.selectionEnd = s + 2;
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      editor.value = INITIAL;
      if (SQL) {
        db = new SQL.Database();
        run();
      }
    });
  }

  EXAMPLES.forEach(function (b) {
    b.addEventListener('click', function () {
      var i = parseInt(b.getAttribute('data-example'), 10);
      if (!EXAMPLE_SQL[i]) return;
      // keep the schema, replace the query
      editor.value = INITIAL.split(/\n\nSELECT dept,/)[0] + '\n\n' + EXAMPLE_SQL[i];
      run();
      editor.scrollTop = editor.scrollHeight;
    });
  });

  if (csvBtn) {
    csvBtn.addEventListener('click', function () {
      if (!lastResults.length) return;
      var res = lastResults[0];
      var esc = function (v) {
        if (v === null) return '';
        var s = String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      var csv = res.columns.join(',') + '\n' +
                res.values.map(function (r) { return r.map(esc).join(','); }).join('\n');
      var done = function () {
        var old = csvBtn.textContent;
        csvBtn.textContent = 'COPIED';
        csvBtn.classList.add('is-done');
        setTimeout(function () { csvBtn.textContent = old; csvBtn.classList.remove('is-done'); }, 1400);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(csv).then(done, function () {});
      else done();
    });
  }

  /* ---------------- deep link: /playground/?q=… ---------------- */
  var q = new URLSearchParams(location.search).get('q');
  if (q) {
    ready.then(function () {
      // seed the demo schema, then run the requested query
      try { db.exec(INITIAL.split(/\nSELECT dept,/)[0]); } catch (e) {}
      editor.value = q;
      run();
    }).catch(function () {});
  } else {
    ready.then(run).catch(function () {});
  }
})();
