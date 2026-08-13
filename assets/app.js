/* SQL Terminal — client runtime. No dependencies. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- theme ---------------- */
  var root = document.documentElement;
  $$('[data-theme-toggle]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try { localStorage.setItem('sqlt-theme', next); } catch (e) {}
    });
  });

  /* ---------------- mobile nav ---------------- */
  var navToggle = $('[data-nav-toggle]');
  if (navToggle) {
    navToggle.addEventListener('click', function () {
      var nav = $('.nav');
      var sb = $('.sb');
      var open = nav.classList.toggle('is-open');
      if (sb) sb.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    });
  }

  /* ---------------- copy buttons ---------------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    var pre = document.getElementById(btn.getAttribute('data-copy'));
    if (!pre) return;
    var text = pre.innerText;
    var done = function () {
      var old = btn.textContent;
      btn.textContent = 'COPIED';
      btn.classList.add('is-done');
      setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1400);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (err) {}
      document.body.removeChild(ta);
    }
  });

  /* ---------------- TOC scrollspy ---------------- */
  var tocLinks = $$('.toc__i a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var map = {};
    tocLinks.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a.parentElement; });
    var heads = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var visible = new Set();
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) visible.add(en.target.id); else visible.delete(en.target.id);
      });
      var first = heads.find(function (h) { return visible.has(h.id); });
      tocLinks.forEach(function (a) { a.parentElement.classList.remove('is-active'); });
      if (first && map[first.id]) map[first.id].classList.add('is-active');
    }, { rootMargin: '-110px 0px -70% 0px' });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ---------------- search index ---------------- */
  var INDEX = null;
  var indexPromise = null;
  function loadIndex() {
    if (indexPromise) return indexPromise;
    indexPromise = fetch('/search-index.json')
      .then(function (r) { return r.json(); })
      .then(function (d) { INDEX = d.docs || d; return INDEX; })
      .catch(function () { INDEX = []; return INDEX; });
    return indexPromise;
  }

  // Fuzzy subsequence scoring, plus token/prefix boosts.
  function score(doc, q, terms) {
    var title = doc.t.toLowerCase();
    var hay = doc.h;
    var s = 0;
    if (title === q) s += 1000;
    else if (title.indexOf(q) === 0) s += 600;
    else if (title.indexOf(q) > -1) s += 380;
    for (var i = 0; i < terms.length; i++) {
      var t = terms[i];
      if (!t) continue;
      var inTitle = title.indexOf(t);
      if (inTitle === 0) s += 140;
      else if (inTitle > 0) s += 90;
      else if (hay.indexOf(t) > -1) s += 34;
      else {
        var f = fuzzy(title, t);
        if (f > 0) s += f; else return -1;
      }
    }
    if (doc.e) s += 6;                      // engine-scoped docs rank slightly higher on match
    s += Math.max(0, 18 - doc.t.length / 4); // prefer concise titles
    s += (doc.w || 0);                       // authored weight
    return s;
  }

  function fuzzy(str, term) {
    var si = 0, ti = 0, streak = 0, best = 0;
    while (si < str.length && ti < term.length) {
      if (str[si] === term[ti]) { ti++; streak++; best = Math.max(best, streak); }
      else streak = 0;
      si++;
    }
    return ti === term.length ? 12 + best : 0;
  }

  function search(q, kind) {
    if (!INDEX) return [];
    q = q.trim().toLowerCase();
    if (!q) return [];
    var terms = q.split(/\s+/);
    var out = [];
    for (var i = 0; i < INDEX.length; i++) {
      var d = INDEX[i];
      if (kind && d.k !== kind) continue;
      var s = score(d, q, terms);
      if (s > 0) out.push([s, d]);
    }
    out.sort(function (a, b) { return b[0] - a[0] || a[1].t.length - b[1].t.length; });
    return out.slice(0, 60).map(function (x) { return x[1]; });
  }

  function mark(text, terms) {
    var esc = text.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; });
    terms.forEach(function (t) {
      if (t.length < 2) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
      esc = esc.replace(re, '<mark>$1</mark>');
    });
    return esc;
  }

  /* ---------------- command palette ---------------- */
  var pal = $('[data-palette]');
  if (pal) {
    var input = $('[data-palette-input]', pal);
    var results = $('[data-palette-results]', pal);
    var countEl = $('[data-palette-count]', pal);
    var filtersEl = $('[data-palette-filters]', pal);
    var sel = 0;
    var current = [];
    var kindFilter = '';
    var lastFocus = null;

    var KINDS = [
      ['', 'all'], ['topic', 'topics'], ['function', 'functions'], ['engine', 'engines'],
      ['recipe', 'cookbook'], ['type', 'data types'], ['operator', 'operators'],
      ['command', 'commands'], ['cheatsheet', 'cheat sheets'], ['cli', 'cli']
    ];
    filtersEl.innerHTML = KINDS.map(function (k) {
      return '<button class="pfilter' + (k[0] === '' ? ' is-on' : '') + '" type="button" data-kind="' + k[0] + '">' + k[1] + '</button>';
    }).join('');
    filtersEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-kind]');
      if (!b) return;
      kindFilter = b.getAttribute('data-kind');
      $$('.pfilter', filtersEl).forEach(function (x) { x.classList.toggle('is-on', x === b); });
      render();
      input.focus();
    });

    var SUGGEST = [
      'window functions', 'postgres json', 'mysql date format', 'sqlite alter table',
      'redshift distribution key', 'sql server top', 'latest row per user', 'recursive cte',
      'isolation levels', 'covering index', 'upsert', 'pivot'
    ];

    function render() {
      var q = input.value.trim();
      if (!q) {
        current = [];
        sel = 0;
        results.innerHTML =
          '<div class="palette__hint"><p>TRY</p></div>' +
          SUGGEST.map(function (s) {
            return '<button class="pres" type="button" data-suggest="' + s + '">' +
              '<span class="pres__k">query</span><span class="pres__m"><span class="pres__t">' + s + '</span></span>' +
              '<span class="pres__e">↵</span></button>';
          }).join('');
        countEl.textContent = (INDEX ? INDEX.length : 0) + ' entries';
        return;
      }
      current = search(q, kindFilter);
      sel = 0;
      var terms = q.toLowerCase().split(/\s+/);
      if (!current.length) {
        results.innerHTML = '<p class="palette__empty">no matches for "' + q.replace(/</g, '&lt;') + '"</p>';
        countEl.textContent = '0 results';
        return;
      }
      results.innerHTML = current.map(function (d, i) {
        return '<a class="pres' + (i === 0 ? ' is-sel' : '') + '" role="option" href="' + d.u + '">' +
          '<span class="pres__k">' + d.k + '</span>' +
          '<span class="pres__m"><span class="pres__t">' + mark(d.t, terms) + '</span>' +
          (d.d ? '<span class="pres__d">' + mark(d.d, terms) + '</span>' : '') + '</span>' +
          (d.e ? '<span class="pres__e">' + d.e + '</span>' : '') + '</a>';
      }).join('');
      countEl.textContent = current.length + ' result' + (current.length === 1 ? '' : 's');
    }

    function move(dir) {
      var items = $$('.pres', results);
      if (!items.length) return;
      items[sel] && items[sel].classList.remove('is-sel');
      sel = (sel + dir + items.length) % items.length;
      items[sel].classList.add('is-sel');
      items[sel].scrollIntoView({ block: 'nearest' });
    }

    function open(prefill) {
      lastFocus = document.activeElement;
      pal.hidden = false;
      document.body.style.overflow = 'hidden';
      loadIndex().then(function () { if (!input.value) render(); });
      if (prefill) input.value = prefill;
      render();
      input.focus();
      input.select();
    }
    function close() {
      pal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }

    $$('[data-open-palette]').forEach(function (b) {
      b.addEventListener('click', function () { open(b.getAttribute('data-query') || ''); });
    });
    $$('[data-palette-close]').forEach(function (b) { b.addEventListener('click', close); });

    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        var btns = $$('.pfilter', filtersEl);
        var idx = btns.findIndex(function (b) { return b.classList.contains('is-on'); });
        btns[(idx + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].click();
      } else if (e.key === 'Enter') {
        var items = $$('.pres', results);
        var it = items[sel];
        if (!it) return;
        e.preventDefault();
        if (it.hasAttribute('data-suggest')) { input.value = it.getAttribute('data-suggest'); render(); }
        else window.location.href = it.getAttribute('href');
      } else if (e.key === 'Escape') { close(); }
    });
    results.addEventListener('click', function (e) {
      var s = e.target.closest('[data-suggest]');
      if (s) { input.value = s.getAttribute('data-suggest'); render(); input.focus(); }
    });

    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pal.hidden ? open() : close(); return; }
      if (pal.hidden && e.key === '/' && !typing) { e.preventDefault(); open(); return; }
      if (!pal.hidden && e.key === 'Escape') close();
    });

    // deep link: /search/?q=… or #search=…
    var params = new URLSearchParams(location.search);
    if (location.pathname === '/search/' || params.get('open') === 'search') {
      loadIndex().then(function () { open(params.get('q') || ''); });
    }
    window.SQLT = { openPalette: open, search: search, loadIndex: loadIndex };
  }

  /* ---------------- expandable rows (functions, recipes) ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (!t) return;
    var panel = document.getElementById(t.getAttribute('data-toggle'));
    if (!panel) return;
    var open = panel.hasAttribute('hidden');
    if (open) panel.removeAttribute('hidden'); else panel.setAttribute('hidden', '');
    t.setAttribute('aria-expanded', String(open));
    var x = t.querySelector('.recipe__x');
    if (x) x.textContent = open ? '−' : '+';
  });

  // open a collapsed panel when linked directly
  function openHashTarget() {
    if (!location.hash) return;
    var el = document.querySelector(location.hash.replace(/[^#\w-]/g, ''));
    if (!el) return;
    var panel = el.closest('[hidden]');
    while (panel) {
      panel.removeAttribute('hidden');
      var tog = document.querySelector('[data-toggle="' + panel.id + '"]');
      if (tog) tog.setAttribute('aria-expanded', 'true');
      panel = panel.parentElement && panel.parentElement.closest('[hidden]');
    }
    el.scrollIntoView({ block: 'start' });
  }
  window.addEventListener('hashchange', openHashTarget);
  openHashTarget();

  /* ---------------- generic filterable lists ---------------- */
  $$('[data-filter-input]').forEach(function (input) {
    var scope = document.getElementById(input.getAttribute('data-filter-input'));
    if (!scope) return;
    var countEl = document.querySelector('[data-filter-count="' + input.getAttribute('data-filter-input') + '"]');
    var items = $$('[data-search]', scope);
    var chips = $$('[data-filter-cat][data-filter-for="' + input.getAttribute('data-filter-input') + '"]');
    var cat = '';
    function apply() {
      var q = input.value.trim().toLowerCase();
      var terms = q ? q.split(/\s+/) : [];
      var n = 0;
      items.forEach(function (it) {
        var hay = it.getAttribute('data-search');
        var okCat = !cat || (it.getAttribute('data-cat') || '').split(' ').indexOf(cat) > -1;
        var okQ = terms.every(function (t) { return hay.indexOf(t) > -1; });
        var show = okCat && okQ;
        it.hidden = !show;
        if (show) n++;
      });
      $$('[data-group]', scope).forEach(function (g) {
        g.hidden = !$$('[data-search]', g).some(function (x) { return !x.hidden; });
      });
      if (countEl) countEl.textContent = n + ' shown';
    }
    input.addEventListener('input', apply);
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        var v = c.getAttribute('data-filter-cat');
        cat = cat === v ? '' : v;
        chips.forEach(function (x) { x.classList.toggle('is-on', x.getAttribute('data-filter-cat') === cat); });
        apply();
      });
    });
    apply();
  });
})();
