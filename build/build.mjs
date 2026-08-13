#!/usr/bin/env node
/**
 * SQL Terminal — static site generator.
 * Zero dependencies. Reads /content, writes /docs.
 *
 *   node build/build.mjs           build
 *   node build/build.mjs --serve   build, then serve on :4321
 */

import { readdir, mkdir, writeFile, rm, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { markdown, esc, slugify, codeBlock, supportGrid, inline, ENGINE_LABEL, highlight } from './md.mjs';
import { layout } from './layout.mjs';
import { bannerHtml, bannerWidth } from './banner.mjs';
import { site, nav, engines, engineById } from '../content/site.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs');

const searchIndex = [];
const pages = [];
let codeExampleCount = 0;

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function addDoc({ kind, title, url, desc = '', engine = '', hay = '', weight = 0 }) {
  searchIndex.push({
    k: kind,
    t: title,
    u: url,
    d: desc.slice(0, 140),
    e: engine,
    w: weight,
    h: (title + ' ' + desc + ' ' + hay).toLowerCase(),
  });
}

async function emit(urlPath, html) {
  const dir = path.join(OUT, urlPath);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'index.html'), html, 'utf8');
  pages.push(urlPath === '' ? '/' : `/${urlPath}/`);
}

const countExamples = (body) => (String(body).match(/^~~~\w/gm) || []).length;

/* ------------------------------------------------------------------ *
 * content loading
 * ------------------------------------------------------------------ */

async function loadDir(dir) {
  const full = path.join(ROOT, 'content', dir);
  if (!existsSync(full)) return [];
  const files = (await readdir(full)).filter((f) => f.endsWith('.mjs')).sort();
  const out = [];
  for (const f of files) {
    const mod = await import(path.join(full, f));
    out.push({ file: f, mod });
  }
  return out;
}

const sqlModules = await loadDir('sql');
const pageModules = await loadDir('pages');
const dbModules = await loadDir('databases');

const operators = (await import('../content/operators.mjs')).default;
const operatorCats = (await import('../content/operators.mjs')).categories;
const fnMod = await import('../content/functions.mjs');
const dtMod = await import('../content/datatypes.mjs');
const cmpMod = await import('../content/comparison.mjs');
const cookMod = await import('../content/cookbook.mjs');
const cmdMod = await import('../content/commands.mjs');
const cheatsheets = (await import('../content/cheatsheets.mjs')).default;

// SQL topics, in declaration order, grouped by their module's section
const sqlSections = [];
const sqlTopics = [];
for (const { mod } of sqlModules) {
  const section = mod.section || { id: 'sql', title: 'SQL' };
  const topics = mod.default.map((t) => ({
    ...t,
    path: t.path || `/sql/${t.slug}/`,
    section: section.id,
    sectionTitle: section.title,
  }));
  sqlSections.push({ ...section, topics });
}
sqlSections.sort((a, b) => (a.order || 99) - (b.order || 99));
for (const s of sqlSections) sqlTopics.push(...s.topics);

const standalonePages = pageModules.map(({ mod }) => mod.default);

// engine explorer pages
const dbPages = [];
for (const { mod } of dbModules) {
  const val = mod.default;
  for (const p of Array.isArray(val) ? val : [val]) dbPages.push(p);
}
const dbById = Object.fromEntries(dbPages.map((d) => [d.id, d]));

/* ------------------------------------------------------------------ *
 * shared navigation
 * ------------------------------------------------------------------ */

const sqlSidebar = [
  ...sqlSections.map((s) => ({
    title: s.title,
    items: s.topics.map((t) => ({ label: t.title, href: t.path })),
  })),
  {
    title: 'Engineering',
    items: [
      { label: 'Indexes', href: '/indexes/' },
      { label: 'Performance', href: '/performance/' },
      { label: 'Transactions', href: '/transactions/' },
      { label: 'Administration', href: '/admin/' },
    ],
  },
];

const dbSidebar = [
  {
    title: 'Engines',
    items: engines.map((e) => ({ label: e.name, href: `/databases/${e.id}/` })),
  },
  {
    title: 'Cross-engine',
    items: [
      { label: 'Dialect overview', href: '/dialects/' },
      { label: 'Dialect diff', href: '/comparison/' },
      { label: 'Data types', href: '/datatypes/' },
      { label: 'CLI reference', href: '/cli/' },
    ],
  },
];

/* ------------------------------------------------------------------ *
 * topic pages
 * ------------------------------------------------------------------ */

const allTopics = [...sqlTopics, ...standalonePages];

for (let i = 0; i < allTopics.length; i++) {
  const t = allTopics[i];
  const { html, toc, text } = markdown(t.body);
  codeExampleCount += countExamples(t.body);

  const isSql = sqlTopics.includes(t);
  const list = isSql ? sqlTopics : null;
  const prev = list && i > 0 ? list[i - 1] : null;
  const next = list && i < sqlTopics.length - 1 ? list[i + 1] : null;

  const body =
    `<h1>${esc(t.title)}</h1>` +
    (t.summary ? `<p class="lede">${inline(t.summary)}</p>` : '') +
    html;

  await emit(t.path.replace(/^\/|\/$/g, ''), layout({
    path: t.path,
    title: t.title,
    description: t.summary,
    keywords: t.keywords || '',
    body,
    toc,
    sidebar: sqlSidebar,
    meta: {
      category: t.category,
      difficulty: t.difficulty,
      standard: t.standard,
      updated: site.updated,
    },
    related: t.related || [],
    prev: prev ? { label: prev.title, href: prev.path } : null,
    next: next ? { label: next.title, href: next.path } : null,
    scripts: t.path === '/joins/' ? ['/assets/joins.js'] : [],
  }));

  addDoc({
    kind: 'topic',
    title: t.title,
    url: t.path,
    desc: t.summary,
    hay: (t.keywords || '') + ' ' + text,
    weight: 20,
  });

  // index the h2 headings as deep links
  for (const h of toc.filter((x) => x.level === 2)) {
    addDoc({ kind: 'topic', title: `${h.text}`, url: `${t.path}#${h.id}`, desc: t.title, weight: 4 });
  }
}

/* ------------------------------------------------------------------ *
 * /sql/  index
 * ------------------------------------------------------------------ */
{
  const sections = sqlSections
    .map((s) => {
      const cards = s.topics
        .map(
          (t) =>
            `<a class="card" href="${t.path}">` +
            `<span class="card__k">${esc(t.category)}</span>` +
            `<span class="card__t">${esc(t.title)}</span>` +
            `<span class="card__d">${esc(t.summary)}</span>` +
            `<span class="card__f"><span>${esc(t.difficulty || '')}</span><span>${esc(t.standard || '')}</span></span>` +
            `</a>`
        )
        .join('');
      return `<section class="section"><div class="section__h"><h2>${esc(s.title)}</h2></div><div class="cards">${cards}</div></section>`;
    })
    .join('');

  await emit('sql', layout({
    path: '/sql/',
    title: 'SQL fundamentals & reference',
    description:
      'A complete SQL reference: basics, DDL, DML, querying, joins, subqueries, CTEs, set operations and advanced SQL — with dialect differences called out throughout.',
    body:
      `<h1>SQL reference</h1><p class="lede">Every construct in the language, from <code>SELECT</code> to recursive CTEs and window frames. Each topic marks what is ANSI standard and what is vendor-specific, and shows the differences rather than averaging them away.</p>` +
      sections,
    sidebar: sqlSidebar,
    wide: true,
  }));
}

