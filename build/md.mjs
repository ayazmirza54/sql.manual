/**
 * Minimal markdown subset + SQL syntax highlighter.
 * Zero dependencies. Content is trusted (authored in this repo), but everything
 * is HTML-escaped before any markup is generated.
 *
 * Supported block syntax
 *   ## / ### / ####      headings (auto id + anchor link)
 *   ~~~sql title="..." engine="..." run   fenced code (tilde fences so content
 *                                          can live inside JS template literals)
 *   | a | b |            tables
 *   - item / 1. item     lists
 *   > quote              blockquote
 *   :::note|tip|warn|danger [title]  ... :::   admonition
 *   :::support  pg=y mysql=w ...  :::          dialect support grid
 *   :::kv  LABEL :: value  :::                 metadata rows
 *   :::cols  ... :::                           two-column wrapper
 *   ---                  horizontal rule
 *
 * Inline: `code`, **bold**, *italic*, [text](href), <kbd>K</kbd> via [[K]]
 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const slugify = (s) =>
  String(s)
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/* ------------------------------------------------------------------ *
 * SQL highlighting
 * ------------------------------------------------------------------ */

const KEYWORDS = `ABORT ABSOLUTE ACCESS ACTION ADD ADMIN AFTER AGGREGATE ALL ALTER ALWAYS ANALYZE AND ANY ARRAY AS ASC ASSERTION AT ATTACH AUTHORIZATION AUTOINCREMENT AUTO_INCREMENT BACKUP BEFORE BEGIN BETWEEN BIGSERIAL BINARY BOTH BREAK BROWSE BULK BY CACHE CALL CASCADE CASCADED CASE CAST CATALOG CHAIN CHANGE CHARACTER CHECK CHECKPOINT CLOSE CLUSTER CLUSTERED COALESCE COLLATE COLLATION COLUMN COLUMNS COMMENT COMMIT COMMITTED COMPRESSION COMPUTE CONCURRENTLY CONFLICT CONNECT CONNECTION CONSTRAINT CONSTRAINTS CONTAINS CONTINUE COPY CREATE CROSS CUBE CURRENT CURRENT_DATE CURRENT_TIME CURRENT_TIMESTAMP CURRENT_USER CURSOR CYCLE DATABASE DATABASES DAY DEALLOCATE DECLARE DEFAULT DEFERRABLE DEFERRED DELETE DELIMITER DENY DESC DESCRIBE DETACH DETERMINISTIC DISABLE DISCARD DISTINCT DISTKEY DISTSTYLE DO DOMAIN DOUBLE DROP EACH ELSE ELSEIF ENABLE ENCODING ENCRYPTED END ENFORCED ENGINE ESCAPE EXCEPT EXCEPTION EXCHANGE EXCLUDE EXCLUDING EXCLUSIVE EXEC EXECUTE EXISTS EXPLAIN EXTENSION EXTERNAL EXTRACT FALSE FETCH FILTER FIRST FLUSH FOLLOWING FOR FORCE FOREIGN FORMAT FREEZE FROM FULL FULLTEXT FUNCTION GENERATED GLOBAL GO GRANT GROUP GROUPING GROUPS HANDLER HASH HAVING HOLD HOUR IDENTITY IF IGNORE ILIKE IMMEDIATE IMMUTABLE IMPORT IN INCLUDE INCLUDING INCREMENT INDEX INDEXED INHERITS INITIALLY INNER INOUT INPUT INSENSITIVE INSERT INSTEAD INTERSECT INTERVAL INTO INVOKER IS ISNULL ISOLATION ITERATE JOIN KEY KEYS KILL LANGUAGE LAST LATERAL LEADING LEAVE LEFT LEVEL LIKE LIMIT LIST LISTEN LOAD LOCAL LOCALTIME LOCALTIMESTAMP LOCK LOCKED LOGGED LOOP MATCH MATCHED MATERIALIZED MAXVALUE MERGE MINUTE MINVALUE MODE MODIFY MODULE MONTH MOVE NAME NATURAL NEW NEXT NO NOCYCLE NONE NOT NOTHING NOTIFY NOTNULL NOWAIT NULL NULLIF NULLS OF OFF OFFSET OLD ON ONLY OPEN OPERATOR OPTIMIZE OPTION OR ORDER ORDINALITY OTHERS OUT OUTER OUTPUT OVER OVERLAPS OVERRIDING OWNED OWNER PARALLEL PARTIAL PARTITION PASSWORD PERCENT PERFORM PIVOT PLACING PLANS POLICY PRAGMA PRECEDING PRECISION PREPARE PRESERVE PRIMARY PRIOR PRIVILEGES PROCEDURAL PROCEDURE PROGRAM PUBLIC PUBLICATION QUALIFY QUERY QUOTE RAISE RANGE READ REASSIGN RECURSIVE REFERENCES REFRESH REINDEX RELATIVE RELEASE RENAME REPEAT REPEATABLE REPLACE REPLICA RESET RESTART RESTRICT RETURN RETURNING RETURNS REVOKE RIGHT ROLE ROLLBACK ROLLUP ROUTINE ROW ROWCOUNT ROWS RULE SAFE_CAST SAVEPOINT SCHEMA SCROLL SEARCH SECOND SECURITY SELECT SENSITIVE SEQUENCE SEQUENCES SERIALIZABLE SERVER SESSION SESSION_USER SET SETOF SETS SHARE SHOW SIMILAR SIMPLE SKIP SNAPSHOT SOME SORTKEY SOURCE SQL STABLE START STATEMENT STATISTICS STATUS STORAGE STORED STRICT SUBSCRIPTION SUBSTRING SYSTEM TABLE TABLES TABLESAMPLE TABLESPACE TEMP TEMPORARY THEN TIES TIMEZONE TO TOP TRAILING TRANSACTION TRIGGER TRUE TRUNCATE TRUSTED TYPE UNBOUNDED UNCOMMITTED UNION UNIQUE UNLISTEN UNLOCK UNLOGGED UNPIVOT UNSIGNED UNTIL UPDATE USAGE USE USER USING VACUUM VALID VALIDATE VALUES VARIADIC VERBOSE VIEW VOLATILE WAIT WHEN WHERE WHILE WINDOW WITH WITHIN WITHOUT WORK WRITE XML YEAR ZEROFILL ZONE`.split(/\s+/);

