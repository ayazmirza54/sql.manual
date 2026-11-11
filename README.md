# SQL Terminal

**The complete SQL & database reference.** A zero-dependency static site covering ANSI SQL and 16 database
engines, with a searchable function encyclopedia, a dialect-diff engine, a data-type explorer, a cookbook,
printable cheat sheets and an in-browser SQL playground.

```
$ sql --help

SQL TERMINAL
The complete SQL & database reference.

> Learn SQL.
> Compare dialects.
> Explore databases.
> Query faster.
```

---

## What it covers

| Section | Contents |
| --- | --- |
| **SQL reference** | Basics, DDL, DML, querying, joins, subqueries, CTEs, set operations, advanced SQL |
| **Database explorer** | PostgreSQL, MySQL, SQLite, SQL Server, Oracle, Redshift, Snowflake, BigQuery, DuckDB, MariaDB, ClickHouse, Trino, Databricks, CockroachDB, Db2, Synapse |
| **Function encyclopedia** | 95 functions across 14 categories — syntax, return type, example, use cases, dialect support, performance notes |
| **Dialect diff** | The same task written for every engine, side by side, with support badges |
| **Data types** | Every type mapped across 10 engines, with the portability traps |
| **Operators & commands** | 74 operators and 40+ statements, filterable |
| **Engineering** | Indexes, query plans & performance, transactions & isolation, administration |
| **Cookbook** | 17 practical "how do I…" recipes |
| **Cheat sheets** | 15 printable single-page references |
| **Playground** | SQLite compiled to WebAssembly, running entirely in the browser |

Every construct is marked as ANSI standard or vendor-specific. Where engines differ, both versions are shown
rather than averaged into something that works nowhere.

## Running it

```bash
node build/build.mjs           # build into docs/
node build/build.mjs --serve   # build and serve on http://localhost:4321
node build/check-links.mjs     # verify every internal link and anchor resolves
```

There are no dependencies and no install step. Node 18+ is the only requirement.

## Architecture

```
content/                 all content lives here — add files, the site picks them up
  site.mjs               site config (incl. colour scheme: ember or lime), engine registry, navigation
  sql/                   SQL topics, grouped into ordered sections
    basics.mjs  ddl.mjs  dml.mjs  querying.mjs  joins.mjs  relational.mjs  advanced.mjs
  databases/             per-engine explorer pages
  pages/                 standalone hub pages (indexes, performance, transactions, admin, cli)
  functions.mjs          function encyclopedia
  operators.mjs          operator reference
  datatypes.mjs          cross-engine type mapping
  comparison.mjs         dialect-diff tasks
  commands.mjs           statement reference
  cookbook.mjs           recipes
  cheatsheets.mjs        printable sheets
build/
  md.mjs                 markdown subset parser + SQL/shell syntax highlighter
  layout.mjs             HTML shell, navigation, SEO metadata, command palette
  pixel.mjs              pixel icons drawn on 12x12 grids, rendered as crisp SVG
  build.mjs              the generator
  check-links.mjs        link and anchor validation
assets/
  styles.css             the design system
  app.js                 command palette, search, copy buttons, theme, scrollspy
  joins.js  comparison.js  playground.js
  fonts/                 Departure Mono, Instrument Sans, Martian Mono (SIL OFL), self-hosted
  vendor/                sql.js (SQLite → WebAssembly), vendored so the playground works offline
docs/                    generated output — served by GitHub Pages
```

### Content format

Topics are plain JS objects with a markdown body. The parser supports a deliberate subset — headings,
tables, lists, links, admonitions, and fenced code with a title and engine tag. Fences use `~~~` rather than
backticks so the content can live inside JS template literals.

```js
{
  slug: 'null',
  title: 'NULL & three-valued logic',
  category: 'Basics',
  difficulty: 'beginner',
  standard: 'SQL-92',
  summary: 'NULL is not a value…',
  keywords: 'null coalesce nvl ifnull three valued logic',
  body: `
## The truth tables

~~~sql title="Never do this" engine="ansi" run
SELECT * FROM employees WHERE manager_id = NULL;   -- 0 rows, always
~~~

::: danger NOT IN with NULLs returns nothing
…
:::

:::support
postgresql=y mysql=w~different_syntax sqlite=n
:::
`,
  related: [{ label: 'Constraints', href: '/sql/constraints/' }],
}
```

Directives available in a body:

| Directive | Renders |
| --- | --- |
| `::: note / tip / warn / danger [title]` | Coloured admonition |
| `:::support pg=y mysql=w~note sqlite=n` | Dialect support badges (✓ / ⚠ / ✕ / ◐) |
| `:::kv LABEL :: value` | Metadata table |
| `:::cards Label :: /href/ :: description` | Card grid |
| `:::terminal` | Terminal block |
| `~~~sql title="…" engine="postgresql" run` | Code block with COPY, engine tag and TRY IT |

### Adding a new engine

1. Add an entry to `engines` in `content/site.mjs` (id, name, colour, CLI, version, blurb).
2. Add `content/databases/<id>.mjs` exporting `{ id, summary, body }`.
3. Optionally add a column to the feature matrix in `build/build.mjs` and entries in `content/comparison.mjs`.
4. Rebuild.

The explorer page, sidebar, dialect matrix, search index and sitemap all update automatically.

## Search

`⌘K` (or `/`) opens a command palette backed by a generated `search-index.json` — 640+ entries covering every
topic, `h2` heading, function, operator, data type, command, engine page, recipe and cheat sheet. Ranking
combines exact/prefix/substring matching on titles, token matching on body text, a fuzzy subsequence fallback
and an authored weight per document kind. Results are keyboard-navigable and filterable by kind with `Tab`.

## Design

Dark-first, with a light theme that persists in `localStorage`. System font stacks only — no webfonts, no
network requests on any page except the playground's WebAssembly module. Total page weight is a stylesheet, a
small script, and the HTML.

Cheat sheets carry a dedicated print stylesheet: two-column layout, light palette, navigation and interactive
chrome removed, so `Print → Save as PDF` produces a usable handout.

## Accuracy

Content is hand-written and version-aware. Statements about behaviour are scoped to the engines and versions
they apply to — "MySQL 8.0.20+", "PostgreSQL 12+", "Oracle 12c and later" — because most of SQL portability is
knowing which version you are on. If you find something wrong or out of date, corrections are welcome.

## Deployment

`.github/workflows/pages.yml` builds the site, runs the link checker, and publishes `docs/` to GitHub Pages on
every push to `main`. The output is fully static and can be hosted anywhere.

## License

MIT for the code. Vendored `sql.js` is MIT — see `assets/vendor/sql.js-LICENSE.txt`.