/* ------------------------------------------------------------------ *
 * database explorer
 * ------------------------------------------------------------------ */

for (const e of engines) {
  const page = dbById[e.id];
  const bodySrc = page ? page.body : `\n## Overview\n\n${e.blurb}\n`;
  const { html, toc, text } = markdown(bodySrc);
  codeExampleCount += countExamples(bodySrc);

  const head =
    `<h1>${esc(e.name)}</h1>` +
    `<p class="lede">${esc(page ? page.summary : e.blurb)}</p>` +
    `<div class="tags">` +
    `<span class="tag">${esc(e.kind)}</span>` +
    `<span class="tag">${esc(e.license)}</span>` +
    `<span class="tag">CLI: ${esc(e.cli)}</span>` +
    `</div>`;

  await emit(`databases/${e.id}`, layout({
    path: `/databases/${e.id}/`,
    title: e.name,
    description: page ? page.summary : e.blurb,
    keywords: `${e.name} sql reference syntax types indexes transactions performance cli`,
    body: head + html,
    toc,
    sidebar: dbSidebar,
    meta: { engine: e.name, version: e.version, license: e.license.split('(')[0].trim(), updated: site.updated },
    related: [
      { label: 'Dialect diff', href: '/comparison/' },
      { label: 'Data types', href: '/datatypes/' },
      { label: 'CLI reference', href: '/cli/' },
      { label: 'All engines', href: '/databases/' },
    ],
  }));

  addDoc({
    kind: 'engine',
    title: e.name,
    url: `/databases/${e.id}/`,
    desc: page ? page.summary : e.blurb,
    engine: e.short,
    hay: text,
    weight: 30,
  });
  for (const h of toc.filter((x) => x.level === 2)) {
    addDoc({ kind: 'engine', title: `${e.name}: ${h.text}`, url: `/databases/${e.id}/#${h.id}`, engine: e.short, weight: 3 });
  }
}

{
  const cards = engines
    .map(
      (e) =>
        `<a class="card card--eng" style="--eng:${e.color}" href="/databases/${e.id}/">` +
        `<span class="card__k"><span class="dot" style="background:${e.color}"></span>${esc(e.kind)}</span>` +
        `<span class="card__t">${esc(e.name)}</span>` +
        `<span class="card__d">${esc(e.blurb)}</span>` +
        `<span class="card__f"><span>${esc(e.version)}</span><span>${esc(e.cli)}</span></span>` +
        `</a>`
    )
    .join('');

  await emit('databases', layout({
    path: '/databases/',
    title: 'Database explorer',
    description: 'Reference pages for 16 database engines: architecture, syntax, types, indexes, transactions, performance, administration and CLI.',
    body:
      `<h1>Database explorer</h1><p class="lede">Sixteen engines, each with architecture, installation, CLI, types, indexing, transactions, JSON, performance, monitoring and administration — written against what the engine actually does, not what the marketing says.</p>` +
      `<div class="cards">${cards}</div>`,
    sidebar: dbSidebar,
    wide: true,
  }));
}

