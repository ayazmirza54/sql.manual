export default {
  id: 'sqlite',
  summary: 'A library, not a server. The most deployed database engine in the world — with type affinity and per-connection PRAGMAs to understand.',
  body: `
## Overview

SQLite is not a client/server database. It is a C library that reads and writes an ordinary file, linked directly into your process. There is no daemon, no port, no configuration file and no user accounts — access control is filesystem permissions.

It ships in every Android and iOS device, every major browser, Python, and countless embedded systems, which makes it the most widely deployed database engine in existence.

:::kv
FIRST RELEASE :: 2000
LICENSE :: Public domain
CURRENT :: 3.50.x
DEPLOYMENT :: In-process library; one file per database
CONCURRENCY :: Many readers, ONE writer (WAL mode)
DEFAULT ISOLATION :: SERIALIZABLE
BEST FOR :: Embedded storage, application file formats, tests, edge/local-first apps, small-to-medium web apps
:::

::: note SQLite competes with fopen(), not with PostgreSQL
The official framing is worth internalising. SQLite replaces bespoke file formats, not database servers. That said, a single-server web application with a read-heavy workload and WAL enabled runs perfectly well on SQLite — the limit is concurrent *writers*, not data volume (the file limit is 281 TB).
:::

## Architecture

~~~text title="One file, a few structures"
app.db          the database: B-trees for every table and index
app.db-wal      write-ahead log (WAL mode)
app.db-shm      shared-memory index for the WAL
~~~

Every table is a B-tree keyed by \`rowid\` (an implicit 64-bit integer) unless declared \`WITHOUT ROWID\`, in which case it clusters on the declared primary key. \`INTEGER PRIMARY KEY\` is special-cased as an alias for \`rowid\` — it costs nothing extra and is the cheapest key available.

## Installation

~~~bash title="Install"
sudo apt install sqlite3            # CLI; the library is almost certainly already present
brew install sqlite
python3 -c "import sqlite3; print(sqlite3.sqlite_version)"   # already available everywhere
~~~

## CLI

~~~bash title="sqlite3"
sqlite3 app.db                                   # opens or creates
sqlite3 :memory:                                 # in-memory
sqlite3 -csv -header app.db "SELECT * FROM t" > out.csv
~~~

~~~text title="Dot commands"
.tables  .schema t  .indexes t       .mode box|csv|json|markdown
.headers on   .timer on   .eqp on    .import data.csv t
.backup backup.db                    .dump
.read script.sql                     .expert      -- index suggestions
.quit
~~~

## PRAGMAs — the configuration surface

~~~sql title="The settings that matter" engine="sqlite" run
PRAGMA foreign_keys = ON;        -- OFF by default, and PER CONNECTION
PRAGMA journal_mode = WAL;       -- persistent; readers no longer block the writer
PRAGMA synchronous = NORMAL;     -- safe under WAL, much faster than FULL
PRAGMA busy_timeout = 5000;      -- wait 5 s instead of failing with SQLITE_BUSY
PRAGMA cache_size = -64000;      -- 64 MB of page cache (negative = KiB)
PRAGMA temp_store = MEMORY;
PRAGMA optimize;                 -- run before closing a long-lived connection
PRAGMA integrity_check;
~~~

::: danger foreign_keys is OFF by default
For backwards compatibility, SQLite parses foreign key declarations and does not enforce them unless \`PRAGMA foreign_keys = ON\` is executed on **each connection**. Connection pools must set it in their per-connection initialisation, not once at startup.
:::

## Type affinity

SQLite is dynamically typed. Declared column types are *affinities* — hints about preferred storage — not constraints.

| Declared type contains | Affinity | Stores |
| --- | --- | --- |
| \`INT\` | INTEGER | 1–8 byte signed integer |
| \`CHAR\`, \`CLOB\`, \`TEXT\` | TEXT | UTF-8/16 string |
| \`BLOB\` or nothing | BLOB | Bytes, as-is |
| \`REAL\`, \`FLOA\`, \`DOUB\` | REAL | 8-byte IEEE float |
| anything else | NUMERIC | Integer if it fits, else real, else text |

~~~sql title="This is legal in a non-STRICT table" engine="sqlite"
CREATE TABLE t (age INTEGER);
INSERT INTO t VALUES ('not a number');   -- accepted, stored as TEXT
~~~

~~~sql title="STRICT tables (3.37+) enforce types" engine="sqlite" run
CREATE TABLE t (
    id   INTEGER PRIMARY KEY,
    age  INTEGER NOT NULL,
    name TEXT NOT NULL
) STRICT;
INSERT INTO t VALUES (1, 'abc', 'x');   -- Error: cannot store TEXT value in INTEGER column
~~~

There are no native \`DATE\`, \`TIME\` or \`BOOLEAN\` types. Store ISO-8601 text (\`'2026-08-13T09:15:00Z'\`) — it sorts and compares correctly — or a Unix integer, and use \`0\`/\`1\` for booleans.

## What SQLite does not have

| Missing | Workaround |
| --- | --- |
| \`ALTER TABLE\` beyond ADD/DROP/RENAME COLUMN | The [12-step table rebuild](/sql/alter/#sqlite-the-twelve-step-rebuild) |
| Stored procedures, triggers in a procedural language | Application code (SQL triggers do exist) |
| \`GRANT\` / \`REVOKE\` / users | Filesystem permissions |
| \`RIGHT\`/\`FULL OUTER JOIN\` before 3.39 | Swap the tables, or use a UNION |
| \`ANY\`/\`ALL\` quantifiers | \`IN\` / \`EXISTS\` |
| Materialized views | A real table plus a refresh routine |
| Concurrent writers | Queue writes; WAL allows concurrent *readers* |

## What it has that surprises people

~~~sql title="Genuinely useful features" engine="sqlite" run
-- Window functions (3.25+), CTEs, RETURNING (3.35+), UPSERT, JSON, generated columns
INSERT INTO t (a) VALUES (1) ON CONFLICT (a) DO UPDATE SET b = excluded.b RETURNING *;

-- Full-text search with BM25 ranking
CREATE VIRTUAL TABLE docs_fts USING fts5(title, body);
SELECT *, bm25(docs_fts) AS rank FROM docs_fts WHERE docs_fts MATCH 'sql AND index' ORDER BY rank;

-- Query another database file in the same statement
ATTACH DATABASE 'archive.db' AS arc;
INSERT INTO arc.orders SELECT * FROM main.orders WHERE created_at < '2025-01-01';
~~~

## Performance

::: tip The single biggest speedup
Wrap inserts in an explicit transaction. Each unwrapped \`INSERT\` is its own transaction with its own fsync — roughly 100/second on spinning media. Batched inside one transaction, the same inserts run at tens of thousands per second.

~~~sql
BEGIN;
  INSERT INTO t VALUES (…);   -- ×10,000
COMMIT;
~~~
:::

~~~sql title="Other levers" engine="sqlite"
PRAGMA journal_mode = WAL;      -- concurrent readers, faster commits
PRAGMA synchronous = NORMAL;    -- safe with WAL
ANALYZE;                        -- populate sqlite_stat1 so the planner has statistics
EXPLAIN QUERY PLAN SELECT …;    -- readable plan output
~~~

Use prepared statements (they avoid reparsing), keep indexes on your filter and join columns, and remember that \`SELECT COUNT(*)\` is a full B-tree scan.

## Backup

~~~bash title="Never copy an open database file"
sqlite3 app.db ".backup 'backup.db'"     # safe online backup (uses the backup API)
sqlite3 app.db ".dump" > app.sql         # logical dump
sqlite3 app.db "VACUUM INTO 'compact.db'"  # 3.27+: backup and compact in one step
~~~

Copying \`app.db\` with \`cp\` while a writer is active produces a corrupt file — the WAL and shm contents are not included and the page state may be mid-transaction.

## Best practices

- Turn on \`foreign_keys\` in every connection's setup.
- Use WAL mode plus \`busy_timeout\` for any application with more than one connection.
- Use \`STRICT\` tables in new schemas.
- Prefer \`INTEGER PRIMARY KEY\` (it aliases rowid); skip \`AUTOINCREMENT\` unless you truly need id reuse prevented.
- Store timestamps as ISO-8601 text in UTC.
- Batch writes in transactions.
- Run \`ANALYZE\` after significant data changes and \`PRAGMA optimize\` before closing long-lived connections.
- Serialise writes through a single connection or a queue — SQLite allows exactly one writer.
`,
};
