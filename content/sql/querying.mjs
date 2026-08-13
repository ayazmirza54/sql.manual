export const section = { id: 'querying', title: 'Querying', order: 4 };

export default [
  {
    slug: 'where',
    title: 'WHERE & predicates',
    category: 'Querying',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Filtering rows: comparison, BETWEEN, IN, LIKE, pattern matching, and writing predicates an index can use.',
    keywords: 'where filter predicate between in like ilike regexp sargable index scan comparison operators',
    body: `
\`WHERE\` filters individual rows before grouping. A row survives only when the predicate evaluates to \`TRUE\` — \`FALSE\` and \`UNKNOWN\` are both discarded.

~~~sql title="The predicate vocabulary" engine="ansi" run
SELECT * FROM orders
WHERE  status = 'paid'                                -- equality
  AND  total BETWEEN 100 AND 500                      -- inclusive range
  AND  country IN ('DE', 'FR', 'ES')                  -- set membership
  AND  created_at >= DATE '2026-01-01'                -- range
  AND  notes IS NOT NULL                              -- null test
  AND  email LIKE '%@example.com'                     -- pattern
  AND  NOT cancelled;                                 -- boolean negation
~~~

## Comparison operators

| Operator | Meaning | Notes |
| --- | --- | --- |
| \`=\` \`<>\` | Equal, not equal | \`!=\` is accepted everywhere but \`<>\` is the standard spelling |
| \`<\` \`<=\` \`>\` \`>=\` | Ordering | Uses the column's collation for text |
| \`BETWEEN a AND b\` | \`x >= a AND x <= b\` | **Inclusive on both ends** |
| \`IN (…)\` | Set membership | Beware \`NULL\` with \`NOT IN\` |
| \`LIKE\` / \`NOT LIKE\` | Pattern, \`%\` and \`_\` wildcards | Case sensitivity is engine- and collation-dependent |
| \`IS NULL\` / \`IS NOT NULL\` | Null test | The only correct way to test for NULL |
| \`IS DISTINCT FROM\` | NULL-safe inequality | PostgreSQL, Db2, DuckDB, Trino, CockroachDB |
| \`EXISTS\` | Subquery returns ≥ 1 row | Usually the best anti/semi-join form |

::: warn BETWEEN and timestamps
\`created_at BETWEEN '2026-01-01' AND '2026-01-31'\` excludes almost all of 31 January, because the literal means midnight. Use a half-open range instead — it is correct for dates, timestamps and any precision:

~~~sql
WHERE created_at >= DATE '2026-01-01'
  AND created_at <  DATE '2026-02-01'
~~~
:::

## Pattern matching

~~~sql title="LIKE" engine="ansi" run
WHERE email LIKE 'a%'          -- starts with a       (index-usable)
WHERE email LIKE '%@gmail.com' -- ends with           (not index-usable)
WHERE email LIKE '_@x.com'     -- exactly one char before @
WHERE path  LIKE '100\\%%' ESCAPE '\\'   -- literal percent sign
~~~

| Need | PostgreSQL | MySQL | SQL Server | Oracle | SQLite | BigQuery |
| --- | --- | --- | --- | --- | --- | --- |
| Case-insensitive LIKE | \`ILIKE\` | \`LIKE\` (CI collation default) | \`LIKE\` (CI collation default) | \`LIKE\` + \`UPPER()\` | \`LIKE\` (ASCII CI) | \`LOWER() LIKE\` |
| Regex match | \`~\` \`~*\` \`!~\` | \`REGEXP\` / \`RLIKE\` | \`LIKE\` only (or CLR) | \`REGEXP_LIKE()\` | \`REGEXP\` if compiled | \`REGEXP_CONTAINS()\` |
| Char class | \`[[:digit:]]\` | \`[[:digit:]]\` | \`[0-9]\` in \`LIKE\` | \`\\d\` | — | \`\\d\` |

~~~sql title="Regex, per engine" engine="ansi"
-- PostgreSQL
WHERE phone ~ '^\\+?[0-9]{10,14}$'
-- MySQL 8 / MariaDB
WHERE phone REGEXP '^\\\\+?[0-9]{10,14}$'
-- Oracle
WHERE REGEXP_LIKE(phone, '^\\+?[0-9]{10,14}$')
-- BigQuery / Databricks / Snowflake
WHERE REGEXP_CONTAINS(phone, r'^\\+?[0-9]{10,14}$')
-- SQL Server has no regex: use LIKE with character classes
WHERE phone LIKE '[0-9][0-9][0-9]%'
~~~

## Sargability — predicates an index can use

A predicate is **sargable** (Search ARGument able) when the engine can turn it into an index range scan. Wrapping the column in a function almost always destroys that.

~~~sql title="Not sargable → full scan" engine="ansi"
WHERE YEAR(created_at) = 2026
WHERE UPPER(email) = 'A@B.COM'
WHERE total + 0 > 100
WHERE CAST(id AS TEXT) = '42'
WHERE email LIKE '%@example.com'
~~~

~~~sql title="Sargable rewrites → index range scan" engine="ansi" run
WHERE created_at >= DATE '2026-01-01' AND created_at < DATE '2027-01-01'
WHERE email = 'a@b.com'          -- with a case-insensitive collation, or:
WHERE total > 100
WHERE id = 42
WHERE reversed_email LIKE 'moc.elpmaxe@%'   -- or a trigram index, see below
~~~

When you genuinely need the function, index the *expression*:

~~~sql title="Functional / computed indexes" engine="postgresql"
CREATE INDEX idx_users_lower_email ON users (lower(email));   -- PostgreSQL, SQLite, Oracle
-- then this becomes an index scan:
SELECT * FROM users WHERE lower(email) = 'a@b.com';
~~~
~~~sql title="Equivalents" engine="sqlserver"
-- SQL Server: computed column + index
ALTER TABLE users ADD email_lower AS LOWER(email) PERSISTED;
CREATE INDEX idx_users_email_lower ON users (email_lower);
-- MySQL 8: functional index
CREATE INDEX idx_users_email_lower ON users ((LOWER(email)));
~~~

For leading-wildcard search, use the engine's text search machinery rather than \`LIKE '%x%'\`:

~~~sql title="Trigram index makes LIKE '%foo%' fast" engine="postgresql"
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_products_name_trgm ON products USING GIN (name gin_trgm_ops);
SELECT * FROM products WHERE name ILIKE '%widget%';   -- now an index scan
~~~

## Operator precedence

\`NOT\` binds tighter than \`AND\`, which binds tighter than \`OR\`. Mixing them without parentheses is a classic bug:

~~~sql title="These mean different things" engine="ansi"
WHERE status = 'paid' OR status = 'shipped' AND total > 100
-- parses as:  status='paid' OR (status='shipped' AND total>100)

WHERE (status = 'paid' OR status = 'shipped') AND total > 100
-- almost certainly what was meant
~~~

## Common table-driven filters

~~~sql title="Row constructors compare tuples" engine="postgresql" run
-- keyset pagination: "the page after (created_at, id)"
WHERE (created_at, id) < (TIMESTAMP '2026-03-01 12:00', 918273)
ORDER BY created_at DESC, id DESC
LIMIT 50;
~~~

:::support
postgresql=y mysql=y sqlite=y db2=y oracle=w~equality_only sqlserver=n cockroachdb=y duckdb=y bigquery=n snowflake=n
:::
`,
    related: [
      { label: 'Operators', href: '/operators/' },
      { label: 'NULL', href: '/sql/null/' },
      { label: 'Indexes', href: '/indexes/' },
      { label: 'Query optimization', href: '/performance/' },
    ],
  },

  {
    slug: 'group-by',
    title: 'GROUP BY & HAVING',
    category: 'Querying',
    difficulty: 'beginner',
    standard: 'SQL-92 / SQL:1999',
    summary: 'Aggregation, the functional-dependency rule, HAVING vs WHERE, GROUPING SETS, ROLLUP and CUBE.',
    keywords: 'group by having aggregate count sum avg rollup cube grouping sets only_full_group_by filter clause',
    body: `
\`GROUP BY\` collapses rows into one row per distinct combination of the grouping expressions. Every column in the select list must then be either a grouping expression or inside an aggregate.

~~~sql title="Aggregation" engine="ansi" run
SELECT   country,
         COUNT(*)          AS customers,
         COUNT(phone)      AS with_phone,     -- ignores NULLs
         SUM(lifetime_value) AS total_ltv,
         AVG(lifetime_value) AS avg_ltv,
         MIN(created_at)   AS first_signup,
         MAX(created_at)   AS latest_signup
FROM     customers
GROUP BY country
HAVING   COUNT(*) >= 10
ORDER BY total_ltv DESC;
~~~

## WHERE vs HAVING

| | \`WHERE\` | \`HAVING\` |
| --- | --- | --- |
| Runs | Before grouping | After grouping |
| Operates on | Individual rows | Groups |
| Can reference aggregates | No | Yes |
| Can use a SELECT alias | No | Yes in MySQL/SQLite/BigQuery; no in PostgreSQL/Oracle/SQL Server |

Filtering rows belongs in \`WHERE\`, not \`HAVING\` — putting it in \`HAVING\` still works but forces the engine to aggregate rows it will then throw away.

~~~sql title="Same result, very different cost on a large table" engine="ansi"
-- Slow: aggregates everything, then discards
SELECT country, COUNT(*) FROM orders GROUP BY country, status HAVING status = 'paid';

-- Fast: filters first, aggregates less, and can use an index on status
SELECT country, COUNT(*) FROM orders WHERE status = 'paid' GROUP BY country;
~~~

## The functional dependency rule

Standard SQL requires every non-aggregated select-list column to appear in \`GROUP BY\` — unless it is *functionally dependent* on a grouped primary key.

~~~sql title="Legal in PostgreSQL, MySQL 5.7+, SQLite; rejected by SQL Server and Oracle" engine="postgresql" run
SELECT c.id, c.email, c.full_name, COUNT(o.id) AS orders
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.id;         -- email and full_name are functionally dependent on the PK
~~~

::: danger MySQL's historic ONLY_FULL_GROUP_BY behaviour
Before 5.7, MySQL allowed *any* column in the select list and returned an arbitrary value from an arbitrary row in the group — silently wrong results, not an error. Modern MySQL enables \`ONLY_FULL_GROUP_BY\` by default. If you inherit a schema where it is disabled, expect queries whose results are non-deterministic:

~~~sql
SELECT @@sql_mode;                                    -- check
SET SESSION sql_mode = CONCAT(@@sql_mode, ',ONLY_FULL_GROUP_BY');
~~~

When you deliberately want "any value from the group", say so with \`ANY_VALUE(col)\` — supported in MySQL 5.7+, BigQuery, Snowflake, Databricks, DuckDB and PostgreSQL 16+.
:::

## GROUP BY position and expressions

~~~sql title="Grouping by ordinal — concise, brittle" engine="postgresql" run
SELECT date_trunc('month', created_at) AS month, status, COUNT(*)
FROM   orders
GROUP  BY 1, 2         -- PostgreSQL, MySQL, SQLite, BigQuery, Snowflake, Redshift, DuckDB, ClickHouse
ORDER  BY 1;
~~~

SQL Server, Oracle and Db2 require the expression to be repeated in full. BigQuery, Snowflake, DuckDB and PostgreSQL 16+ also accept \`GROUP BY ALL\`, which groups by every non-aggregated select-list column.

## FILTER — conditional aggregation

~~~sql title="ANSI FILTER clause" engine="postgresql" run
SELECT country,
       COUNT(*)                                    AS all_orders,
       COUNT(*) FILTER (WHERE status = 'paid')     AS paid,
       COUNT(*) FILTER (WHERE status = 'refunded') AS refunded,
       SUM(total) FILTER (WHERE created_at >= DATE '2026-01-01') AS revenue_ytd
FROM   orders GROUP BY country;
~~~

:::support
postgresql=y sqlite=y~3.30+ duckdb=y db2=y cockroachdb=y trino=y mysql=n sqlserver=n oracle=n snowflake=n bigquery=n redshift=n clickhouse=w~-If_combinators
:::

~~~sql title="The universal equivalent: CASE inside the aggregate" engine="ansi" run
SELECT country,
       COUNT(*)                                              AS all_orders,
       COUNT(CASE WHEN status = 'paid' THEN 1 END)           AS paid,
       SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END)  AS paid_revenue,
       AVG(CASE WHEN status = 'paid' THEN total END)         AS avg_paid   -- NULLs excluded
FROM   orders GROUP BY country;
~~~

## GROUPING SETS, ROLLUP, CUBE

Produce several levels of aggregation in a single pass over the data.

~~~sql title="GROUPING SETS — explicit combinations" engine="ansi" run
SELECT country, status, SUM(total) AS revenue
FROM   orders
GROUP  BY GROUPING SETS ((country, status), (country), ());
-- rows per (country,status), per country, and one grand total
~~~

~~~sql title="ROLLUP — hierarchical subtotals" engine="ansi" run
SELECT country, city, SUM(total) AS revenue
FROM   orders
GROUP  BY ROLLUP (country, city);
-- (country,city), (country), () — the classic subtotal report
~~~

~~~sql title="CUBE — every combination" engine="ansi"
SELECT country, status, SUM(total) FROM orders GROUP BY CUBE (country, status);
-- (country,status), (country), (status), ()
~~~

\`GROUPING(col)\` returns 1 when the column was rolled up, letting you label the subtotal rows:

~~~sql title="Labelling subtotal rows" engine="ansi" run
SELECT CASE WHEN GROUPING(country) = 1 THEN 'ALL COUNTRIES' ELSE country END AS country,
       CASE WHEN GROUPING(city)    = 1 THEN 'ALL CITIES'    ELSE city    END AS city,
       SUM(total) AS revenue
FROM   orders GROUP BY ROLLUP (country, city);
~~~

:::support
postgresql=y~9.5+ sqlserver=y oracle=y db2=y snowflake=y bigquery=y~ROLLUP_only databricks=y duckdb=y trino=y mysql=w~WITH_ROLLUP_only mariadb=w~WITH_ROLLUP_only redshift=y sqlite=n clickhouse=y~WITH_ROLLUP/CUBE
:::

~~~sql title="MySQL only has WITH ROLLUP" engine="mysql"
SELECT country, city, SUM(total) FROM orders GROUP BY country, city WITH ROLLUP;
~~~

## Aggregates without GROUP BY

An aggregate with no \`GROUP BY\` collapses the whole table to one row — **including when no rows match**:

~~~sql title="Empty result vs one row of NULLs" engine="ansi"
SELECT COUNT(*), SUM(total), MAX(total) FROM orders WHERE 1 = 0;
-- returns exactly ONE row: 0, NULL, NULL
SELECT country, COUNT(*) FROM orders WHERE 1 = 0 GROUP BY country;
-- returns ZERO rows
~~~
`,
    related: [
      { label: 'Aggregate functions', href: '/functions/#aggregate' },
      { label: 'Window functions', href: '/windows/' },
      { label: 'SELECT', href: '/sql/select/' },
      { label: 'Pivoting', href: '/sql/pivot/' },
    ],
  },

  {
    slug: 'order-by',
    title: 'ORDER BY & sorting',
    category: 'Querying',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Deterministic sorting, NULL placement, collations, custom orderings and the cost of a sort.',
    keywords: 'order by asc desc nulls first last collation custom sort case natural sort tie breaker stable',
    body: `
Without \`ORDER BY\` a result has **no defined order**. An unordered query that appears sorted is a coincidence of the current plan; adding an index, a parallel scan or more data changes it.

~~~sql title="Basics" engine="ansi" run
SELECT * FROM orders
ORDER BY created_at DESC,   -- primary key of the sort
         id DESC;           -- tie-breaker makes the order deterministic
~~~

::: tip Always add a unique tie-breaker
Sorting by a non-unique column leaves rows with equal keys in an arbitrary, unstable order. That silently breaks pagination: the same row can appear on page 1 and page 2. Append the primary key.
:::

## NULL placement

| Engine | Default for \`ASC\` | \`NULLS FIRST\` / \`NULLS LAST\` |
| --- | --- | --- |
| PostgreSQL, Oracle, Db2 | NULLs last | Yes |
| Snowflake | NULLs last | Yes |
| MySQL, MariaDB | NULLs first | MariaDB yes; MySQL no |
| SQL Server, Synapse | NULLs first | No |
| SQLite | NULLs first | 3.30+ yes |
| BigQuery, Databricks, DuckDB, ClickHouse | NULLs first | Yes |

~~~sql title="Explicit, portable NULL ordering" engine="ansi" run
ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date;
~~~

## Sorting by an expression, alias or position

~~~sql title="Three ways to sort by the same thing" engine="ansi"
SELECT total * 1.2 AS gross FROM orders ORDER BY total * 1.2;  -- expression
SELECT total * 1.2 AS gross FROM orders ORDER BY gross;        -- alias (works everywhere)
SELECT total * 1.2 AS gross FROM orders ORDER BY 1;            -- ordinal position
~~~

Ordinal positions are legal in every major engine but break the moment someone inserts a column into the select list. Use them in ad-hoc analysis, not in stored code.

## Custom orderings

~~~sql title="CASE-based priority" engine="ansi" run
SELECT * FROM tickets
ORDER BY CASE priority
             WHEN 'critical' THEN 1
             WHEN 'high'     THEN 2
             WHEN 'normal'   THEN 3
             ELSE 4
         END,
         created_at;
~~~

~~~sql title="Engine shortcuts" engine="ansi"
-- MySQL / MariaDB
ORDER BY FIELD(priority, 'critical', 'high', 'normal', 'low');
-- PostgreSQL: an enum type sorts in declaration order automatically
CREATE TYPE priority_t AS ENUM ('critical','high','normal','low');
ORDER BY priority;          -- uses the enum's natural order
-- PostgreSQL: array position
ORDER BY array_position(ARRAY['critical','high','normal','low'], priority);
~~~

## Collations

Collation decides how text compares and sorts: case sensitivity, accent sensitivity, and locale rules (in Swedish 'ä' sorts after 'z'; in German it sorts with 'a').

~~~sql title="Per-query collation" engine="postgresql" run
SELECT name FROM products ORDER BY name COLLATE "de-DE-x-icu";
SELECT name FROM products ORDER BY name COLLATE "C";   -- byte order: fastest, ASCII-ish
~~~
~~~sql title="Other engines" engine="ansi"
-- MySQL
ORDER BY name COLLATE utf8mb4_de_0900_ai_ci;
-- SQL Server
ORDER BY name COLLATE Latin1_General_CI_AI;
-- Oracle
ALTER SESSION SET NLS_SORT = 'GERMAN'; ALTER SESSION SET NLS_COMP = 'LINGUISTIC';
~~~

::: warn Changing a collation invalidates indexes
A B-tree index stores keys in collation order. Changing the collation of a column (or upgrading the OS's ICU/glibc version under PostgreSQL) makes existing indexes silently wrong — lookups start missing rows. After a glibc or ICU upgrade, \`REINDEX\` every text index.
:::

## Natural sort

\`'item10'\` sorts before \`'item2'\` in every text collation. Real natural sort needs decomposition:

~~~sql title="Natural sort of alphanumeric identifiers" engine="postgresql" run
SELECT sku FROM products
ORDER BY regexp_replace(sku, '[0-9]', '', 'g'),                       -- letter part
         COALESCE(NULLIF(regexp_replace(sku, '[^0-9]', '', 'g'), ''), '0')::BIGINT;
~~~

## The cost of sorting

A sort is O(n log n) and needs memory; when it exceeds the working-memory limit the engine spills to disk, often the single largest cost in a slow query.

~~~sql title="Spotting a spill" engine="postgresql"
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders ORDER BY total DESC;
--   Sort Method: external merge  Disk: 24864kB      ← spilled
--   Sort Method: quicksort  Memory: 25kB            ← fit in memory
SET work_mem = '64MB';    -- per sort node, per connection — raise carefully
~~~

An index on the sort key can remove the sort entirely, if its direction matches:

~~~sql title="Index-ordered scan" engine="postgresql"
CREATE INDEX idx_orders_created_desc ON orders (created_at DESC, id DESC);
-- Now this needs no Sort node at all:
SELECT * FROM orders ORDER BY created_at DESC, id DESC LIMIT 50;
~~~
`,
    related: [
      { label: 'LIMIT & pagination', href: '/sql/limit/' },
      { label: 'Indexes', href: '/indexes/' },
      { label: 'Window functions', href: '/windows/' },
      { label: 'Performance', href: '/performance/' },
    ],
  },

  {
    slug: 'limit',
    title: 'LIMIT, OFFSET & FETCH',
    category: 'Querying',
    difficulty: 'beginner',
    standard: 'SQL:2008',
    summary: 'Row limiting in every dialect, why OFFSET pagination degrades, and how keyset pagination fixes it.',
    keywords: 'limit offset fetch first top rownum pagination keyset seek cursor row limiting ties percent',
    body: `
## Every dialect, one operation

~~~sql title="LIMIT / OFFSET" engine="postgresql"
SELECT * FROM orders ORDER BY id LIMIT 10 OFFSET 20;
-- PostgreSQL, MySQL, MariaDB, SQLite, Redshift, BigQuery, Snowflake,
-- DuckDB, ClickHouse, CockroachDB, Databricks, Trino
~~~

~~~sql title="ANSI FETCH FIRST (SQL:2008)" engine="ansi"
SELECT * FROM orders ORDER BY id OFFSET 20 ROWS FETCH FIRST 10 ROWS ONLY;
-- PostgreSQL 8.4+, Oracle 12c+, Db2, SQL Server 2012+, MariaDB 10.6+, Snowflake
~~~

~~~sql title="SQL Server TOP" engine="sqlserver"
SELECT TOP 10 * FROM orders ORDER BY id;
SELECT TOP 10 PERCENT * FROM orders ORDER BY total DESC;
SELECT TOP 10 WITH TIES * FROM orders ORDER BY total DESC;  -- includes ties on the 10th value
~~~

~~~sql title="Oracle 11g and earlier" engine="oracle"
SELECT * FROM (
    SELECT o.*, ROWNUM AS rn FROM (SELECT * FROM orders ORDER BY id) o
    WHERE ROWNUM <= 30
) WHERE rn > 20;
-- ROWNUM is assigned BEFORE ORDER BY, hence the double nesting.
~~~

~~~sql title="MySQL's shorthand (offset first!)" engine="mysql"
SELECT * FROM orders ORDER BY id LIMIT 20, 10;   -- OFFSET 20, LIMIT 10 — easy to misread
~~~

::: warn LIMIT without ORDER BY is meaningless
"The first 10 rows" of an unordered set is whichever 10 the plan happened to produce. SQL Server and Db2 reject \`OFFSET … FETCH\` without \`ORDER BY\` for exactly this reason; the other engines accept it and return non-deterministic results.
:::

## WITH TIES

Include rows that tie with the last one, so a "top 10" can return 12 rows rather than cutting a tie arbitrarily.

~~~sql title="Standard" engine="ansi"
SELECT * FROM orders ORDER BY total DESC FETCH FIRST 10 ROWS WITH TIES;
~~~

:::support
postgresql=y~13+ sqlserver=y~TOP_n_WITH_TIES oracle=y db2=y snowflake=n mysql=n sqlite=n bigquery=n redshift=n duckdb=y
:::

Where it is missing, use \`RANK()\`:

~~~sql title="Portable WITH TIES" engine="ansi" run
SELECT * FROM (SELECT o.*, RANK() OVER (ORDER BY total DESC) AS rnk FROM orders o) t
WHERE rnk <= 10;
~~~

## Why OFFSET pagination degrades

\`OFFSET 100000\` does not skip cheaply — the engine must generate, sort and discard 100,000 rows before returning the next 10. Page 10,000 costs 1,000× page 1.

~~~text title="Cost profile"
OFFSET 0     LIMIT 20   →   reads 20 rows      ~1 ms
OFFSET 10000 LIMIT 20   →   reads 10,020 rows  ~40 ms
OFFSET 500000 LIMIT 20  →   reads 500,020 rows ~2,000 ms
~~~

There is a correctness problem too: if a row is inserted while a user pages, every subsequent page shifts by one — rows are seen twice or skipped entirely.

## Keyset (seek) pagination

Remember the last row's sort key and ask for "the rows after it". Constant time on every page, and stable under concurrent inserts.

~~~sql title="Page 1" engine="postgresql" run
SELECT id, created_at, total FROM orders
ORDER BY created_at DESC, id DESC
LIMIT 20;
~~~

~~~sql title="Page N — pass the last row's (created_at, id)" engine="postgresql" run
SELECT id, created_at, total FROM orders
WHERE  (created_at, id) < (TIMESTAMP '2026-03-01 09:14:22', 918273)
ORDER  BY created_at DESC, id DESC
LIMIT  20;
~~~

The matching index makes it a pure range scan:

~~~sql
CREATE INDEX idx_orders_seek ON orders (created_at DESC, id DESC);
~~~

~~~sql title="Without row constructors (SQL Server, Oracle, BigQuery)" engine="sqlserver"
WHERE created_at < @last_created
   OR (created_at = @last_created AND id < @last_id)
~~~

| | OFFSET | Keyset |
| --- | --- | --- |
| Deep page cost | Linear in the offset | Constant |
| Stable under concurrent writes | No | Yes |
| Jump to page 8,347 | Yes | No — only next/previous |
| Total page count | Easy | Needs a separate (expensive) count |

::: tip When you must show a page count
Don't run \`COUNT(*)\` over the full table on every request. Cache it, use an approximate count (\`pg_class.reltuples\`, \`SHOW TABLE STATUS\`), or show "next page" affordances instead of numbered pages. Most product surfaces do not need an exact total.
:::
`,
    related: [
      { label: 'ORDER BY', href: '/sql/order-by/' },
      { label: 'Window functions', href: '/windows/' },
      { label: 'Dialect diff: row limiting', href: '/comparison/#limit-rows' },
      { label: 'Performance', href: '/performance/' },
    ],
  },
];