const TYPES = `ARRAY BFILE BIGINT BIGNUMERIC BINARY BIT BLOB BOOL BOOLEAN BOX BPCHAR BYTEA BYTES CHAR CHARACTER CIDR CIRCLE CLOB DATE DATETIME DATETIME2 DATETIMEOFFSET DEC DECIMAL DOUBLE ENUM FLOAT FLOAT4 FLOAT8 GEOGRAPHY GEOMETRY HLLSKETCH HSTORE IMAGE INET INT INT2 INT4 INT8 INT16 INT32 INT64 INTEGER JSON JSONB LINE LSEG LONGBLOB LONGTEXT MACADDR MEDIUMINT MEDIUMTEXT MONEY NCHAR NCLOB NUMBER NUMERIC NVARCHAR OID PATH POINT POLYGON REAL ROWID SERIAL SERIAL4 SERIAL8 SET SMALLDATETIME SMALLINT SMALLMONEY SMALLSERIAL STRING STRUCT SUPER TEXT TIME TIMESTAMP TIMESTAMPTZ TIMETZ TINYBLOB TINYINT TINYTEXT TSQUERY TSVECTOR UNIQUEIDENTIFIER UUID VARBINARY VARCHAR VARCHAR2 VARIANT XML YEAR`.split(/\s+/);

const KW = new Set(KEYWORDS);
const TY = new Set(TYPES);

// Order matters: comments and strings win over everything else.
const SQL_TOKEN = new RegExp(
  [
    '(--[^\\n]*|#[^\\n]*)', // 1 line comment
    '(/\\*[\\s\\S]*?\\*/)', // 2 block comment
    "('(?:''|\\\\.|[^'])*')", // 3 single-quoted string
    '("(?:""|\\\\.|[^"])*"|`(?:[^`])*`|\\[[A-Za-z_#@][^\\]]*\\])', // 4 quoted identifier
    '(\\$\\$[\\s\\S]*?\\$\\$)', // 5 dollar-quoted body
    '([:@$][A-Za-z_][A-Za-z0-9_]*|\\?)', // 6 bind parameter
    '(\\b\\d+\\.?\\d*(?:[eE][-+]?\\d+)?\\b)', // 7 number
    '([A-Za-z_][A-Za-z0-9_]*)(?=\\s*\\()', // 8 function call
    '([A-Za-z_][A-Za-z0-9_$]*)', // 9 word
    '([-+*/%<>=!|&^~]+|::)', // 10 operator
  ].join('|'),
  'g'
);

export function highlightSql(code) {
  let out = '';
  let last = 0;
  const src = String(code);
  SQL_TOKEN.lastIndex = 0;
  let m;
  while ((m = SQL_TOKEN.exec(src))) {
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    const t = m[0];
    let cls;
    if (m[1] || m[2]) cls = 'c'; // comment
    else if (m[3] || m[5]) cls = 's'; // string
    else if (m[4]) cls = 'id'; // quoted identifier
    else if (m[6]) cls = 'v'; // variable / bind param
    else if (m[7]) cls = 'n'; // number
    else if (m[8]) cls = KW.has(t.toUpperCase()) ? 'k' : 'f';
    else if (m[9]) {
      const u = t.toUpperCase();
      cls = KW.has(u) ? 'k' : TY.has(u) ? 't' : null;
    } else if (m[10]) cls = 'o';
    out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
  }
  out += esc(src.slice(last));
  return out;
}