/* ------------------------------------------------------------------ *
 * /dialects/
 * ------------------------------------------------------------------ */
{
  const FEATURES = [
    ['Window functions', { postgresql: 'y', mysql: 'y', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'y', clickhouse: 'y', db2: 'y', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'y' }],
    ['CTEs (WITH)', { postgresql: 'y', mysql: 'y', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'y', clickhouse: 'y', db2: 'y', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'y' }],
    ['Recursive CTEs', { postgresql: 'y', mysql: 'y', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'y', clickhouse: 'p', db2: 'y', cockroachdb: 'y', databricks: 'p', trino: 'n', synapse: 'y' }],
    ['MERGE', { postgresql: 'y', mysql: 'n', sqlite: 'n', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'n', clickhouse: 'n', db2: 'y', cockroachdb: 'n', databricks: 'y', trino: 'p', synapse: 'p' }],
    ['ON CONFLICT / upsert', { postgresql: 'y', mysql: 'w', sqlite: 'y', sqlserver: 'w', oracle: 'w', redshift: 'w', snowflake: 'w', bigquery: 'w', duckdb: 'y', mariadb: 'w', clickhouse: 'n', db2: 'w', cockroachdb: 'y', databricks: 'w', trino: 'w', synapse: 'w' }],
    ['RETURNING', { postgresql: 'y', mysql: 'n', sqlite: 'y', sqlserver: 'w', oracle: 'w', redshift: 'n', snowflake: 'n', bigquery: 'n', duckdb: 'y', mariadb: 'y', clickhouse: 'n', db2: 'w', cockroachdb: 'y', databricks: 'n', trino: 'n', synapse: 'w' }],
    ['FULL OUTER JOIN', { postgresql: 'y', mysql: 'n', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'n', clickhouse: 'y', db2: 'y', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'y' }],
    ['LATERAL / APPLY', { postgresql: 'y', mysql: 'y', sqlite: 'n', sqlserver: 'y', oracle: 'y', redshift: 'p', snowflake: 'y', bigquery: 'p', duckdb: 'y', mariadb: 'n', clickhouse: 'n', db2: 'y', cockroachdb: 'y', databricks: 'p', trino: 'y', synapse: 'y' }],
    ['QUALIFY', { postgresql: 'n', mysql: 'n', sqlite: 'n', sqlserver: 'n', oracle: 'n', redshift: 'n', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'n', clickhouse: 'y', db2: 'n', cockroachdb: 'n', databricks: 'y', trino: 'n', synapse: 'n' }],
    ['FILTER clause', { postgresql: 'y', mysql: 'n', sqlite: 'y', sqlserver: 'n', oracle: 'n', redshift: 'n', snowflake: 'n', bigquery: 'n', duckdb: 'y', mariadb: 'n', clickhouse: 'w', db2: 'y', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'n' }],
    ['Arrays', { postgresql: 'y', mysql: 'n', sqlite: 'n', sqlserver: 'n', oracle: 'p', redshift: 'p', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'n', clickhouse: 'y', db2: 'p', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'n' }],
    ['JSON type', { postgresql: 'y', mysql: 'y', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'y', mariadb: 'p', clickhouse: 'y', db2: 'y', cockroachdb: 'y', databricks: 'y', trino: 'y', synapse: 'p' }],
    ['Materialized views', { postgresql: 'y', mysql: 'n', sqlite: 'n', sqlserver: 'y', oracle: 'y', redshift: 'y', snowflake: 'y', bigquery: 'y', duckdb: 'n', mariadb: 'n', clickhouse: 'w', db2: 'y', cockroachdb: 'p', databricks: 'y', trino: 'p', synapse: 'y' }],
    ['Partial / filtered indexes', { postgresql: 'y', mysql: 'n', sqlite: 'y', sqlserver: 'y', oracle: 'w', redshift: 'n', snowflake: 'n', bigquery: 'n', duckdb: 'y', mariadb: 'n', clickhouse: 'n', db2: 'n', cockroachdb: 'y', databricks: 'n', trino: 'n', synapse: 'n' }],
    ['Transactional DDL', { postgresql: 'y', mysql: 'n', sqlite: 'y', sqlserver: 'y', oracle: 'n', redshift: 'y', snowflake: 'n', bigquery: 'n', duckdb: 'y', mariadb: 'n', clickhouse: 'n', db2: 'y', cockroachdb: 'y', databricks: 'n', trino: 'n', synapse: 'n' }],
    ['Enforced constraints', { postgresql: 'y', mysql: 'y', sqlite: 'y', sqlserver: 'y', oracle: 'y', redshift: 'n', snowflake: 'n', bigquery: 'n', duckdb: 'y', mariadb: 'y', clickhouse: 'n', db2: 'y', cockroachdb: 'y', databricks: 'p', trino: 'n', synapse: 'n' }],
    ['SKIP LOCKED', { postgresql: 'y', mysql: 'y', sqlite: 'n', sqlserver: 'w', oracle: 'y', redshift: 'n', snowflake: 'n', bigquery: 'n', duckdb: 'n', mariadb: 'y', clickhouse: 'n', db2: 'y', cockroachdb: 'y', databricks: 'n', trino: 'n', synapse: 'n' }],
    ['Temporal tables', { postgresql: 'n', mysql: 'n', sqlite: 'n', sqlserver: 'y', oracle: 'y', redshift: 'n', snowflake: 'y', bigquery: 'y', duckdb: 'n', mariadb: 'y', clickhouse: 'n', db2: 'y', cockroachdb: 'n', databricks: 'y', trino: 'p', synapse: 'n' }],
  ];

  const MARK = { y: ['yes', '✓'], n: ['no', '✕'], w: ['part', '⚠'], p: ['part', '◐'] };
  const head = engines.map((e) => `<th scope="col" title="${esc(e.name)}">${esc(e.short)}</th>`).join('');
  const rows = FEATURES.map(([label, map]) => {
    const cells = engines
      .map((e) => {
        const [cls, mark] = MARK[map[e.id] || 'n'];
        return `<td class="${cls}" title="${esc(e.name)}">${mark}</td>`;
      })
      .join('');
    return `<tr><th scope="row">${esc(label)}</th>${cells}</tr>`;
  }).join('');

  const engineCards = engines
    .map(
      (e) =>
        `<a class="card card--eng" style="--eng:${e.color}" href="/databases/${e.id}/">` +
        `<span class="card__k"><span class="dot" style="background:${e.color}"></span>${esc(e.short)}</span>` +
        `<span class="card__t">${esc(e.name)}</span>` +
        `<span class="card__d">${esc(e.blurb)}</span></a>`
    )
    .join('');

  await emit('dialects', layout({
    path: '/dialects/',
    title: 'SQL dialects',
    description: 'Feature support matrix across 16 SQL dialects: window functions, MERGE, RETURNING, LATERAL, QUALIFY, arrays, JSON, transactional DDL and more.',
    body:
      `<h1>SQL dialects</h1>` +
      `<p class="lede">Every engine implements a different subset of the standard plus its own extensions. This matrix covers the features that most often decide whether a query ports.</p>` +
      `<div class="tags"><span class="tag">✓ supported</span><span class="tag tag--vendor">⚠ different syntax</span><span class="tag">◐ partial</span><span class="tag tag--deprecated">✕ unsupported</span></div>` +
      `<div class="matrix tablewrap"><table><thead><tr><th scope="col">Feature</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>` +
      `<h2 class="hd hd--2" id="engines">The engines</h2><div class="cards">${engineCards}</div>` +
      `<p>For side-by-side code, see the <a href="/comparison/">dialect diff</a>.</p>`,
    sidebar: dbSidebar,
    wide: true,
  }));

  addDoc({ kind: 'topic', title: 'SQL dialect feature matrix', url: '/dialects/', desc: 'Feature support across 16 engines', weight: 25 });
}

/* ------------------------------------------------------------------ *
 * /comparison/  — dialect diff
 * ------------------------------------------------------------------ */
{
  const tasks = cmpMod.default;
  const dialects = cmpMod.dialects;

  const chips = dialects
    .map(
      (d) =>
        `<button class="chip chip--eng is-on" type="button" data-dialect="${d}" style="--eng:${
          engineById[d] ? engineById[d].color : 'var(--grn)'
        }">${esc(ENGINE_LABEL[d] || d)}</button>`
    )
    .join('');

  const S = { y: ['ok', '✓ Supported'], w: ['warn', '⚠ Different syntax'], n: ['no', '✕ Unsupported'], p: ['partial', '◐ Partial'] };

  const blocks = tasks
    .map((t) => {
      const impls = dialects
        .filter((d) => t.impls[d])
        .map((d) => {
          const im = t.impls[d];
          const [cls, label] = S[im.s] || S.y;
          codeExampleCount++;
          return (
            `<div class="diffcell" data-dialect="${d}">` +
            codeBlock(im.sql, { lang: 'sql', title: ENGINE_LABEL[d] || d, engine: d, run: im.s !== 'n' }) +
            `<p class="diffcell__s sup sup--${cls}"><span class="sup__mark">${label.slice(0, 1)}</span>${esc(label.slice(2))}</p>` +
            `</div>`
          );
        })
        .join('');
      return (
        `<section class="section" id="${t.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" id="${t.id}-h" style="border:0;padding:0;margin:0">${esc(t.task)}</h2>` +
        `<a class="more" href="#${t.id}">#</a></div>` +
        (t.notes ? `<p class="section__d">${inline(t.notes)}</p>` : '') +
        `<div class="diffgrid">${impls}</div></section>`
      );
    })
    .join('');

  await emit('comparison', layout({
    path: '/comparison/',
    title: 'SQL dialect diff',
    description: 'The same SQL task implemented side by side in PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redshift, Snowflake, BigQuery, DuckDB, MariaDB, ClickHouse and Db2.',
    keywords: 'sql dialect comparison difference postgresql mysql sql server oracle bigquery snowflake syntax equivalent',
    body:
      `<h1>SQL dialect diff</h1>` +
      `<p class="lede">One task, every dialect. Toggle the engines you care about; everything else disappears.</p>` +
      `<div class="toolbar"><span class="toolbar__l">Engines</span>${chips}` +
      `<button class="chip" type="button" data-dialect-all>toggle all</button></div>` +
      blocks,
    sidebar: dbSidebar,
    wide: true,
    scripts: ['/assets/comparison.js'],
  }));

  for (const t of tasks) {
    addDoc({
      kind: 'topic',
      title: t.task,
      url: `/comparison/#${t.id}`,
      desc: 'Dialect diff',
      hay: Object.keys(t.impls).join(' ') + ' ' + t.notes,
      weight: 18,
    });
  }
}

