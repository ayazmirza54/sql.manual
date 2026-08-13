export default {
  slug: 'indexes',
  path: '/indexes/',
  title: 'Indexes',
  category: 'Performance',
  difficulty: 'intermediate',
  standard: 'Vendor-specific',
  summary: 'Index structures (B-tree, hash, GiST, GIN, BRIN, columnstore), composite and covering indexes, selectivity, and how to tell whether an index is doing anything.',
  keywords: 'index b-tree hash gist gin brin clustered nonclustered composite covering partial filtered functional selectivity cardinality index only scan',
  body: `
An index is a redundant, ordered copy of some columns that lets the engine find rows without reading the whole table. Every index makes reads faster and writes slower — that trade-off is the whole subject.

## The structures

| Type | Answers | Engines |
| --- | --- | --- |
| **B-tree** | \`=\`, \`<\`, \`>\`, \`BETWEEN\`, \`IN\`, prefix \`LIKE 'a%'\`, \`ORDER BY\`, \`MIN\`/\`MAX\` | Everywhere; the default |
| **Hash** | \`=\` only | PostgreSQL, MySQL/MEMORY, Oracle (cluster), SQL Server (in-memory) |
| **GiST** | Geometry, ranges, nearest-neighbour, containment | PostgreSQL |
| **GIN** | Elements *inside* a composite value: array items, JSONB keys, text lexemes | PostgreSQL |
| **BRIN** | Huge, naturally-ordered tables — stores min/max per block range | PostgreSQL |
| **SP-GiST** | Non-balanced structures: quadtrees, tries, IP prefixes | PostgreSQL |
| **Bitmap** | Low-cardinality columns in a read-mostly warehouse | Oracle, Db2 |
| **Columnstore** | Analytical scans and aggregation over many rows | SQL Server, Oracle (in-memory), Synapse |
| **Full-text** | Word and phrase matching with ranking | All (different names) |
| **Zone map / min-max** | Block-level pruning; automatic, not created by you | Redshift, Snowflake, BigQuery, ClickHouse |

::: note Columnar engines do not have indexes in the usual sense
Redshift, Snowflake, BigQuery and Databricks have no \`CREATE INDEX\` for scan pruning. Performance comes from **sort keys / clustering keys / partitioning**, which physically order the data so block-level min/max metadata can skip whole ranges. Advice written for PostgreSQL does not transfer — see each engine's page.
:::

## Creating indexes

~~~sql title="The forms you will actually write" engine="ansi" run
CREATE INDEX idx_orders_customer ON orders (customer_id);
CREATE UNIQUE INDEX uq_users_email ON users (email);
CREATE INDEX idx_orders_cust_date ON orders (customer_id, created_at DESC);   -- composite
CREATE INDEX idx_users_lower_email ON users (lower(email));                    -- functional
CREATE INDEX idx_orders_open ON orders (created_at) WHERE status = 'open';     -- partial
DROP INDEX idx_orders_customer;                                                -- MySQL: DROP INDEX … ON t
~~~

~~~sql title="Without blocking writes" engine="postgresql"
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);   -- PostgreSQL
CREATE INDEX idx_orders_customer ON orders (customer_id) WITH (ONLINE = ON);  -- SQL Server Enterprise
ALTER TABLE orders ADD INDEX idx_c (customer_id), ALGORITHM=INPLACE, LOCK=NONE;  -- MySQL
CREATE INDEX idx_orders_customer ON orders (customer_id) ONLINE;         -- Oracle
~~~

## Composite indexes and column order

An index on \`(a, b, c)\` is usable for a leading prefix of its columns — \`a\`, \`(a, b)\`, \`(a, b, c)\` — and **not** for \`b\` alone or \`(b, c)\`.

~~~sql title="One index, four queries" engine="ansi"
CREATE INDEX idx ON orders (customer_id, status, created_at);

WHERE customer_id = 1                                    -- ✓ uses the index
WHERE customer_id = 1 AND status = 'paid'                -- ✓ uses both columns
WHERE customer_id = 1 AND status = 'paid' AND created_at > …  -- ✓ full use
WHERE status = 'paid'                                    -- ✗ cannot seek (may still scan the index)
~~~

**Ordering rule:** equality columns first, then the range/sort column last.

~~~sql title="Why the order matters" engine="ansi"
-- Query: WHERE customer_id = 1 AND created_at >= '2026-01-01' ORDER BY created_at
CREATE INDEX good ON orders (customer_id, created_at);   -- seek to customer, then range scan, already sorted
CREATE INDEX bad  ON orders (created_at, customer_id);   -- scans every row in the date range, filters after
~~~

::: tip A composite index replaces the single-column index on its first column
\`(a, b)\` makes a separate index on \`(a)\` redundant — drop it. It does **not** replace an index on \`(b)\`.
:::

## Covering indexes and index-only scans

If an index contains every column a query touches, the engine can answer from the index alone and never read the table.

~~~sql title="INCLUDE adds payload columns without widening the key" engine="postgresql" run
CREATE INDEX idx_orders_cover ON orders (customer_id) INCLUDE (total, status);

-- Answered entirely from the index:
SELECT total, status FROM orders WHERE customer_id = 42;
--   Index Only Scan using idx_orders_cover on orders
--     Heap Fetches: 0                            ← 0 means fully covered
~~~

:::support
postgresql=y~11+_INCLUDE sqlserver=y~INCLUDE oracle=y~implicit db2=y~INCLUDE cockroachdb=y~STORING mysql=w~all_columns_in_key sqlite=w~all_columns_in_key mariadb=n
:::

::: warn PostgreSQL index-only scans need a visible page
PostgreSQL must still check row visibility in the visibility map. If the table has not been vacuumed recently, \`Heap Fetches\` will be high and the "index-only" scan is not much faster than a normal one. Keep autovacuum healthy.
:::

## Partial / filtered indexes

Index only the rows you query. Smaller index, cheaper writes, and it can enforce conditional uniqueness.

~~~sql title="Index 2% of the table instead of 100%" engine="postgresql" run
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
CREATE UNIQUE INDEX uq_one_default_card ON cards (user_id) WHERE is_default;
~~~

:::support
postgresql=y sqlserver=y~filtered_index sqlite=y duckdb=y cockroachdb=y mongodb=y oracle=w~function_based_trick mysql=n mariadb=n bigquery=n snowflake=n
:::

~~~sql title="Oracle's trick — NULLs are not indexed in a B-tree" engine="oracle"
CREATE INDEX idx_orders_pending ON orders (CASE WHEN status = 'pending' THEN created_at END);
-- Rows where the expression is NULL are not stored, so the index only covers pending orders.
~~~

## Selectivity — when an index is worth using

Selectivity is the fraction of rows a predicate keeps. An index helps when that fraction is small; below roughly 5–20% of the table (engine and row-width dependent) a sequential scan is genuinely faster, because random I/O per row costs more than reading everything in order.

~~~sql title="Measuring it" engine="postgresql" run
SELECT status,
       COUNT(*),
       ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) AS pct
FROM   orders GROUP BY status ORDER BY 2 DESC;
~~~

~~~text title="Verdict"
status    | count     | pct
----------+-----------+-------
completed | 4,812,003 | 96.24   ← indexing this value is pointless
pending   |   142,880 |  2.86   ← a partial index here is excellent
failed    |    45,117 |  0.90   ← very selective
~~~

::: note "The index is not being used" is often correct behaviour
If the planner estimates the predicate matches most of the table, ignoring the index is the right call. Before forcing it, check whether the *estimate* is wrong — stale statistics, a correlated multi-column predicate, or a data skew the planner cannot see. \`ANALYZE\` first.
:::

## What blocks an index

| Pattern | Why | Fix |
| --- | --- | --- |
| \`WHERE YEAR(d) = 2026\` | Column wrapped in a function | Range predicate, or a functional index |
| \`WHERE a + 0 = 5\` | Expression on the column | Rewrite as \`a = 5\` |
| \`WHERE col LIKE '%x'\` | Leading wildcard | Trigram/full-text index, or a reversed column |
| \`WHERE id = '42'\` (int column) | Implicit cast on the column side | Match the parameter type |
| \`WHERE a = 1 OR b = 2\` | Two different columns | Two indexes + bitmap OR, or a \`UNION ALL\` |
| Low selectivity | Most rows match | Partial index, or accept the scan |
| Stale statistics | Planner mis-estimates | \`ANALYZE\` / \`UPDATE STATISTICS\` |
| \`ORDER BY a ASC, b DESC\` | Index direction mismatch | \`CREATE INDEX … (a ASC, b DESC)\` |

::: danger Implicit casts silently disable indexes
If \`user_id\` is \`BIGINT\` and the driver sends a string, some engines cast the *column* rather than the parameter, discarding the index for the whole table. In MySQL this is also a correctness hazard: comparing a string column to a number coerces both to floats. Match your parameter types.
:::

## Finding unused and missing indexes

~~~sql title="PostgreSQL — indexes never scanned" engine="postgresql"
SELECT schemaname, relname AS table, indexrelname AS index,
       idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM   pg_stat_user_indexes
WHERE  idx_scan = 0 AND indexrelid NOT IN (SELECT conindid FROM pg_constraint)
ORDER  BY pg_relation_size(indexrelid) DESC;
~~~

~~~sql title="PostgreSQL — tables taking sequential scans" engine="postgresql"
SELECT relname, seq_scan, seq_tup_read, idx_scan,
       seq_tup_read / NULLIF(seq_scan, 0) AS avg_rows_per_seq_scan
FROM   pg_stat_user_tables
WHERE  seq_scan > 0
ORDER  BY seq_tup_read DESC LIMIT 20;
~~~

~~~sql title="MySQL" engine="mysql"
SELECT * FROM sys.schema_unused_indexes;
SELECT * FROM sys.schema_redundant_indexes;
~~~

~~~sql title="SQL Server" engine="sqlserver"
SELECT OBJECT_NAME(s.object_id) AS table_name, i.name, s.user_seeks, s.user_scans, s.user_updates
FROM   sys.dm_db_index_usage_stats s
JOIN   sys.indexes i ON i.object_id = s.object_id AND i.index_id = s.index_id
WHERE  s.database_id = DB_ID() AND s.user_seeks + s.user_scans = 0
ORDER  BY s.user_updates DESC;   -- pure write cost, zero read benefit

SELECT * FROM sys.dm_db_missing_index_details;   -- suggestions, not gospel
~~~

::: warn Every index costs writes and space
Each \`INSERT\` updates every index on the table; each \`UPDATE\` updates every index containing a changed column. Ten indexes on a hot table can halve write throughput. Indexes also compete for buffer cache with the data itself.

SQL Server's "missing index" DMVs suggest wide, overlapping indexes with no awareness of what already exists — treat them as a hint to investigate, never as a script to run.
:::

## Maintenance

| Engine | Bloat / fragmentation | Rebuild |
| --- | --- | --- |
| PostgreSQL | B-tree bloat from updates and deletes | \`REINDEX INDEX CONCURRENTLY\` (12+), or \`pg_repack\` |
| MySQL/InnoDB | Page splits, fill factor | \`OPTIMIZE TABLE\` / \`ALTER TABLE … FORCE\` |
| SQL Server | Logical fragmentation | \`ALTER INDEX … REORGANIZE\` (<30%) or \`REBUILD\` (>30%) |
| Oracle | Rarely needed | \`ALTER INDEX … REBUILD ONLINE\` |

~~~sql title="PostgreSQL: checking index bloat and health" engine="postgresql"
SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS size, idx_scan
FROM   pg_stat_user_indexes ORDER BY pg_relation_size(indexrelid) DESC LIMIT 20;

-- invalid indexes left behind by a failed CREATE INDEX CONCURRENTLY:
SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
~~~
`,
  related: [
    { label: 'Performance & query plans', href: '/performance/' },
    { label: 'WHERE & sargability', href: '/sql/where/#sargability-predicates-an-index-can-use' },
    { label: 'Constraints', href: '/sql/constraints/' },
    { label: 'Database explorer', href: '/databases/' },
  ],
};