const SHELL_TOKEN = /(^|\n)(\s*)([$#>]\s)|("(?:\\.|[^"])*"|'(?:\\.|[^'])*')|(\s-{1,2}[A-Za-z0-9][\w-]*)|(#[^\n]*)/g;

function highlightShell(code) {
  let out = '';
  let last = 0;
  const src = String(code);
  SHELL_TOKEN.lastIndex = 0;
  let m;
  while ((m = SHELL_TOKEN.exec(src))) {
    out += esc(src.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[3]) out += `${m[1] || ''}${m[2] || ''}<span class="p">${esc(m[3].trim())}</span> `;
    else if (m[4]) out += `<span class="s">${esc(m[4])}</span>`;
    else if (m[5]) out += `<span class="o">${esc(m[5])}</span>`;
    else if (m[6]) out += `<span class="c">${esc(m[6])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(src.slice(last));
  return out;
}

export function highlight(code, lang) {
  if (lang === 'bash' || lang === 'sh' || lang === 'shell' || lang === 'console') return highlightShell(code);
  if (lang === 'text' || lang === 'plan' || lang === 'output') return esc(code);
  return highlightSql(code);
}

/* ------------------------------------------------------------------ *
 * Inline markup
 * ------------------------------------------------------------------ */

export function inline(src) {
  let s = esc(src);
  s = s.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, k) => `<kbd>${k}</kbd>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, h) => {
    const ext = /^https?:/.test(h);
    return `<a href="${h}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${t}</a>`;
  });
  return s;
}

/* ------------------------------------------------------------------ *
 * Dialect support grid
 * ------------------------------------------------------------------ */

export const ENGINE_LABEL = {
  ansi: 'ANSI SQL',
  postgresql: 'PostgreSQL',
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  redshift: 'Redshift',
  snowflake: 'Snowflake',
  bigquery: 'BigQuery',
  duckdb: 'DuckDB',
  db2: 'Db2',
  cockroachdb: 'CockroachDB',
  databricks: 'Databricks',
  trino: 'Trino',
  clickhouse: 'ClickHouse',
  synapse: 'Synapse',
};

const SUPPORT = {
  y: { cls: 'ok', mark: '✓', label: 'Supported' },
  w: { cls: 'warn', mark: '⚠', label: 'Different syntax' },
  n: { cls: 'no', mark: '✕', label: 'Unsupported' },
  p: { cls: 'partial', mark: '◐', label: 'Partial' },
};

export function supportGrid(spec) {
  const cells = [];
  for (const part of String(spec).trim().split(/\s+/)) {
    const [key, valRaw = 'y'] = part.split('=');
    const [val, ...noteParts] = valRaw.split('~');
    const s = SUPPORT[val] || SUPPORT.y;
    const note = noteParts.join('~').replace(/_/g, ' ');
    const name = ENGINE_LABEL[key] || key;
    cells.push(
      `<li class="sup sup--${s.cls}" title="${esc(name)}: ${s.label}${note ? ' — ' + esc(note) : ''}">` +
        `<span class="sup__mark" aria-hidden="true">${s.mark}</span>` +
        `<span class="sup__name">${esc(name)}</span>` +
        `<span class="sr-only">${s.label}</span>` +
        (note ? `<span class="sup__note">${esc(note)}</span>` : '') +
        `</li>`
    );
  }
  return `<ul class="support" role="list">${cells.join('')}</ul>`;
}

/* ------------------------------------------------------------------ *
 * Block parser
 * ------------------------------------------------------------------ */

function parseAttrs(str) {
  const attrs = {};
  const re = /(\w+)(?:="([^"]*)")?/g;
  let m;
  while ((m = re.exec(str || ''))) attrs[m[1]] = m[2] === undefined ? true : m[2];
  return attrs;
}

let codeIdCounter = 0;

export function codeBlock(code, { lang = 'sql', title = '', engine = '', run = false, plain = false } = {}) {
  const id = `code-${++codeIdCounter}`;
  const body = plain ? esc(code) : highlight(code, lang);
  const engineTag = engine
    ? `<span class="code__engine" data-engine="${esc(engine)}">${esc(ENGINE_LABEL[engine] || engine)}</span>`
    : '';
  // The playground runs SQLite, so only offer TRY IT for portable or SQLite SQL.
  const runnable = run && lang === 'sql' && (!engine || engine === 'ansi' || engine === 'sqlite');
  const tryBtn = runnable
    ? `<a class="code__btn" href="/playground/?q=${encodeURIComponent(code.trim())}">TRY IT</a>`
    : '';
  return (
    `<figure class="code" data-lang="${esc(lang)}">` +
    `<figcaption class="code__bar">` +
    `<span class="code__dot" aria-hidden="true"></span>` +
    `<span class="code__title">${title ? esc(title) : esc(lang.toUpperCase())}</span>` +
    engineTag +
    `<span class="code__actions">${tryBtn}` +
    `<button class="code__btn" type="button" data-copy="${id}">COPY</button></span>` +
    `</figcaption>` +
    `<pre id="${id}" class="code__pre"><code class="lang-${esc(lang)}">${body}</code></pre>` +
    `</figure>`
  );
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  const th = head.map((h) => `<th scope="col">${inline(h)}</th>`).join('');
  const tb = body
    .map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${inline(c)}</th>` : `<td>${inline(c)}</td>`)).join('')}</tr>`)
    .join('');
  return `<div class="tablewrap"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`;
}