/* ------------------------------------------------------------------ *
 * /functions/
 * ------------------------------------------------------------------ */
{
  const fns = fnMod.default;
  const cats = fnMod.categories;

  const chips = cats
    .map((c) => `<button class="chip" type="button" data-filter-cat="${c.id}" data-filter-for="fnlist">${esc(c.label)}</button>`)
    .join('');

  const groups = cats
    .map((c) => {
      const rows = fns
        .filter((f) => f.cat === c.id)
        .map((f, i) => {
          const id = `fn-${slugify(f.n)}-${c.id}`;
          const detailId = `${id}-d`;
          codeExampleCount++;
          const detail =
            `<div class="fndetail" id="${detailId}" hidden>` +
            `<dl class="kv">` +
            `<div class="kv__row"><dt>Syntax</dt><dd><code>${esc(f.syn)}</code></dd></div>` +
            `<div class="kv__row"><dt>Returns</dt><dd>${esc(f.ret)}</dd></div>` +
            (f.use ? `<div class="kv__row"><dt>Common use</dt><dd>${inline(f.use)}</dd></div>` : '') +
            (f.perf ? `<div class="kv__row"><dt>Performance</dt><dd>${inline(f.perf)}</dd></div>` : '') +
            `</dl>` +
            codeBlock(f.ex, { lang: 'sql', title: 'Example', run: true }) +
            `<p class="hd hd--4">Dialect support</p>` +
            supportGrid(f.sup) +
            `</div>`;
          return (
            `<div class="fnrow-wrap" data-search="${esc((f.n + ' ' + f.d + ' ' + f.syn + ' ' + (f.use || '')).toLowerCase())}" data-cat="${c.id}">` +
            `<button class="fnrow" type="button" data-toggle="${detailId}" aria-expanded="false" id="${id}">` +
            `<span class="fnrow__n">${esc(f.n)}</span>` +
            `<span class="fnrow__d">${esc(f.d)}</span>` +
            `<span class="fnrow__c">${esc(c.label)}</span>` +
            `</button>${detail}</div>`
          );
        })
        .join('');
      return (
        `<section class="section" data-group id="${c.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" style="border:0;padding:0;margin:0">${esc(c.label)}</h2>` +
        `<span class="more">${fns.filter((f) => f.cat === c.id).length} functions</span></div>` +
        `<p class="section__d">${esc(c.blurb)}</p><div class="fnlist">${rows}</div></section>`
      );
    })
    .join('');

  await emit('functions', layout({
    path: '/functions/',
    title: 'SQL function encyclopedia',
    description: 'Searchable reference for SQL functions: aggregate, window, string, numeric, date/time, conditional, JSON, array, statistical, regex, hashing and geospatial — with syntax, examples and dialect support.',
    keywords: 'sql functions reference count sum avg string_agg row_number lag date_trunc coalesce json regex',
    body:
      `<h1>Function encyclopedia</h1>` +
      `<p class="lede">${fns.length} functions across ${cats.length} categories. Every entry carries syntax, return type, an example, use cases, dialect support and performance notes. Click a row to expand it.</p>` +
      `<div class="toolbar">` +
      `<input class="field" style="flex:1;min-width:220px" type="search" placeholder="filter functions…" data-filter-input="fnlist" aria-label="Filter functions">` +
      `<span class="toolbar__l" data-filter-count="fnlist"></span></div>` +
      `<div class="toolbar">${chips}</div>` +
      `<div id="fnlist">${groups}</div>`,
    sidebar: sqlSidebar,
    wide: true,
  }));

  for (const f of fns) {
    addDoc({
      kind: 'function',
      title: f.n,
      url: `/functions/#fn-${slugify(f.n)}-${f.cat}`,
      desc: f.d,
      hay: f.syn + ' ' + (f.use || '') + ' ' + f.cat,
      weight: 26,
    });
  }
}

/* ------------------------------------------------------------------ *
 * /operators/
 * ------------------------------------------------------------------ */
{
  const chips = operatorCats
    .map((c) => `<button class="chip" type="button" data-filter-cat="${c.id}" data-filter-for="oplist">${esc(c.label)}</button>`)
    .join('');

  const groups = operatorCats
    .map((c) => {
      const items = operators.filter((o) => o.cat === c.id);
      const rows = items
        .map((o) => {
          codeExampleCount++;
          return (
            `<div class="fnrow-wrap" data-search="${esc((o.op + ' ' + o.desc + ' ' + o.engines).toLowerCase())}" data-cat="${c.id}" id="op-${slugify(o.op + '-' + c.id)}">` +
            `<div class="fnrow" style="cursor:default">` +
            `<span class="fnrow__n">${esc(o.op)}</span>` +
            `<span class="fnrow__d">${inline(o.desc)}${o.note ? ` <em style="color:var(--amb)">${esc(o.note)}</em>` : ''}</span>` +
            `<span class="fnrow__c">${esc(o.engines)}</span></div>` +
            codeBlock(o.ex, { lang: 'sql', title: 'Example' }) +
            `</div>`
          );
        })
        .join('');
      return (
        `<section class="section" data-group id="${c.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" style="border:0;padding:0;margin:0">${esc(c.label)}</h2>` +
        `<span class="more">${items.length}</span></div><div class="fnlist">${rows}</div></section>`
      );
    })
    .join('');

  await emit('operators', layout({
    path: '/operators/',
    title: 'SQL operators',
    description: 'Complete SQL operator reference: arithmetic, comparison, logical, string, pattern, NULL, set, bitwise, JSON, array and cast operators with per-engine availability.',
    keywords: 'sql operators comparison logical arithmetic like ilike regex json array bitwise cast precedence',
    body:
      `<h1>Operators</h1>` +
      `<p class="lede">${operators.length} operators, grouped by what they do, with the engines that support each spelling.</p>` +
      `<div class="toolbar">` +
      `<input class="field" style="flex:1;min-width:220px" type="search" placeholder="filter operators…" data-filter-input="oplist" aria-label="Filter operators">` +
      `<span class="toolbar__l" data-filter-count="oplist"></span></div>` +
      `<div class="toolbar">${chips}</div><div id="oplist">${groups}</div>`,
    sidebar: sqlSidebar,
    wide: true,
  }));

  for (const o of operators) {
    addDoc({ kind: 'operator', title: o.op, url: `/operators/#op-${slugify(o.op + '-' + o.cat)}`, desc: o.desc, weight: 12 });
  }
}