/**
 * @returns {{html:string, toc:Array<{id:string,text:string,level:number}>, text:string}}
 */
export function markdown(src) {
  const lines = String(src).replace(/\r/g, '').split('\n');
  const out = [];
  const toc = [];
  const plain = [];
  let i = 0;

  const flushPara = (buf) => {
    if (!buf.length) return;
    out.push(`<p>${inline(buf.join(' ').trim())}</p>`);
    plain.push(buf.join(' '));
    buf.length = 0;
  };

  const para = [];

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^~~~(\w+)?\s*(.*)$/);
    if (fence) {
      flushPara(para);
      const lang = fence[1] || 'sql';
      const attrs = parseAttrs(fence[2]);
      const buf = [];
      i++;
      while (i < lines.length && !/^~~~\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const code = buf.join('\n');
      plain.push(code);
      out.push(codeBlock(code, { lang, title: attrs.title || '', engine: attrs.engine || '', run: !!attrs.run }));
      continue;
    }

    // directives
    const dir = line.match(/^:::(\w+)\s*(.*)$/);
    if (dir) {
      flushPara(para);
      const kind = dir[1];
      const rest = dir[2].trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^:::\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      const inner = buf.join('\n');
      plain.push(inner);
      if (kind === 'support') {
        out.push(supportGrid(inner.replace(/\n/g, ' ')));
      } else if (kind === 'kv') {
        const rows = buf
          .filter((l) => l.includes('::'))
          .map((l) => {
            const [k, ...v] = l.split('::');
            return `<div class="kv__row"><dt>${inline(k.trim())}</dt><dd>${inline(v.join('::').trim())}</dd></div>`;
          })
          .join('');
        out.push(`<dl class="kv">${rows}</dl>`);
      } else if (kind === 'terminal') {
        out.push(`<div class="termblock"><pre>${highlight(inner, 'bash')}</pre></div>`);
      } else if (kind === 'cards') {
        const items = buf
          .filter((l) => l.trim())
          .map((l) => {
            const [label, href, desc] = l.split('::').map((x) => (x || '').trim());
            return `<a class="minicard" href="${href || '#'}"><span class="minicard__t">${inline(label)}</span>${
              desc ? `<span class="minicard__d">${inline(desc)}</span>` : ''
            }</a>`;
          })
          .join('');
        out.push(`<div class="minicards">${items}</div>`);
      } else if (kind === 'raw') {
        out.push(inner);
      } else {
        const title = rest || kind.toUpperCase();
        out.push(
          `<aside class="note note--${esc(kind)}"><p class="note__title">${esc(title)}</p>${markdown(inner).html}</aside>`
        );
      }
      continue;
    }

    // heading
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      flushPara(para);
      const level = h[1].length;
      const text = h[2].trim();
      const id = slugify(text);
      toc.push({ id, text, level });
      plain.push(text);
      out.push(
        `<h${level} id="${id}" class="hd hd--${level}">` +
          `<a class="hd__anchor" href="#${id}" aria-label="Link to ${esc(text)}">#</a>${inline(text)}</h${level}>`
      );
      i++;
      continue;
    }

    // table
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      flushPara(para);
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push(lines[i]);
        plain.push(lines[i]);
        i++;
      }
      out.push(renderTable(rows));
      continue;
    }

    // lists
    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flushPara(para);
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s*\d+\.\s+/.test(lines[i]))) {
        const t = lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, '');
        items.push(`<li>${inline(t)}</li>`);
        plain.push(t);
        i++;
      }
      out.push(`<${ordered ? 'ol' : 'ul'} class="list">${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      flushPara(para);
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      plain.push(buf.join(' '));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }

    if (/^---+\s*$/.test(line)) {
      flushPara(para);
      out.push('<hr>');
      i++;
      continue;
    }

    if (!line.trim()) {
      flushPara(para);
      i++;
      continue;
    }

    para.push(line.trim());
    i++;
  }
  flushPara(para);

  return { html: out.join('\n'), toc, text: plain.join(' ').replace(/\s+/g, ' ').slice(0, 6000) };
}