/* ------------------------------------------------------------------ *
 * /commands/
 * ------------------------------------------------------------------ */
{
  const groups = cmdMod.groups
    .map((g) => {
      const items = cmdMod.default.filter((c) => c.group === g.id);
      const rows = items
        .map((c) => {
          codeExampleCount++;
          return (
            `<div class="fnrow-wrap" data-search="${esc((c.cmd + ' ' + c.d + ' ' + c.syn).toLowerCase())}" data-cat="${g.id}" id="cmd-${slugify(c.cmd)}">` +
            `<div class="fnrow" style="cursor:default">` +
            `<span class="fnrow__n">${c.href ? `<a href="${c.href}">${esc(c.cmd)}</a>` : esc(c.cmd)}</span>` +
            `<span class="fnrow__d">${inline(c.d)}</span>` +
            `<span class="fnrow__c">${esc(c.std)}</span></div>` +
            `<div class="code" style="margin:8px 0 0"><pre class="code__pre"><code>${highlight(c.syn, 'sql')}</code></pre></div>` +
            `</div>`
          );
        })
        .join('');
      return (
        `<section class="section" data-group id="${g.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" style="border:0;padding:0;margin:0">${esc(g.label)}</h2>` +
        `<span class="more">${items.length}</span></div><div class="fnlist">${rows}</div></section>`
      );
    })
    .join('');

  const chips = cmdMod.groups
    .map((g) => `<button class="chip" type="button" data-filter-cat="${g.id}" data-filter-for="cmdlist">${esc(g.label)}</button>`)
    .join('');

  await emit('commands', layout({
    path: '/commands/',
    title: 'SQL commands',
    description: 'Every SQL statement — DQL, DML, DDL, DCL, TCL and session commands — with syntax, standard version and links to full references.',
    keywords: 'sql commands statements select insert update delete create alter drop grant commit rollback',
    body:
      `<h1>SQL commands</h1>` +
      `<p class="lede">Every statement in the language, grouped by sublanguage, with its syntax skeleton and whether it is standard or vendor-specific.</p>` +
      `<div class="toolbar"><input class="field" style="flex:1;min-width:220px" type="search" placeholder="filter commands…" data-filter-input="cmdlist" aria-label="Filter commands">` +
      `<span class="toolbar__l" data-filter-count="cmdlist"></span></div><div class="toolbar">${chips}</div>` +
      `<div id="cmdlist">${groups}</div>`,
    sidebar: sqlSidebar,
    wide: true,
  }));

  for (const c of cmdMod.default) {
    addDoc({ kind: 'command', title: c.cmd, url: c.href || `/commands/#cmd-${slugify(c.cmd)}`, desc: c.d, hay: c.syn, weight: 16 });
  }
}

/* ------------------------------------------------------------------ *
 * /datatypes/
 * ------------------------------------------------------------------ */
{
  const types = dtMod.default;
  const cats = dtMod.categories;
  const order = dtMod.engineOrder;

  const chips = cats
    .map((c) => `<button class="chip" type="button" data-filter-cat="${c.id}" data-filter-for="dtlist">${esc(c.label)}</button>`)
    .join('');

  const groups = cats
    .map((c) => {
      const items = types.filter((t) => t.cat === c.id);
      const rows = items
        .map((t) => {
          const id = `type-${slugify(t.name)}`;
          const mapRows = order
            .map(
              (e) =>
                `<tr><th scope="row">${esc(ENGINE_LABEL[e] || e)}</th><td><code>${esc(t.map[e] || '—')}</code></td></tr>`
            )
            .join('');
          return (
            `<div class="fnrow-wrap" data-search="${esc((t.name + ' ' + t.desc + ' ' + Object.values(t.map).join(' ')).toLowerCase())}" data-cat="${c.id}" id="${id}">` +
            `<div class="fnrow" style="cursor:default">` +
            `<span class="fnrow__n">${esc(t.name)}</span>` +
            `<span class="fnrow__d">${esc(t.desc)}</span>` +
            `<span class="fnrow__c">${t.ansi ? 'ANSI' : 'vendor'}</span></div>` +
            (t.notes ? `<aside class="note note--note" style="margin:8px 0 0"><p>${inline(t.notes)}</p></aside>` : '') +
            `<div class="tablewrap" style="margin-top:8px"><table><thead><tr><th scope="col">Engine</th><th scope="col">Type</th></tr></thead><tbody>${mapRows}</tbody></table></div>` +
            `</div>`
          );
        })
        .join('');
      return (
        `<section class="section" data-group id="${c.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" style="border:0;padding:0;margin:0">${esc(c.label)}</h2>` +
        `<span class="more">${items.length}</span></div><div class="fnlist">${rows}</div></section>`
      );
    })
    .join('');

  await emit('datatypes', layout({
    path: '/datatypes/',
    title: 'Data types explorer',
    description: 'Compare SQL data types across PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redshift, Snowflake, BigQuery, DuckDB and ClickHouse — numeric, character, date/time, JSON, arrays, UUID and spatial.',
    keywords: 'sql data types varchar numeric decimal timestamp timestamptz uuid json jsonb array boolean comparison',
    body:
      `<h1>Data types</h1>` +
      `<p class="lede">Every type, and what it is called in each engine. The notes are where the portability traps live — Oracle's <code>DATE</code> carrying a time, MySQL's <code>utf8</code> not being UTF-8, SQL Server's <code>UNIQUE</code> allowing one NULL.</p>` +
      `<div class="toolbar"><input class="field" style="flex:1;min-width:220px" type="search" placeholder="filter types…" data-filter-input="dtlist" aria-label="Filter data types">` +
      `<span class="toolbar__l" data-filter-count="dtlist"></span></div><div class="toolbar">${chips}</div>` +
      `<div id="dtlist">${groups}</div>`,
    sidebar: dbSidebar,
    wide: true,
  }));

  for (const t of types) {
    addDoc({
      kind: 'type',
      title: t.name,
      url: `/datatypes/#type-${slugify(t.name)}`,
      desc: t.desc,
      hay: Object.values(t.map).join(' '),
      weight: 14,
    });
  }
}

/* ------------------------------------------------------------------ *
 * /cookbook/
 * ------------------------------------------------------------------ */
{
  const recipes = cookMod.default;
  const groups = cookMod.groups
    .map((g) => {
      const items = recipes.filter((r) => r.group === g.id);
      const cards = items
        .map((r) => {
          codeExampleCount += countExamples(r.body);
          const { html } = markdown(r.body);
          return (
            `<article class="recipe" data-search="${esc((r.q + ' ' + r.tags).toLowerCase())}" data-cat="${g.id}" id="${r.id}">` +
            `<button class="recipe__q" type="button" data-toggle="${r.id}-b" aria-expanded="false">` +
            `<span class="recipe__i">$</span><span class="recipe__t">${esc(r.q)}</span><span class="recipe__x">+</span></button>` +
            `<div class="recipe__b" id="${r.id}-b" hidden>${html}</div></article>`
          );
        })
        .join('');
      return (
        `<section class="section" data-group id="${g.id}">` +
        `<div class="section__h"><h2 class="hd hd--2" style="border:0;padding:0;margin:0">${esc(g.label)}</h2>` +
        `<span class="more">${items.length}</span></div>${cards}</section>`
      );
    })
    .join('');

  const chips = cookMod.groups
    .map((g) => `<button class="chip" type="button" data-filter-cat="${g.id}" data-filter-for="cblist">${esc(g.label)}</button>`)
    .join('');

  await emit('cookbook', layout({
    path: '/cookbook/',
    title: 'SQL cookbook',
    description: 'Practical SQL recipes: find duplicates, latest row per group, running totals, moving averages, gap filling, pivoting, cohort retention, sessionization, batch deletes and more.',
    keywords: 'sql how to recipes duplicates latest row running total moving average pivot retention sessionize upsert',
    body:
      `<h1>SQL cookbook</h1>` +
      `<p class="lede">${recipes.length} problems you will actually hit, each with the portable solution, an explanation, the faster engine-specific variant, and the trap that makes the obvious answer wrong.</p>` +
      `<div class="toolbar"><input class="field" style="flex:1;min-width:220px" type="search" placeholder="search recipes…" data-filter-input="cblist" aria-label="Search recipes">` +
      `<span class="toolbar__l" data-filter-count="cblist"></span></div><div class="toolbar">${chips}</div>` +
      `<div id="cblist">${groups}</div>`,
    sidebar: sqlSidebar,
    wide: true,
  }));

  for (const r of recipes) {
    addDoc({ kind: 'recipe', title: r.q, url: `/cookbook/#${r.id}`, desc: 'Cookbook recipe', hay: r.tags, weight: 24 });
  }
}

/* ------------------------------------------------------------------ *
 * /cheatsheets/
 * ------------------------------------------------------------------ */
{
  for (const cs of cheatsheets) {
    const sections = cs.sections
      .map((s) => {
        const rows = s.rows
          .map(
            ([code, desc]) =>
              `<div class="cheat__r"><code>${esc(code)}</code><span>${inline(desc)}</span></div>`
          )
          .join('');
        return `<section><h2 class="cheat__h">${esc(s.h)}</h2><div class="cheat__rows">${rows}</div></section>`;
      })
      .join('');

    await emit(`cheatsheets/${cs.slug}`, layout({
      path: `/cheatsheets/${cs.slug}/`,
      title: `${cs.title} cheat sheet`,
      description: cs.blurb,
      keywords: `${cs.title} cheat sheet reference quick syntax printable`,
      body:
        `<h1>${esc(cs.title)} cheat sheet</h1><p class="lede">${esc(cs.blurb)}</p>` +
        `<p class="printhint">sql.manual — ${esc(cs.title)} cheat sheet</p>` +
        `<div class="toolbar"><button class="btn" type="button" onclick="window.print()">PRINT / SAVE AS PDF</button>` +
        `<a class="btn" href="/cheatsheets/">All cheat sheets</a></div>` +
        `<div class="cheatgrid">${sections}</div>`,
      sidebar: [],
      wide: true,
      meta: { engine: ENGINE_LABEL[cs.engine] || cs.engine, format: 'printable', updated: site.updated },
    }));

    addDoc({
      kind: 'cheatsheet',
      title: `${cs.title} cheat sheet`,
      url: `/cheatsheets/${cs.slug}/`,
      desc: cs.blurb,
      engine: cs.engine === 'ansi' ? '' : cs.engine,
      hay: cs.sections.map((s) => s.h + ' ' + s.rows.map((r) => r[0]).join(' ')).join(' '),
      weight: 22,
    });
  }

  const cards = cheatsheets
    .map(
      (cs) =>
        `<a class="card" href="/cheatsheets/${cs.slug}/">` +
        `<span class="card__k">${esc(ENGINE_LABEL[cs.engine] || cs.engine)}</span>` +
        `<span class="card__t">${esc(cs.title)}</span>` +
        `<span class="card__d">${esc(cs.blurb)}</span>` +
        `<span class="card__f"><span>${cs.sections.length} sections</span><span>printable</span></span></a>`
    )
    .join('');

  await emit('cheatsheets', layout({
    path: '/cheatsheets/',
    title: 'SQL cheat sheets',
    description: 'Printable SQL cheat sheets: SQL basics, joins, window functions, functions, indexes, PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redshift, Snowflake, BigQuery and the CLIs.',
    keywords: 'sql cheat sheet printable pdf reference postgresql mysql sqlite joins window functions',
    body:
      `<h1>Cheat sheets</h1>` +
      `<p class="lede">Dense single-page references, laid out in two columns and styled for printing. Use your browser's print dialog to save any of them as a PDF.</p>` +
      `<div class="cards">${cards}</div>`,
    sidebar: [],
    wide: true,
  }));
}

/* ------------------------------------------------------------------ *
 * /playground/
 * ------------------------------------------------------------------ */
{
  const sample = `-- SQL Terminal playground · SQLite (sql.js) running in your browser
-- Nothing is sent to a server. Edit and press Ctrl/Cmd + Enter.

CREATE TABLE employees (
    id      INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    dept    TEXT NOT NULL,
    salary  INTEGER NOT NULL,
    hired   TEXT NOT NULL
);

INSERT INTO employees (name, dept, salary, hired) VALUES
  ('Ada',      'Engineering', 145000, '2019-03-01'),
  ('Grace',    'Engineering', 138000, '2020-07-14'),
  ('Linus',    'Engineering', 121000, '2022-01-09'),
  ('Margaret', 'Finance',      98000, '2018-11-30'),
  ('Katherine','Finance',      93000, '2021-05-02'),
  ('Barbara',  'Marketing',    88000, '2023-02-20');

SELECT dept,
       COUNT(*)                          AS headcount,
       ROUND(AVG(salary))                AS avg_salary,
       MAX(salary) - MIN(salary)         AS spread
FROM   employees
GROUP  BY dept
ORDER  BY avg_salary DESC;`;

  const examples = [
    ['Window functions', `SELECT name, dept, salary,
       RANK()       OVER (PARTITION BY dept ORDER BY salary DESC) AS rank_in_dept,
       ROUND(AVG(salary) OVER (PARTITION BY dept))                AS dept_avg,
       salary - LAG(salary) OVER (ORDER BY salary)                AS gap_below
FROM   employees
ORDER  BY dept, rank_in_dept;`],
    ['Running total', `SELECT name, hired, salary,
       SUM(salary) OVER (ORDER BY hired ROWS UNBOUNDED PRECEDING) AS running_payroll
FROM   employees
ORDER  BY hired;`],
    ['Latest row per group', `SELECT * FROM (
  SELECT e.*, ROW_NUMBER() OVER (PARTITION BY dept ORDER BY hired DESC, id DESC) AS rn
  FROM   employees e
) t WHERE rn = 1;`],
    ['Recursive CTE', `WITH RECURSIVE days(d) AS (
  SELECT date('2026-01-01')
  UNION ALL
  SELECT date(d, '+1 day') FROM days WHERE d < date('2026-01-10')
)
SELECT d, CAST(strftime('%j', d) AS INTEGER) AS day_of_year FROM days;`],
    ['Percent of total', `SELECT dept,
       SUM(salary) AS payroll,
       ROUND(100.0 * SUM(salary) / (SELECT SUM(salary) FROM employees), 1) AS pct_of_total
FROM   employees GROUP BY dept ORDER BY payroll DESC;`],
    ['Self join', `SELECT a.name, b.name AS same_dept_colleague, a.dept
FROM   employees a
JOIN   employees b ON b.dept = a.dept AND b.id > a.id
ORDER  BY a.dept;`],
  ];

  const exampleBtns = examples
    .map((e, i) => `<button class="chip" type="button" data-example="${i}">${esc(e[0])}</button>`)
    .join('');

  await emit('playground', layout({
    path: '/playground/',
    title: 'SQL playground',
    description: 'Run SQL in your browser against a real SQLite engine compiled to WebAssembly. Nothing is sent to a server.',
    keywords: 'sql playground online editor run query sqlite wasm browser try it',
    body:
      `<h1>SQL playground</h1>` +
      `<p class="lede">A real SQLite engine compiled to WebAssembly, running entirely in this tab. Nothing is uploaded; the database is discarded when you close the page.</p>` +
      `<div class="toolbar">` +
      `<span class="toolbar__l">Engine</span>` +
      `<span class="tag"><span class="dot dot--off" data-pg-status></span><span data-pg-engine>SQLite (sql.js) · loading…</span></span>` +
      `<span class="toolbar__l" style="margin-left:auto">Examples</span>${exampleBtns}` +
      `</div>` +
      `<div class="playground__grid">` +
      `<figure class="code" style="margin:0">` +
      `<figcaption class="code__bar"><span class="code__dot"></span><span class="code__title">SQL QUERY</span>` +
      `<span class="code__actions">` +
      `<button class="code__btn" type="button" data-pg-reset>RESET</button>` +
      `<button class="code__btn" type="button" data-pg-run>RUN ▸ <kbd>⌘↵</kbd></button></span></figcaption>` +
      `<textarea class="editor" spellcheck="false" data-pg-editor aria-label="SQL editor">${esc(sample)}</textarea>` +
      `</figure>` +
      `<figure class="code result" style="margin:0">` +
      `<figcaption class="code__bar"><span class="code__dot"></span><span class="code__title">RESULTS</span>` +
      `<span class="code__actions"><button class="code__btn" type="button" data-pg-csv>COPY CSV</button></span></figcaption>` +
      `<div class="result__meta" data-pg-meta><span>ready</span></div>` +
      `<div data-pg-out><p class="palette__empty">Run a query to see results.</p></div>` +
      `</figure></div>` +
      `<aside class="note note--note"><p class="note__title">Which engine is this?</p>` +
      `<p>SQLite. Its dialect differs from PostgreSQL, MySQL and the warehouses — no <code>RIGHT JOIN</code> before 3.39, no stored procedures, dynamic type affinity, and <code>date()</code>/<code>strftime()</code> instead of <code>DATE_TRUNC</code>. ` +
      `Use the <a href="/comparison/">dialect diff</a> to translate anything you write here to another engine.</p></aside>`,
    sidebar: [],
    wide: true,
    scripts: ['/assets/playground.js'],
  }));

  addDoc({ kind: 'topic', title: 'SQL playground', url: '/playground/', desc: 'Run SQL in your browser (SQLite WASM)', weight: 20 });
}

/* ------------------------------------------------------------------ *
 * /search/
 * ------------------------------------------------------------------ */
await emit('search', layout({
  path: '/search/',
  title: 'Search',
  description: 'Search the complete SQL and database reference.',
  body:
    `<h1>Search</h1><p class="lede">Search every topic, function, operator, data type, command, engine page, cookbook recipe and cheat sheet.</p>` +
    `<div class="toolbar"><button class="btn btn--primary" type="button" data-open-palette>OPEN SEARCH · ⌘K</button></div>` +
    `<p>The command palette opens automatically. Press <kbd>⌘</kbd><kbd>K</kbd> (or <kbd>/</kbd>) anywhere on the site to reopen it.</p>`,
  sidebar: [],
}));

/* ------------------------------------------------------------------ *
 * home
 * ------------------------------------------------------------------ */
{
  const stats = [
    { v: String(engines.length), l: 'Database engines' },
    { v: `${Math.round(searchIndex.length / 50) * 50}+`, l: 'Indexed entries' },
    { v: `${Math.round(codeExampleCount / 50) * 50}+`, l: 'Code examples' },
    { v: `${fnMod.default.length}+`, l: 'Functions' },
    { v: `${operators.length}+`, l: 'Operators' },
  ];

  const quick = [
    ['SQL Fundamentals', '/sql/', 'Every construct, ANSI vs vendor'],
    ['PostgreSQL', '/databases/postgresql/', 'Types, indexes, JSONB, psql'],
    ['MySQL', '/databases/mysql/', 'InnoDB, sql_mode, JSON'],
    ['SQLite', '/databases/sqlite/', 'PRAGMAs, affinity, WAL'],
    ['SQL Server', '/databases/sqlserver/', 'T-SQL, DMVs, columnstore'],
    ['Oracle', '/databases/oracle/', 'PL/SQL, CONNECT BY, DUAL'],
    ['Redshift', '/databases/redshift/', 'Distkeys, sortkeys, COPY'],
    ['Snowflake', '/databases/snowflake/', 'Warehouses, VARIANT, cloning'],
    ['BigQuery', '/databases/bigquery/', 'Partitioning, cost control'],
  ]
    .map(
      ([label, href, desc]) =>
        `<a class="card" href="${href}"><span class="card__t">[ ${esc(label)} ]</span><span class="card__d">${esc(desc)}</span></a>`
    )
    .join('');

  const hero =
    `<section class="hero"><div class="hero__in"><div class="hero__grid"><div>` +
    `<p class="hero__cmd"><b>$</b> sql --help</p>` +
    `<pre class="hero__ascii" aria-hidden="true">${bannerHtml('SQLTERMINAL', 3)}</pre>` +
    `<h1 class="hero__wordmark">SQL <span class="dim">TERMINAL</span></h1>` +
    `<p class="hero__type">${esc(site.tagline)}</p>` +
    `<p class="hero__sub">Standard SQL, sixteen engines, and every difference between them — searchable in one keystroke.</p>` +
    `<ul class="hero__lines">` +
    `<li>Learn SQL.</li><li>Compare dialects.</li><li>Explore databases.</li><li>Query faster.</li></ul>` +
    `<button class="hero__search" type="button" data-open-palette aria-label="Open search">` +
    `<span class="p">$</span><span class="t">search "window functions"</span><span class="cursor" aria-hidden="true"></span>` +
    `<span class="search-trigger__k"><kbd>⌘</kbd><kbd>K</kbd></span></button>` +
    `<div class="hero__cta">` +
    `<a class="btn btn--primary" href="/sql/">START WITH SQL →</a>` +
    `<a class="btn" href="/comparison/">DIALECT DIFF</a>` +
    `<a class="btn" href="/playground/">PLAYGROUND</a>` +
    `<a class="btn" href="/cheatsheets/">CHEAT SHEETS</a>` +
    `</div></div>` +
    `<div class="termwin"><div class="termwin__bar"><span class="termwin__dots"><i></i><i></i><i></i></span>` +
    `<span class="termwin__t">~/sql/advanced/window-functions</span></div>` +
    `<div class="termwin__body"><pre>` +
    `<span class="p">$</span> sql --explain "latest order per customer"\n\n` +
    `<span class="c">-- PostgreSQL · fastest with (customer_id, created_at DESC)</span>\n` +
    `<span class="k">SELECT DISTINCT ON</span> (customer_id) *\n` +
    `<span class="k">FROM</span>   orders\n` +
    `<span class="k">ORDER BY</span> customer_id, created_at <span class="k">DESC</span>;\n\n` +
    `<span class="c">-- Portable · any engine with window functions</span>\n` +
    `<span class="k">SELECT</span> * <span class="k">FROM</span> (\n` +
    `  <span class="k">SELECT</span> o.*, <span class="f">ROW_NUMBER</span>() <span class="k">OVER</span> (\n` +
    `           <span class="k">PARTITION BY</span> customer_id\n` +
    `           <span class="k">ORDER BY</span> created_at <span class="k">DESC</span>) <span class="k">AS</span> rn\n` +
    `  <span class="k">FROM</span> orders o\n` +
    `) t <span class="k">WHERE</span> rn = <span class="n">1</span>;\n\n` +
    `<span class="ok">●</span> 16 engines  <span class="ok">●</span> ANSI marked  <span class="ok">●</span> differences shown` +
    `</pre></div></div>` +
    `</div>` +
    `<div class="stats">${stats.map((s) => `<div class="stat"><div class="stat__v">${esc(s.v)}</div><div class="stat__l">${esc(s.l)}</div></div>`).join('')}</div>` +
    `</div></section>`;

  const body =
    `<section class="section"><div class="section__h"><h2>Quick access</h2><a class="more" href="/databases/">all 16 engines →</a></div>` +
    `<div class="cards">${quick}</div></section>` +

    `<section class="section"><div class="section__h"><h2>Reference</h2></div>` +
    `<div class="cards">` +
    [
      ['Function encyclopedia', '/functions/', `${fnMod.default.length} functions with syntax, examples, dialect support and performance notes`],
      ['Dialect diff', '/comparison/', 'The same task written for every engine, side by side'],
      ['Data types', '/datatypes/', 'Every type and what it is called in each engine'],
      ['Operators', '/operators/', `${operators.length} operators, grouped by what they do`],
      ['Joins', '/joins/', 'Every join type with row-matching diagrams'],
      ['Window functions', '/windows/', 'Frames, ranking, offsets — and the defaults that bite'],
      ['Indexes', '/indexes/', 'B-tree, GIN, BRIN, covering, partial — and what blocks them'],
      ['Performance', '/performance/', 'Reading EXPLAIN, statistics, and a repeatable method'],
      ['Transactions', '/transactions/', 'ACID, isolation levels, MVCC, deadlocks, locking'],
      ['Administration', '/admin/', 'Privileges, backup, replication, partitioning, HA'],
      ['SQL cookbook', '/cookbook/', `${cookMod.default.length} practical "how do I…" recipes`],
      ['CLI reference', '/cli/', 'psql, mysql, sqlite3, sqlcmd, sqlplus, bq, snowsql, duckdb'],
    ]
      .map(
        ([label, href, desc]) =>
          `<a class="card" href="${href}"><span class="card__t">${esc(label)}</span><span class="card__d">${esc(desc)}</span></a>`
      )
      .join('') +
    `</div></section>` +

    `<section class="section"><div class="section__h"><h2>How this reference is written</h2></div>` +
    `<div class="minicards">` +
    `<div class="minicard"><span class="minicard__t">ANSI vs vendor, always marked</span><span class="minicard__d">Nothing is presented as universal when it is not. Every construct carries its standard revision or a vendor tag.</span></div>` +
    `<div class="minicard"><span class="minicard__t">Differences shown, not averaged</span><span class="minicard__d">Where engines diverge, both versions appear — with the reason for the divergence.</span></div>` +
    `<div class="minicard"><span class="minicard__t">Traps called out</span><span class="minicard__d"><code>NOT IN</code> with NULLs, <code>LAST_VALUE</code> frames, <code>LEFT JOIN</code> filtered in <code>WHERE</code>, unenforced warehouse constraints.</span></div>` +
    `<div class="minicard"><span class="minicard__t">Version-aware</span><span class="minicard__d">"Since 8.0", "12c and later", "3.35+" — because half of SQL portability is knowing which version you are on.</span></div>` +
    `</div></section>`;

  await emit('', layout({
    path: '/',
    title: site.name,
    description: site.description,
    keywords: 'sql reference postgresql mysql sqlite sql server oracle bigquery snowflake redshift duckdb cheat sheet dialect comparison functions',
    hero,
    body,
    sidebar: [],
    wide: true,
    showCrumb: false,
  }));
}

/* ------------------------------------------------------------------ *
 * assets, index, sitemap, 404
 * ------------------------------------------------------------------ */

await cp(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });

await writeFile(path.join(OUT, 'search-index.json'), JSON.stringify({ docs: searchIndex }), 'utf8');

const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  [...new Set(pages)]
    .sort()
    .map((p) => `  <url><loc>${site.url}${p}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n') +
  `\n</urlset>\n`;
await writeFile(path.join(OUT, 'sitemap.xml'), sitemap, 'utf8');

await writeFile(
  path.join(OUT, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${site.url}/sitemap.xml\n`,
  'utf8'
);

await writeFile(
  path.join(OUT, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#0c0e10"/><path d="M6 11l5 5-5 5" stroke="#3fd68c" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 21h11" stroke="#3fd68c" stroke-width="2.5" stroke-linecap="round"/></svg>`,
  'utf8'
);

// GitHub Pages: don't run Jekyll over the output
await writeFile(path.join(OUT, '.nojekyll'), '', 'utf8');

const notFound = layout({
  path: '/404/',
  title: '404 — not found',
  description: 'Page not found.',
  body:
    `<div class="termwin" style="max-width:640px;margin:40px auto"><div class="termwin__bar"><span class="termwin__dots"><i></i><i></i><i></i></span><span class="termwin__t">error</span></div>` +
    `<div class="termwin__body"><pre><span class="p">$</span> sql --find "$REQUEST_URI"\n\n<span class="c">ERROR:  relation "page" does not exist</span>\n<span class="c">LINE 1: SELECT * FROM page WHERE url = …</span>\n\nHINT:   try the search palette, or start from one of these:</pre></div></div>` +
    `<div class="cards" style="max-width:640px;margin:0 auto">` +
    `<a class="card" href="/"><span class="card__t">Home</span></a>` +
    `<a class="card" href="/sql/"><span class="card__t">SQL reference</span></a>` +
    `<a class="card" href="/databases/"><span class="card__t">Database explorer</span></a>` +
    `<a class="card" href="/functions/"><span class="card__t">Functions</span></a>` +
    `</div>`,
  sidebar: [],
  wide: true,
  showCrumb: false,
});
await writeFile(path.join(OUT, '404.html'), notFound, 'utf8');

/* ------------------------------------------------------------------ *
 * report
 * ------------------------------------------------------------------ */

let bytes = 0;
async function measure(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await measure(p);
    else bytes += (await stat(p)).size;
  }
}
await measure(OUT);

console.log(`
  SQL TERMINAL — build complete
  ─────────────────────────────────────────
  pages            ${new Set(pages).size}
  search entries   ${searchIndex.length}
  code examples    ${codeExampleCount}
  functions        ${fnMod.default.length}
  operators        ${operators.length}
  data types       ${dtMod.default.length}
  cookbook recipes ${cookMod.default.length}
  cheat sheets     ${cheatsheets.length}
  engines          ${engines.length}
  output           ${(bytes / 1024 / 1024).toFixed(2)} MB → docs/
`);

if (process.argv.includes('--serve')) {
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.wasm': 'application/wasm' };
  createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    let file = path.join(OUT, p);
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end(await readFile(path.join(OUT, '404.html')).catch(() => 'not found'));
    }
  }).listen(4321, () => console.log('  serving http://localhost:4321\n'));
}
