export const section = { id: 'advanced', title: 'Advanced SQL', order: 7 };

export default [
  {
    slug: 'window-functions',
    path: '/windows/',
    title: 'Window functions',
    category: 'Advanced',
    difficulty: 'advanced',
    standard: 'SQL:2003',
    summary: 'OVER, PARTITION BY, frames, ranking, offsets, running totals, moving averages and percentiles — with the frame rules that catch everyone.',
    keywords: 'window function over partition by rows range frame row_number rank dense_rank ntile lag lead first_value last_value running total moving average percentile qualify',
    body: `
A window function computes a value across a set of rows **related to the current row**, without collapsing them. Aggregates reduce many rows to one; window functions keep every row and add a column.

~~~sql title="Aggregate vs window — the difference in one query" engine="ansi" run
SELECT name,
       dept_id,
       salary,
       AVG(salary) OVER (PARTITION BY dept_id)               AS dept_avg,
       salary - AVG(salary) OVER (PARTITION BY dept_id)      AS diff_from_dept_avg,
       RANK()      OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rank_in_dept,
       COUNT(*)    OVER ()                                   AS total_employees
FROM   employees;
~~~

## Anatomy of OVER

~~~text title="The clause"
function(args) OVER (
    PARTITION BY expr [, expr …]    -- split rows into independent groups
    ORDER BY     expr [ASC|DESC]    -- order within each partition
    frame_clause                    -- which rows around the current one count
)
~~~

- **No \`PARTITION BY\`** → the whole result set is one partition.
- **No \`ORDER BY\`** → the frame is the entire partition; order-dependent functions are meaningless.
- **\`ORDER BY\` without an explicit frame** → the default frame is \`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW\`, which is *not* the same as \`ROWS\` (see below).

Windows run **after** \`WHERE\`, \`GROUP BY\` and \`HAVING\`, and **before** \`ORDER BY\` and \`LIMIT\`. That is why you cannot filter on a window result in \`WHERE\` — you need a subquery, a CTE, or \`QUALIFY\`.

~~~sql title="Filtering on a window function" engine="ansi" run
-- Standard: wrap it
SELECT * FROM (
    SELECT e.*, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS rn
    FROM employees e
) t WHERE rn <= 3;
~~~

~~~sql title="QUALIFY — the same thing in one clause" engine="snowflake"
SELECT * FROM employees
QUALIFY ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) <= 3;
~~~

:::support
snowflake=y bigquery=y databricks=y duckdb=y~1.1+ teradata=y clickhouse=y~QUALIFY trino=n~subquery postgresql=n mysql=n sqlserver=n oracle=n sqlite=n redshift=n
:::

## The ranking functions

~~~sql title="ROW_NUMBER vs RANK vs DENSE_RANK vs NTILE" engine="ansi" run
SELECT name, salary,
       ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_number,
       RANK()       OVER (ORDER BY salary DESC) AS rank,
       DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rank,
       PERCENT_RANK() OVER (ORDER BY salary DESC) AS percent_rank,
       NTILE(4)     OVER (ORDER BY salary DESC) AS quartile
FROM   employees;
~~~

~~~text title="With a tie at 90,000"
salary | row_number | rank | dense_rank
-------+------------+------+-----------
120000 |     1      |  1   |     1
 90000 |     2      |  2   |     2
 90000 |     3      |  2   |     2      ← RANK and DENSE_RANK tie
 75000 |     4      |  4   |     3      ← RANK skips 3, DENSE_RANK does not
~~~

| Function | Ties | Gaps after ties | Use for |
| --- | --- | --- | --- |
| \`ROW_NUMBER()\` | Broken arbitrarily | n/a | Deduplication, "pick one per group", pagination |
| \`RANK()\` | Share a rank | Yes | Competition ranking ("joint 2nd, next is 4th") |
| \`DENSE_RANK()\` | Share a rank | No | "Top 3 distinct salaries" |
| \`NTILE(n)\` | Distributes rows | n/a | Quartiles, deciles, bucketing |
| \`PERCENT_RANK()\` | (rank−1)/(rows−1) | n/a | Relative position, 0 to 1 |
| \`CUME_DIST()\` | Cumulative distribution | n/a | Proportion ≤ current row |

::: warn ROW_NUMBER without a deterministic ORDER BY is non-deterministic
If the \`ORDER BY\` inside the window has ties, which row gets number 1 can change between runs. When you use \`ROW_NUMBER() = 1\` to pick "the latest row", add a tie-breaker: \`ORDER BY created_at DESC, id DESC\`.
:::

## Offset functions

~~~sql title="LAG, LEAD, FIRST_VALUE, LAST_VALUE, NTH_VALUE" engine="ansi" run
SELECT month,
       revenue,
       LAG(revenue)      OVER w                AS prev_month,
       LEAD(revenue)     OVER w                AS next_month,
       revenue - LAG(revenue) OVER w           AS mom_change,
       ROUND(100.0 * (revenue - LAG(revenue) OVER w) / NULLIF(LAG(revenue) OVER w, 0), 1) AS mom_pct,
       LAG(revenue, 12, 0) OVER w              AS same_month_last_year,  -- offset 12, default 0
       FIRST_VALUE(revenue) OVER w             AS first_month
FROM   monthly_revenue
WINDOW w AS (ORDER BY month)                   -- named window, reused above
ORDER BY month;
~~~

\`WINDOW\` clauses are supported by PostgreSQL, MySQL 8, SQLite, Oracle, Db2, DuckDB and ClickHouse; SQL Server, BigQuery, Snowflake and Redshift require the \`OVER (…)\` to be repeated.

::: danger LAST_VALUE almost never does what you expect
With the default frame (\`… AND CURRENT ROW\`), \`LAST_VALUE\` returns the *current* row, because the frame ends there. You must extend the frame:

~~~sql
LAST_VALUE(revenue) OVER (ORDER BY month
                          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)
~~~

Or, more readably, use \`FIRST_VALUE\` with the opposite sort direction.
:::

## Frames: ROWS vs RANGE vs GROUPS

The frame decides which rows in the partition the function sees.

~~~text title="Frame syntax"
{ROWS | RANGE | GROUPS} BETWEEN <start> AND <end>

<start>/<end> ::= UNBOUNDED PRECEDING
                | n PRECEDING
                | CURRENT ROW
                | n FOLLOWING
                | UNBOUNDED FOLLOWING
~~~

| Mode | \`n PRECEDING\` counts | Peers (equal ORDER BY values) |
| --- | --- | --- |
| \`ROWS\` | Physical rows | Treated individually |
| \`RANGE\` | A value offset from the current row's sort key | All peers are in or out together |
| \`GROUPS\` | Distinct peer groups | Whole groups |

This is the difference that produces "my running total is wrong on duplicate dates":

~~~sql title="ROWS vs RANGE with duplicate sort keys" engine="ansi" run
SELECT sold_on, amount,
       SUM(amount) OVER (ORDER BY sold_on ROWS  BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS by_rows,
       SUM(amount) OVER (ORDER BY sold_on RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS by_range
FROM   sales ORDER BY sold_on;
~~~

~~~text title="Two sales on 2026-01-02"
sold_on    | amount | by_rows | by_range
-----------+--------+---------+---------
2026-01-01 |   100  |   100   |   100
2026-01-02 |    50  |   150   |   200   ← RANGE includes BOTH rows of 01-02
2026-01-02 |    50  |   200   |   200
~~~

\`RANGE\` is the **default** when you write \`ORDER BY\` with no frame. If you want a strict row-by-row running total, say \`ROWS\` explicitly.

### Running totals and moving averages

~~~sql title="The two canonical frames" engine="ansi" run
SELECT day, revenue,
       -- running (cumulative) total
       SUM(revenue) OVER (ORDER BY day ROWS UNBOUNDED PRECEDING) AS running_total,
       -- 7-day moving average (current row + 6 previous)
       AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7,
       -- centred 3-day average
       AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING) AS ma_3_centred
FROM   daily_revenue ORDER BY day;
~~~

::: warn A moving average over ROWS is not a moving average over time
\`ROWS BETWEEN 6 PRECEDING\` means six *rows*, which is only six days if every day has exactly one row and there are no gaps. For a true time window use \`RANGE\` with an interval:

~~~sql
AVG(revenue) OVER (ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)
~~~
Supported by PostgreSQL 11+, Oracle, Db2, Snowflake and DuckDB. MySQL supports \`RANGE\` with numeric offsets only.
:::

## Aggregates as window functions

Every ordinary aggregate — \`SUM\`, \`AVG\`, \`COUNT\`, \`MIN\`, \`MAX\`, \`STRING_AGG\`, \`ARRAY_AGG\` — can take an \`OVER\` clause.

~~~sql title="Share of total, without a self-join" engine="ansi" run
SELECT country, revenue,
       SUM(revenue) OVER ()                        AS grand_total,
       ROUND(100.0 * revenue / SUM(revenue) OVER (), 2) AS pct_of_total,
       ROUND(100.0 * revenue / SUM(revenue) OVER (PARTITION BY region), 2) AS pct_of_region
FROM   country_revenue;
~~~

## Percentiles and distribution

~~~sql title="Ordered-set aggregates (WITHIN GROUP)" engine="ansi" run
SELECT dept_id,
       PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median_interpolated,
       PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY salary) AS median_actual_value,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY salary) AS p95,
       MODE() WITHIN GROUP (ORDER BY salary)               AS most_common
FROM   employees GROUP BY dept_id;
~~~

| Engine | Median / percentile |
| --- | --- |
| PostgreSQL, Oracle, Db2, Snowflake, Redshift, SQL Server (window form only) | \`PERCENTILE_CONT(x) WITHIN GROUP (ORDER BY …)\` |
| BigQuery | \`PERCENTILE_CONT(col, x) OVER ()\`, or \`APPROX_QUANTILES(col, 100)[OFFSET(50)]\` |
| MySQL 8, SQLite | No built-in — emulate with \`ROW_NUMBER\` or \`NTILE\` |
| DuckDB, Databricks, Trino | \`quantile_cont\` / \`approx_percentile\` |
| ClickHouse | \`quantile(0.5)(col)\`, \`quantileExact\`, \`median\` |

~~~sql title="Median without PERCENTILE_CONT" engine="mysql" run
WITH ranked AS (
    SELECT salary,
           ROW_NUMBER() OVER (ORDER BY salary) AS rn,
           COUNT(*)     OVER ()                AS n
    FROM employees
)
SELECT AVG(salary) AS median FROM ranked
WHERE rn IN (FLOOR((n + 1) / 2), CEIL((n + 1) / 2));
~~~

## Dialect support

:::support
postgresql=y~8.4+ mysql=y~8.0+ mariadb=y~10.2+ sqlite=y~3.25+ sqlserver=y~2012+_full oracle=y db2=y snowflake=y bigquery=y redshift=y duckdb=y clickhouse=y trino=y databricks=y cockroachdb=y
:::

::: note Older engines
MySQL 5.7, MariaDB 10.1 and SQLite before 3.25 have **no** window functions. The classic workarounds are self-joins with correlated counts, or session variables in MySQL (\`@rownum := @rownum + 1\`) — both slower and harder to read. If you are on those versions, upgrading is the fix.
:::

## Performance notes

- A window function needs its partition **sorted**. An index on \`(partition_key, order_key)\` can eliminate the sort entirely.
- Reusing the exact same \`OVER (…)\` specification lets the engine compute one sort for all of them. Different specs mean separate sort nodes — name them with \`WINDOW\` and reuse.
- \`ROW_NUMBER() = 1\` per group is often beaten by \`DISTINCT ON\` (PostgreSQL) or a \`LATERAL\` join with \`LIMIT 1\` when a matching index exists, because those can stop early instead of sorting every row.
`,
    related: [
      { label: 'GROUP BY', href: '/sql/group-by/' },
      { label: 'Window function reference', href: '/functions/#window' },
      { label: 'Cookbook: running total', href: '/cookbook/#running-total' },
      { label: 'CTEs', href: '/sql/cte/' },
    ],
  },

  {
    slug: 'json',
    title: 'JSON in SQL',
    category: 'Advanced',
    difficulty: 'advanced',
    standard: 'SQL:2016 / SQL:2023',
    summary: 'Storing, extracting, filtering and indexing JSON — the operators differ in every engine, so this is a translation table.',
    keywords: 'json jsonb json_extract json_value json_query path arrow operator jsonpath index gin unnest semi structured variant',
    body: `
Every major engine now stores and queries JSON, and no two spell it the same way. This page is primarily a translation table.

## Storage types

| Engine | Type | Stored as | Preserves key order / whitespace | Duplicate keys |
| --- | --- | --- | --- | --- |
| PostgreSQL | \`json\` | Text, reparsed on every access | Yes | Kept |
| PostgreSQL | \`jsonb\` | Decomposed binary | No (keys sorted) | Last wins |
| MySQL / MariaDB | \`JSON\` | Binary (MySQL); text (MariaDB alias for LONGTEXT + CHECK) | No | Last wins |
| SQL Server | \`nvarchar\` + \`ISJSON()\`; native \`json\` type in 2025 | Text | Yes | Kept |
| Oracle | \`JSON\` (21c+), earlier \`CLOB\`/\`BLOB\` + \`IS JSON\` | Binary OSON | No | — |
| SQLite | \`TEXT\` with JSON1 functions; \`JSONB\` internal format 3.45+ | Text | Yes | — |
| Snowflake | \`VARIANT\` | Columnarised binary | No | — |
| BigQuery | \`JSON\` | Columnarised | No | Last wins |
| DuckDB | \`JSON\` | Binary | No | — |
| ClickHouse | \`JSON\` (25.x), earlier \`String\` + functions | Columnar subcolumns | No | — |

::: tip PostgreSQL: use jsonb, not json
\`jsonb\` supports indexing and containment operators and does not reparse on each access. Choose \`json\` only when you must reproduce the original document byte-for-byte.
:::

## Extraction — the same operation in every dialect

Given \`{"user": {"name": "Ada", "tags": ["admin","dev"]}}\`:

~~~sql title="PostgreSQL" engine="postgresql" run
SELECT data -> 'user' ->> 'name'          AS name,      -- ->> returns text, -> returns jsonb
       data #>> '{user,name}'             AS name_path,
       jsonb_path_query_first(data, '$.user.tags[0]')  AS first_tag,
       data @> '{"user":{"name":"Ada"}}'  AS matches;   -- containment
~~~

~~~sql title="MySQL / MariaDB" engine="mysql"
SELECT JSON_EXTRACT(data, '$.user.name')            AS name_quoted,   -- "Ada"
       JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.name')) AS name,       -- Ada
       data ->> '$.user.name'                       AS name_short,    -- same, MySQL 5.7+
       JSON_EXTRACT(data, '$.user.tags[0]')         AS first_tag,
       JSON_CONTAINS(data, '"admin"', '$.user.tags') AS is_admin;
~~~

~~~sql title="SQL Server" engine="sqlserver"
SELECT JSON_VALUE(data, '$.user.name')      AS name,        -- scalar
       JSON_QUERY(data, '$.user.tags')      AS tags_array,  -- object/array
       ISJSON(data)                         AS valid;
-- shredding into columns:
SELECT * FROM OPENJSON(@doc, '$.user') WITH (name NVARCHAR(100) '$.name');
~~~

~~~sql title="Oracle" engine="oracle"
SELECT JSON_VALUE(data, '$.user.name')  AS name,
       JSON_QUERY(data, '$.user.tags')  AS tags,
       j.name                           AS dot_access
FROM   docs d, JSON_TABLE(d.data, '$.user' COLUMNS (name VARCHAR2(100) PATH '$.name')) j;
~~~

~~~sql title="SQLite" engine="sqlite"
SELECT json_extract(data, '$.user.name') AS name,
       data ->> '$.user.name'            AS name_short;   -- 3.38+
~~~

~~~sql title="BigQuery" engine="bigquery"
SELECT JSON_VALUE(data, '$.user.name')        AS name,      -- scalar STRING
       JSON_QUERY(data, '$.user.tags')        AS tags,      -- JSON
       data.user.name                         AS dot_access -- native JSON type
FROM   docs;
~~~

~~~sql title="Snowflake" engine="snowflake"
SELECT data:user.name::STRING   AS name,
       data:user.tags[0]::STRING AS first_tag
FROM   docs;
~~~

### Quick reference

| Operation | PostgreSQL | MySQL | SQL Server | Oracle | SQLite | BigQuery | Snowflake |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Get field (JSON) | \`->\` | \`->\` | \`JSON_QUERY\` | \`JSON_QUERY\` | \`->\` | \`JSON_QUERY\` | \`:\` |
| Get field (text) | \`->>\` | \`->>\` | \`JSON_VALUE\` | \`JSON_VALUE\` | \`->>\` | \`JSON_VALUE\` | \`:x::STRING\` |
| By path | \`#>>\` | \`$.a.b\` | \`$.a.b\` | \`$.a.b\` | \`$.a.b\` | \`$.a.b\` | \`:a.b\` |
| Array element | \`-> 0\` | \`$[0]\` | \`$[0]\` | \`$[0]\` | \`$[0]\` | \`$[0]\` | \`[0]\` |
| Contains | \`@>\` | \`JSON_CONTAINS\` | — | \`JSON_EXISTS\` | — | — | — |
| Key exists | \`?\` | \`JSON_CONTAINS_PATH\` | — | \`JSON_EXISTS\` | \`json_type\` | — | — |
| Expand array to rows | \`jsonb_array_elements\` | \`JSON_TABLE\` | \`OPENJSON\` | \`JSON_TABLE\` | \`json_each\` | \`UNNEST\` | \`FLATTEN\` |

## Expanding arrays into rows

~~~sql title="PostgreSQL" engine="postgresql" run
SELECT d.id, tag
FROM   docs d, jsonb_array_elements_text(d.data -> 'user' -> 'tags') AS tag;
~~~

~~~sql title="MySQL 8 / Oracle — JSON_TABLE" engine="mysql"
SELECT d.id, t.tag
FROM   docs d,
       JSON_TABLE(d.data, '$.user.tags[*]' COLUMNS (tag VARCHAR(64) PATH '$')) AS t;
~~~

~~~sql title="SQL Server" engine="sqlserver"
SELECT d.id, t.value AS tag
FROM   docs d CROSS APPLY OPENJSON(d.data, '$.user.tags') AS t;
~~~

~~~sql title="Snowflake" engine="snowflake"
SELECT d.id, f.value::STRING AS tag
FROM   docs d, LATERAL FLATTEN(input => d.data:user.tags) f;
~~~

~~~sql title="BigQuery" engine="bigquery"
SELECT d.id, tag
FROM   docs d, UNNEST(JSON_VALUE_ARRAY(d.data, '$.user.tags')) AS tag;
~~~

## Building JSON

~~~sql title="Aggregating rows into a document" engine="postgresql" run
SELECT jsonb_build_object(
           'customer_id', c.id,
           'email',       c.email,
           'orders',      COALESCE(jsonb_agg(jsonb_build_object('id', o.id, 'total', o.total))
                                   FILTER (WHERE o.id IS NOT NULL), '[]'::jsonb)
       ) AS doc
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.id, c.email;
~~~

| Engine | Object | Array aggregate |
| --- | --- | --- |
| PostgreSQL | \`jsonb_build_object\` | \`jsonb_agg\` |
| MySQL | \`JSON_OBJECT\` | \`JSON_ARRAYAGG\` |
| SQL Server | \`FOR JSON PATH\` | \`FOR JSON PATH\` |
| Oracle | \`JSON_OBJECT\` | \`JSON_ARRAYAGG\` |
| SQLite | \`json_object\` | \`json_group_array\` |
| BigQuery | \`TO_JSON\` / \`JSON_OBJECT\` | \`ARRAY_AGG\` |
| Snowflake | \`OBJECT_CONSTRUCT\` | \`ARRAY_AGG\` |
| DuckDB | \`json_object\` | \`json_group_array\` |

## Indexing JSON

This is where the engines differ most, and where JSON performance is won or lost.

~~~sql title="PostgreSQL — GIN for containment, B-tree for a specific path" engine="postgresql"
-- Index the whole document for @>, ? and jsonpath queries:
CREATE INDEX idx_docs_data ON docs USING GIN (data);
-- Smaller and faster if you only need @> :
CREATE INDEX idx_docs_data ON docs USING GIN (data jsonb_path_ops);
-- A single hot key, usable for = and range:
CREATE INDEX idx_docs_status ON docs ((data ->> 'status'));
~~~

~~~sql title="MySQL — index a generated column" engine="mysql"
ALTER TABLE docs
  ADD COLUMN status VARCHAR(32) GENERATED ALWAYS AS (data ->> '$.status') STORED,
  ADD INDEX idx_status (status);
-- MySQL 8 also has multi-valued indexes for arrays:
ALTER TABLE docs ADD INDEX idx_tags ((CAST(data -> '$.tags' AS CHAR(64) ARRAY)));
~~~

~~~sql title="SQL Server / Oracle" engine="sqlserver"
-- SQL Server: computed column + index
ALTER TABLE docs ADD status AS JSON_VALUE(data, '$.status');
CREATE INDEX idx_docs_status ON docs (status);
-- Oracle: search index over the whole document
CREATE SEARCH INDEX idx_docs ON docs (data) FOR JSON;
~~~

::: warn JSON is not a substitute for columns
A field you filter, join or sort on should be a real column. JSON is for genuinely variable, sparse or write-once payloads. Every engine's JSON path extraction is slower than a column read, most cannot use statistics on JSON internals for cardinality estimation, and constraints/foreign keys cannot reach inside a document.
:::

## Validating

~~~sql title="Constraining shape" engine="ansi"
-- PostgreSQL
ALTER TABLE docs ADD CONSTRAINT ck_kind CHECK (data ->> 'kind' IN ('a','b'));
ALTER TABLE docs ADD CONSTRAINT ck_shape CHECK (jsonb_typeof(data -> 'tags') = 'array');
-- SQL Server
ALTER TABLE docs ADD CONSTRAINT ck_json CHECK (ISJSON(data) = 1);
-- Oracle
ALTER TABLE docs ADD CONSTRAINT ck_json CHECK (data IS JSON);
-- MySQL validates the JSON type automatically; use JSON_SCHEMA_VALID() for shape:
ALTER TABLE docs ADD CONSTRAINT ck_shape CHECK (JSON_SCHEMA_VALID('{"type":"object"}', data));
~~~
`,
    related: [
      { label: 'Arrays', href: '/sql/arrays/' },
      { label: 'JSON functions', href: '/functions/#json' },
      { label: 'Data types', href: '/datatypes/#json' },
      { label: 'Indexes', href: '/indexes/' },
    ],
  },

  {
    slug: 'arrays',
    title: 'Arrays & nested data',
    category: 'Advanced',
    difficulty: 'advanced',
    standard: 'SQL:1999 (collection types)',
    summary: 'Array columns, UNNEST, aggregation back into arrays, structs and repeated fields in warehouses.',
    keywords: 'array unnest array_agg struct record nested repeated flatten cardinality ordinality slice contains',
    body: `
Arrays let one column hold an ordered list. PostgreSQL, BigQuery, Snowflake, DuckDB, Trino, ClickHouse and Databricks support them natively; MySQL, SQL Server, SQLite and Oracle do not (they use JSON or a child table instead).

:::support
postgresql=y bigquery=y~ARRAY snowflake=y~ARRAY_of_VARIANT duckdb=y trino=y clickhouse=y databricks=y redshift=w~SUPER_type oracle=w~VARRAY/nested_tables mysql=n~use_JSON sqlserver=n~use_JSON sqlite=n~use_JSON
:::

~~~sql title="PostgreSQL arrays" engine="postgresql" run
CREATE TABLE articles (
    id     BIGINT PRIMARY KEY,
    title  TEXT,
    tags   TEXT[]           NOT NULL DEFAULT '{}',
    scores INTEGER[]
);

INSERT INTO articles VALUES (1, 'Indexing', ARRAY['db','perf'], ARRAY[8,9,7]);

SELECT tags[1]                    AS first_tag,      -- 1-BASED indexing
       array_length(tags, 1)      AS tag_count,
       'perf' = ANY (tags)        AS is_perf,
       tags @> ARRAY['db']        AS contains_db,
       array_to_string(tags, ',') AS csv,
       tags || ARRAY['new']       AS appended
FROM   articles;
~~~

::: warn Array indexes are 1-based in PostgreSQL and Oracle, 0-based in BigQuery, Trino… and both in Snowflake
BigQuery makes you say which: \`arr[OFFSET(0)]\` (0-based) or \`arr[ORDINAL(1)]\` (1-based). ClickHouse, PostgreSQL and Trino are 1-based; Snowflake and DuckDB are 0- and 1-based respectively. Check before porting.
:::

## UNNEST — array to rows

~~~sql title="One row per tag" engine="postgresql" run
SELECT a.id, a.title, t.tag, t.ord
FROM   articles a,
       UNNEST(a.tags) WITH ORDINALITY AS t(tag, ord);   -- ord = 1,2,3…
~~~

~~~sql title="BigQuery — the standard nested-data idiom" engine="bigquery"
SELECT e.event_id, p.key, p.value
FROM   events e, UNNEST(e.params) AS p;          -- CROSS JOIN: drops events with no params
SELECT e.event_id, p.key
FROM   events e LEFT JOIN UNNEST(e.params) AS p; -- keeps them
~~~

~~~sql title="Snowflake" engine="snowflake"
SELECT a.id, f.value::STRING AS tag
FROM   articles a, LATERAL FLATTEN(input => a.tags) f;
~~~

~~~sql title="ClickHouse / Trino / Databricks" engine="clickhouse"
SELECT id, tag FROM articles ARRAY JOIN tags AS tag;              -- ClickHouse
SELECT id, tag FROM articles CROSS JOIN UNNEST(tags) AS t(tag);   -- Trino
SELECT id, explode(tags) AS tag FROM articles;                    -- Databricks / Spark
~~~

## Aggregating rows into an array

~~~sql title="ARRAY_AGG" engine="ansi" run
SELECT customer_id,
       ARRAY_AGG(id ORDER BY created_at DESC)                AS order_ids,
       ARRAY_AGG(DISTINCT status)                            AS statuses,
       ARRAY_AGG(total ORDER BY total DESC)[1]               AS biggest   -- PostgreSQL
FROM   orders GROUP BY customer_id;
~~~

Where arrays are unavailable, aggregate to a delimited string instead:

| Engine | String aggregate |
| --- | --- |
| PostgreSQL, SQL Server 2017+, SQLite (as \`group_concat\`) | \`STRING_AGG(expr, ',' ORDER BY …)\` |
| MySQL / MariaDB | \`GROUP_CONCAT(expr ORDER BY … SEPARATOR ',')\` |
| Oracle | \`LISTAGG(expr, ',') WITHIN GROUP (ORDER BY …)\` |
| BigQuery | \`STRING_AGG(expr, ',' ORDER BY …)\` |
| Snowflake | \`LISTAGG(expr, ',') WITHIN GROUP (ORDER BY …)\` |
| ClickHouse | \`arrayStringConcat(groupArray(expr), ',')\` |

::: warn GROUP_CONCAT truncates silently
MySQL's \`group_concat_max_len\` defaults to 1024 bytes and truncates without an error. Oracle's \`LISTAGG\` raises ORA-01489 past 4000 bytes unless you use \`ON OVERFLOW TRUNCATE\`. Neither is safe for unbounded lists.
:::

## Array operators (PostgreSQL)

| Operator | Meaning |
| --- | --- |
| \`@>\` / \`<@\` | Contains / is contained by |
| \`&&\` | Overlaps (shares any element) |
| \`||\` | Concatenate |
| \`= ANY(arr)\` | Element membership |
| \`array_position(arr, x)\` | Index of first occurrence |
| \`array_remove\`, \`array_replace\`, \`array_cat\` | Modification |
| \`arr[2:4]\` | Slice |

~~~sql title="GIN index makes containment fast" engine="postgresql"
CREATE INDEX idx_articles_tags ON articles USING GIN (tags);
SELECT * FROM articles WHERE tags @> ARRAY['perf'];    -- index scan
~~~

## Structs and repeated fields

Warehouses model nested objects with \`STRUCT\` (a record) plus \`ARRAY\` (repetition) — a schema shape that removes the need for many joins.

~~~sql title="BigQuery nested schema" engine="bigquery"
CREATE TABLE orders (
    id       INT64,
    customer STRUCT<id INT64, email STRING>,
    items    ARRAY<STRUCT<sku STRING, qty INT64, price NUMERIC>>
);

SELECT o.id,
       o.customer.email,
       (SELECT SUM(i.qty * i.price) FROM UNNEST(o.items) i) AS order_total
FROM   orders o
WHERE  EXISTS (SELECT 1 FROM UNNEST(o.items) i WHERE i.sku = 'ABC-1');
~~~

~~~sql title="PostgreSQL composite types" engine="postgresql"
CREATE TYPE address AS (street TEXT, city TEXT, postcode TEXT);
CREATE TABLE people (id BIGINT PRIMARY KEY, home address);
SELECT (home).city FROM people;      -- parentheses are required
~~~

::: tip When to use an array instead of a child table
Arrays are a good fit when the list is **small, read whole, and never joined or constrained** — tags, feature flags, a few labels. Anything you need to filter, index individually, count across rows, or enforce a foreign key on belongs in a child table. In warehouses the calculus flips: nested repeated fields avoid shuffles and are usually the faster design.
:::
`,
    related: [
      { label: 'JSON', href: '/sql/json/' },
      { label: 'Array functions', href: '/functions/#array' },
      { label: 'BigQuery', href: '/databases/bigquery/' },
      { label: 'Data types', href: '/datatypes/#array' },
    ],
  },

  {
    slug: 'pivot',
    title: 'Pivot & unpivot',
    category: 'Advanced',
    difficulty: 'intermediate',
    standard: 'Vendor extension',
    summary: 'Rows to columns and back: portable conditional aggregation, native PIVOT syntax, and dynamic pivots.',
    keywords: 'pivot unpivot crosstab transpose rows to columns conditional aggregation case when dynamic sql',
    body: `
**Pivot** turns row values into columns. **Unpivot** does the reverse. Only some engines have dedicated syntax; conditional aggregation works everywhere.

## Portable pivot: conditional aggregation

~~~sql title="Works in every engine" engine="ansi" run
SELECT product_id,
       SUM(CASE WHEN quarter = 'Q1' THEN revenue ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN revenue ELSE 0 END) AS q2,
       SUM(CASE WHEN quarter = 'Q3' THEN revenue ELSE 0 END) AS q3,
       SUM(CASE WHEN quarter = 'Q4' THEN revenue ELSE 0 END) AS q4,
       SUM(revenue)                                          AS total
FROM   sales
GROUP  BY product_id;
~~~

With \`FILTER\` (PostgreSQL, SQLite, DuckDB, Db2, Trino) it reads better:

~~~sql title="Same thing with FILTER" engine="postgresql" run
SELECT product_id,
       SUM(revenue) FILTER (WHERE quarter = 'Q1') AS q1,
       SUM(revenue) FILTER (WHERE quarter = 'Q2') AS q2
FROM   sales GROUP BY product_id;
~~~

::: note Use SUM/MAX, not the bare value
The \`CASE\` must sit **inside** an aggregate. \`MAX(CASE …)\` is right when at most one row matches per group; \`SUM(CASE …)\` when several should be added. Without the aggregate you get one row per source row instead of one per group.
:::

## Native PIVOT

~~~sql title="SQL Server / Oracle / Synapse" engine="sqlserver"
SELECT * FROM (
    SELECT product_id, quarter, revenue FROM sales
) src
PIVOT (
    SUM(revenue) FOR quarter IN ([Q1], [Q2], [Q3], [Q4])
) AS p;
~~~

~~~sql title="Oracle adds aliases per column" engine="oracle"
SELECT * FROM (SELECT product_id, quarter, revenue FROM sales)
PIVOT (SUM(revenue) FOR quarter IN ('Q1' AS q1, 'Q2' AS q2, 'Q3' AS q3, 'Q4' AS q4));
~~~

~~~sql title="Snowflake / Databricks / DuckDB" engine="snowflake"
SELECT * FROM sales
PIVOT (SUM(revenue) FOR quarter IN ('Q1','Q2','Q3','Q4')) AS p;
-- Snowflake also accepts ANY ORDER BY quarter, and DuckDB infers the values with PIVOT ON.
~~~

~~~sql title="DuckDB infers the columns" engine="duckdb"
PIVOT sales ON quarter USING SUM(revenue) GROUP BY product_id;
~~~

~~~sql title="PostgreSQL — crosstab from the tablefunc extension" engine="postgresql"
CREATE EXTENSION IF NOT EXISTS tablefunc;
SELECT * FROM crosstab(
    'SELECT product_id, quarter, SUM(revenue) FROM sales GROUP BY 1,2 ORDER BY 1,2',
    'SELECT DISTINCT quarter FROM sales ORDER BY 1'
) AS ct (product_id INT, q1 NUMERIC, q2 NUMERIC, q3 NUMERIC, q4 NUMERIC);
-- The output column list must still be written out — crosstab cannot infer it.
~~~

:::support
sqlserver=y~PIVOT oracle=y~PIVOT snowflake=y databricks=y duckdb=y synapse=y postgresql=w~crosstab_extension mysql=n sqlite=n bigquery=n~use_CASE redshift=n clickhouse=n trino=n
:::

## Unpivot: columns to rows

~~~sql title="Portable — UNION ALL" engine="ansi" run
SELECT product_id, 'Q1' AS quarter, q1 AS revenue FROM quarterly WHERE q1 IS NOT NULL
UNION ALL SELECT product_id, 'Q2', q2 FROM quarterly WHERE q2 IS NOT NULL
UNION ALL SELECT product_id, 'Q3', q3 FROM quarterly WHERE q3 IS NOT NULL
UNION ALL SELECT product_id, 'Q4', q4 FROM quarterly WHERE q4 IS NOT NULL;
~~~

That reads the table four times. A lateral/values join reads it once:

~~~sql title="PostgreSQL / SQL Server — one pass" engine="postgresql" run
SELECT q.product_id, v.quarter, v.revenue
FROM   quarterly q
CROSS JOIN LATERAL (VALUES ('Q1', q.q1), ('Q2', q.q2), ('Q3', q.q3), ('Q4', q.q4))
           AS v(quarter, revenue)
WHERE  v.revenue IS NOT NULL;
~~~

~~~sql title="Native UNPIVOT (SQL Server, Oracle, Snowflake, Databricks)" engine="sqlserver"
SELECT product_id, quarter, revenue
FROM   quarterly
UNPIVOT (revenue FOR quarter IN (q1, q2, q3, q4)) AS u;
-- Note: UNPIVOT drops NULLs. Use CROSS APPLY (VALUES …) if you need to keep them.
~~~

~~~sql title="BigQuery" engine="bigquery"
SELECT * FROM quarterly UNPIVOT (revenue FOR quarter IN (q1, q2, q3, q4));
~~~

## Dynamic pivots

SQL requires the result's column list to be known at parse time, so a pivot over values discovered at runtime needs generated SQL.

~~~sql title="SQL Server — build the column list, then EXEC" engine="sqlserver"
DECLARE @cols NVARCHAR(MAX), @sql NVARCHAR(MAX);

SELECT @cols = STRING_AGG(QUOTENAME(quarter), ',') WITHIN GROUP (ORDER BY quarter)
FROM  (SELECT DISTINCT quarter FROM sales) q;

SET @sql = N'
SELECT * FROM (SELECT product_id, quarter, revenue FROM sales) s
PIVOT (SUM(revenue) FOR quarter IN (' + @cols + N')) p;';

EXEC sp_executesql @sql;
~~~

::: danger Dynamic SQL is an injection surface
The pivot values come from your data. If a user can insert a row whose \`quarter\` is \`\`]) AS p; DROP TABLE sales; --\`\`, a naive concatenation executes it. \`QUOTENAME()\` (SQL Server), \`quote_ident()\` (PostgreSQL) and parameterised identifiers exist for this reason — always route identifiers through them.
:::

~~~sql title="PostgreSQL — generate the crosstab column list" engine="postgresql"
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(format('%I NUMERIC', quarter), ', ' ORDER BY quarter)
    INTO cols FROM (SELECT DISTINCT quarter FROM sales) q;   -- %I quotes safely
  EXECUTE format(
    'CREATE TEMP VIEW pivoted AS SELECT * FROM crosstab(%L, %L) AS ct (product_id INT, %s)',
    'SELECT product_id, quarter, SUM(revenue) FROM sales GROUP BY 1,2 ORDER BY 1,2',
    'SELECT DISTINCT quarter FROM sales ORDER BY 1', cols);
END $$;
~~~

::: tip Consider pivoting outside the database
Column lists that change with the data fight against SQL's static result shape. BI tools, dataframe libraries and spreadsheet exports all pivot natively and handle the dynamic case without generated SQL. Pivot in SQL when the columns are known and stable.
:::
`,
    related: [
      { label: 'GROUP BY', href: '/sql/group-by/' },
      { label: 'Set operations', href: '/sql/set-operations/' },
      { label: 'Cookbook: pivot', href: '/cookbook/#pivot' },
      { label: 'Window functions', href: '/windows/' },
    ],
  },

  {
    slug: 'procedures',
    title: 'Stored procedures, functions & triggers',
    category: 'Advanced',
    difficulty: 'advanced',
    standard: 'SQL/PSM (SQL:1999)',
    summary: 'Procedural SQL in each engine: PL/pgSQL, T-SQL, PL/SQL, and the trigger models — with guidance on when not to use them.',
    keywords: 'stored procedure function trigger plpgsql tsql plsql create procedure call exec deterministic before after instead of',
    body: `
The standard defines SQL/PSM; almost nobody implements it exactly. Each engine has its own procedural language with its own syntax, error handling and transaction semantics.

| Engine | Language | Define | Call |
| --- | --- | --- | --- |
| PostgreSQL | PL/pgSQL (also PL/Python, PL/v8, SQL) | \`CREATE FUNCTION\` / \`CREATE PROCEDURE\` | \`SELECT f()\` / \`CALL p()\` |
| MySQL / MariaDB | SQL/PSM-like | \`CREATE PROCEDURE\` | \`CALL p()\` |
| SQL Server | T-SQL | \`CREATE PROCEDURE\` | \`EXEC p\` |
| Oracle | PL/SQL | \`CREATE PROCEDURE\` / \`PACKAGE\` | \`BEGIN p; END;\` / \`EXEC\` |
| Db2 | SQL PL | \`CREATE PROCEDURE\` | \`CALL p()\` |
| Snowflake | SQL Scripting, JavaScript, Python | \`CREATE PROCEDURE\` | \`CALL p()\` |
| BigQuery | GoogleSQL procedural | \`CREATE PROCEDURE\` | \`CALL p()\` |
| SQLite | **None** — no procedural language | — | — |

## Function vs procedure

| | Function | Procedure |
| --- | --- | --- |
| Returns | A value or table | Optional output parameters |
| Called in a query | Yes | No |
| Can COMMIT | No (runs inside the caller's transaction) | Yes, in PostgreSQL 11+, Oracle, SQL Server |
| Typical use | Computation, reusable expression | Multi-step job, batch, admin task |

## PL/pgSQL

~~~sql title="A function" engine="postgresql" run
CREATE OR REPLACE FUNCTION customer_lifetime_value(p_customer_id BIGINT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE                              -- no writes; can be inlined and cached within a statement
PARALLEL SAFE
AS $$
DECLARE
    v_total NUMERIC;
BEGIN
    SELECT COALESCE(SUM(total), 0) INTO v_total
    FROM   orders WHERE customer_id = p_customer_id AND status = 'paid';

    IF v_total IS NULL THEN
        RAISE EXCEPTION 'customer % not found', p_customer_id
              USING ERRCODE = 'no_data_found';
    END IF;

    RETURN v_total;
END $$;

SELECT customer_lifetime_value(42);
~~~

~~~sql title="A procedure that commits per batch" engine="postgresql"
CREATE OR REPLACE PROCEDURE purge_old_events(p_days INT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_deleted INT;
BEGIN
    LOOP
        DELETE FROM events
        WHERE id IN (SELECT id FROM events
                     WHERE created_at < now() - make_interval(days => p_days)
                     LIMIT 10000);
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        EXIT WHEN v_deleted = 0;
        COMMIT;                     -- only legal in a procedure, not a function
    END LOOP;
END $$;

CALL purge_old_events(365);
~~~

::: note Volatility categories matter in PostgreSQL
\`IMMUTABLE\` (same input → same output, no table access), \`STABLE\` (consistent within one statement) and \`VOLATILE\` (default; anything goes). Marking a function \`IMMUTABLE\` lets it be used in an index expression and constant-folded. Marking it wrongly produces silently stale results.
:::

## T-SQL

~~~sql title="SQL Server procedure with error handling" engine="sqlserver"
CREATE OR ALTER PROCEDURE dbo.transfer_funds
    @from_account INT, @to_account INT, @amount DECIMAL(12,2)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;              -- roll back the whole transaction on any error

    BEGIN TRY
        BEGIN TRANSACTION;
            UPDATE dbo.accounts SET balance = balance - @amount WHERE id = @from_account;
            IF @@ROWCOUNT = 0 THROW 50001, 'Source account not found', 1;

            IF (SELECT balance FROM dbo.accounts WHERE id = @from_account) < 0
                THROW 50002, 'Insufficient funds', 1;

            UPDATE dbo.accounts SET balance = balance + @amount WHERE id = @to_account;
        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;                      -- rethrow with the original error number
    END CATCH
END;
GO

EXEC dbo.transfer_funds @from_account = 1, @to_account = 2, @amount = 100.00;
~~~

## PL/SQL

~~~sql title="Oracle package" engine="oracle"
CREATE OR REPLACE PACKAGE orders_pkg AS
    FUNCTION lifetime_value(p_customer_id NUMBER) RETURN NUMBER;
    PROCEDURE archive_old(p_days NUMBER);
END orders_pkg;
/
CREATE OR REPLACE PACKAGE BODY orders_pkg AS
    FUNCTION lifetime_value(p_customer_id NUMBER) RETURN NUMBER IS
        v_total NUMBER;
    BEGIN
        SELECT NVL(SUM(total), 0) INTO v_total
        FROM orders WHERE customer_id = p_customer_id;
        RETURN v_total;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN RETURN 0;
    END;

    PROCEDURE archive_old(p_days NUMBER) IS
    BEGIN
        FOR rec IN (SELECT id FROM orders WHERE created_at < SYSDATE - p_days) LOOP
            INSERT INTO orders_archive SELECT * FROM orders WHERE id = rec.id;
            DELETE FROM orders WHERE id = rec.id;
        END LOOP;
        COMMIT;
    END;
END orders_pkg;
/
~~~

## Triggers

A trigger runs automatically on \`INSERT\`, \`UPDATE\` or \`DELETE\`.

~~~sql title="PostgreSQL — audit trail" engine="postgresql" run
CREATE FUNCTION audit_orders() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO orders_audit (order_id, action, old_row, new_row, changed_by, changed_at)
    VALUES (COALESCE(NEW.id, OLD.id), TG_OP, to_jsonb(OLD), to_jsonb(NEW), current_user, now());
    RETURN NEW;    -- for AFTER triggers the return value is ignored
END $$;

CREATE TRIGGER trg_audit_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW EXECUTE FUNCTION audit_orders();
~~~

~~~sql title="MySQL" engine="mysql"
CREATE TRIGGER trg_orders_before_update BEFORE UPDATE ON orders
FOR EACH ROW
BEGIN
    SET NEW.updated_at = NOW();
    IF NEW.total < 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'total must be non-negative';
    END IF;
END;
~~~

~~~sql title="SQL Server — statement-level, not row-level" engine="sqlserver"
CREATE TRIGGER trg_audit_orders ON dbo.orders AFTER INSERT, UPDATE, DELETE
AS
BEGIN
    SET NOCOUNT ON;
    -- 'inserted' and 'deleted' are TABLES containing every affected row.
    INSERT INTO dbo.orders_audit (order_id, action, changed_at)
    SELECT COALESCE(i.id, d.id),
           CASE WHEN i.id IS NULL THEN 'DELETE'
                WHEN d.id IS NULL THEN 'INSERT' ELSE 'UPDATE' END,
           SYSUTCDATETIME()
    FROM inserted i FULL OUTER JOIN deleted d ON d.id = i.id;
END;
~~~

::: danger SQL Server triggers fire once per statement
Writing a SQL Server trigger as though it fires per row — \`SELECT @id = id FROM inserted\` — silently processes only one row of a multi-row \`UPDATE\`. Always write set-based trigger bodies against the \`inserted\`/\`deleted\` tables.
:::

| Timing | PostgreSQL | MySQL | SQL Server | Oracle | SQLite |
| --- | --- | --- | --- | --- | --- |
| BEFORE row | Yes | Yes | No (use INSTEAD OF) | Yes | Yes |
| AFTER row | Yes | Yes | Statement-level only | Yes | Yes |
| INSTEAD OF (views) | Yes | No | Yes | Yes | Yes |
| Statement-level | Yes | No | Yes | Yes | No |
| Multiple per event | Yes | 8.0+ | Yes | Yes | Yes |

::: warn Triggers are invisible action at a distance
They fire on every write path — including bulk loads and migrations — and they do not appear in the query that caused them. A slow trigger makes an \`INSERT\` mysteriously slow with nothing in the statement to explain it. Use them for auditing and invariants that must hold no matter which client writes; keep business logic in the application, where it can be tested and traced.

They also do not fire for everything: \`TRUNCATE\` skips row triggers, and bulk loaders (\`COPY\` with certain options, \`bcp\`, \`LOAD DATA\`) may bypass them entirely.
:::

## Security

~~~sql title="Definer vs invoker rights" engine="postgresql"
CREATE FUNCTION masked_customers() RETURNS SETOF customers
LANGUAGE sql
SECURITY DEFINER              -- runs with the FUNCTION OWNER's privileges
SET search_path = pg_catalog, public
AS $$ SELECT id, email_masked, country FROM customers $$;
~~~

\`SECURITY DEFINER\` (PostgreSQL, Oracle's \`AUTHID DEFINER\`, MySQL's \`DEFINER\`) lets a low-privilege caller run privileged code. It is the standard way to expose a controlled operation — and a privilege-escalation vector if the function builds SQL from its arguments without quoting, or leaves \`search_path\` unpinned.
`,
    related: [
      { label: 'Transactions', href: '/transactions/' },
      { label: 'Views', href: '/sql/views/' },
      { label: 'Security & privileges', href: '/admin/#users-roles-privileges' },
      { label: 'Database explorer', href: '/databases/' },
    ],
  },

  {
    slug: 'text-search',
    title: 'Full-text, geospatial & temporal SQL',
    category: 'Advanced',
    difficulty: 'advanced',
    standard: 'SQL/MM, SQL:2011',
    summary: 'Three specialised domains: text search with ranking, spatial predicates and indexes, and system-versioned temporal tables.',
    keywords: 'full text search tsvector match against contains postgis geography st_distance spatial index temporal system versioned as of period',
    body: `
## Full-text search

\`LIKE '%term%'\` cannot rank, stem, or use an index. Every engine ships something better.

~~~sql title="PostgreSQL" engine="postgresql" run
-- A stored, indexed search vector
ALTER TABLE articles ADD COLUMN search tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')),  'A') ||
        setweight(to_tsvector('english', coalesce(body,  '')),  'B')
    ) STORED;

CREATE INDEX idx_articles_search ON articles USING GIN (search);

SELECT id, title, ts_rank(search, q) AS rank
FROM   articles, websearch_to_tsquery('english', 'index performance -mysql') q
WHERE  search @@ q
ORDER  BY rank DESC
LIMIT  20;
~~~

\`websearch_to_tsquery\` accepts user input directly — quoted phrases, \`or\`, and \`-exclusion\` — without the syntax errors that \`to_tsquery\` raises on raw input.

~~~sql title="MySQL / MariaDB" engine="mysql"
ALTER TABLE articles ADD FULLTEXT INDEX ft_articles (title, body);

SELECT id, title, MATCH(title, body) AGAINST ('index performance' IN NATURAL LANGUAGE MODE) AS score
FROM   articles
WHERE  MATCH(title, body) AGAINST ('+index +performance -mysql' IN BOOLEAN MODE)
ORDER  BY score DESC;
~~~

~~~sql title="SQL Server" engine="sqlserver"
CREATE FULLTEXT CATALOG ft_catalog AS DEFAULT;
CREATE FULLTEXT INDEX ON dbo.articles (title, body) KEY INDEX pk_articles;

SELECT a.id, a.title, k.[RANK]
FROM   dbo.articles a
JOIN   FREETEXTTABLE(dbo.articles, (title, body), 'index performance') k ON k.[KEY] = a.id
ORDER  BY k.[RANK] DESC;
-- CONTAINS() for boolean/proximity syntax, FREETEXT() for natural language
~~~

~~~sql title="SQLite — FTS5 virtual table" engine="sqlite"
CREATE VIRTUAL TABLE articles_fts USING fts5(title, body, content='articles', content_rowid='id');
INSERT INTO articles_fts(articles_fts) VALUES('rebuild');

SELECT a.id, a.title, bm25(articles_fts) AS rank
FROM   articles_fts f JOIN articles a ON a.id = f.rowid
WHERE  articles_fts MATCH 'index AND performance'
ORDER  BY rank;          -- bm25 returns lower = better
~~~

| Engine | Mechanism | Ranking |
| --- | --- | --- |
| PostgreSQL | \`tsvector\`/\`tsquery\` + GIN | \`ts_rank\`, \`ts_rank_cd\` |
| MySQL / MariaDB | \`FULLTEXT\` index + \`MATCH … AGAINST\` | Relevance score |
| SQL Server | Full-text catalog + \`CONTAINS\`/\`FREETEXT\` | \`RANK\` column |
| Oracle | Oracle Text, \`CONTAINS()\` | \`SCORE()\` |
| SQLite | FTS5 virtual table | \`bm25()\` |
| Snowflake | \`SEARCH()\` / search optimization | Limited |
| BigQuery | \`SEARCH()\` + search index | No score |
| ClickHouse | \`hasToken\`, ngram/token bloom filter indexes | Manual |

::: tip When to reach for a dedicated search engine
Database full-text search is excellent for "find rows matching these words" over one language and modest volumes. Once you need faceting, typo tolerance, synonyms, multilingual analysers, or per-user relevance tuning, Elasticsearch/OpenSearch/Meilisearch will do it better. The cost is a second system to keep in sync.
:::

## Geospatial SQL

The OGC/SQL-MM standard defines \`ST_\`-prefixed functions, implemented consistently enough that spatial SQL is unusually portable.

~~~sql title="PostGIS" engine="postgresql" run
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE venues (
    id       BIGINT PRIMARY KEY,
    name     TEXT,
    location GEOGRAPHY(POINT, 4326)      -- WGS84 lat/lon, metres for distance
);
CREATE INDEX idx_venues_location ON venues USING GIST (location);

-- Everything within 2 km of a point, nearest first
SELECT id, name,
       ST_Distance(location, ST_MakePoint(-0.1276, 51.5072)::geography) AS metres
FROM   venues
WHERE  ST_DWithin(location, ST_MakePoint(-0.1276, 51.5072)::geography, 2000)
ORDER  BY location <-> ST_MakePoint(-0.1276, 51.5072)::geography     -- KNN index scan
LIMIT  10;
~~~

::: warn GEOMETRY vs GEOGRAPHY
\`GEOMETRY\` computes on a flat plane in the units of its SRID — \`ST_Distance\` on SRID 4326 geometry returns **degrees**, which is not a distance. \`GEOGRAPHY\` computes on a spheroid and returns metres. Use \`GEOGRAPHY\` for anything involving real-world distance; use projected \`GEOMETRY\` for local, high-volume work where speed matters.
:::

| Operation | Function |
| --- | --- |
| Distance | \`ST_Distance(a, b)\` |
| Within radius (index-usable) | \`ST_DWithin(a, b, radius)\` |
| Containment | \`ST_Contains(poly, pt)\`, \`ST_Within(pt, poly)\` |
| Intersection | \`ST_Intersects(a, b)\`, \`ST_Intersection(a, b)\` |
| Buffer | \`ST_Buffer(geom, distance)\` |
| Area / length | \`ST_Area(poly)\`, \`ST_Length(line)\` |
| Parse / emit | \`ST_GeomFromText\`, \`ST_AsGeoJSON\`, \`ST_AsText\` |

| Engine | Support |
| --- | --- |
| PostgreSQL + PostGIS | The most complete implementation available anywhere |
| MySQL 8 / MariaDB | \`GEOMETRY\` types, SPATIAL indexes, most \`ST_\` functions |
| SQL Server | \`geometry\` / \`geography\` CLR types with method syntax: \`@p.STDistance(@q)\` |
| Oracle | Oracle Spatial: \`SDO_GEOMETRY\`, \`SDO_WITHIN_DISTANCE\` |
| SQLite | SpatiaLite extension |
| BigQuery | \`GEOGRAPHY\` type, \`ST_\` functions, S2-based |
| Snowflake | \`GEOGRAPHY\` and \`GEOMETRY\` types |
| DuckDB | \`spatial\` extension (GDAL-backed) |

::: danger ST_DWithin, not ST_Distance < x
\`WHERE ST_Distance(a, b) < 2000\` computes an exact distance for **every row** — a full scan. \`ST_DWithin(a, b, 2000)\` uses the spatial index's bounding-box filter first. Same result, orders of magnitude apart.
:::

## Temporal SQL

SQL:2011 defines two period types: **system-versioned** (the database records when each row version was current) and **application-time** (you record when a fact was true in the real world).

~~~sql title="SQL Server — system-versioned temporal table" engine="sqlserver"
CREATE TABLE dbo.employees (
    id       INT PRIMARY KEY,
    name     NVARCHAR(100),
    salary   DECIMAL(12,2),
    valid_from DATETIME2 GENERATED ALWAYS AS ROW START HIDDEN NOT NULL,
    valid_to   DATETIME2 GENERATED ALWAYS AS ROW END   HIDDEN NOT NULL,
    PERIOD FOR SYSTEM_TIME (valid_from, valid_to)
)
WITH (SYSTEM_VERSIONING = ON (HISTORY_TABLE = dbo.employees_history));

-- Query the past — no history table joins required
SELECT * FROM dbo.employees FOR SYSTEM_TIME AS OF '2026-01-01T00:00:00';
SELECT * FROM dbo.employees FOR SYSTEM_TIME BETWEEN '2026-01-01' AND '2026-06-01';
SELECT * FROM dbo.employees FOR SYSTEM_TIME ALL WHERE id = 42;
~~~

~~~sql title="MariaDB" engine="mariadb"
CREATE TABLE employees (id INT PRIMARY KEY, salary DECIMAL(12,2)) WITH SYSTEM VERSIONING;
SELECT * FROM employees FOR SYSTEM_TIME AS OF TIMESTAMP '2026-01-01 00:00:00';
~~~

~~~sql title="Oracle Flashback" engine="oracle"
SELECT * FROM employees AS OF TIMESTAMP (SYSTIMESTAMP - INTERVAL '1' DAY);
SELECT * FROM employees VERSIONS BETWEEN TIMESTAMP …;
~~~

~~~sql title="Snowflake / BigQuery / Databricks — time travel" engine="snowflake"
SELECT * FROM employees AT (TIMESTAMP => '2026-01-01 00:00:00'::TIMESTAMP);  -- Snowflake
SELECT * FROM employees BEFORE (STATEMENT => '01a2…');                       -- Snowflake
SELECT * FROM dataset.employees FOR SYSTEM_TIME AS OF TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY);  -- BigQuery
SELECT * FROM employees VERSION AS OF 12;                                    -- Databricks / Delta
~~~

:::support
sqlserver=y~2016+ mariadb=y~10.3+ db2=y oracle=y~Flashback snowflake=y~time_travel bigquery=y~7_days databricks=y~Delta postgresql=n~temporal_tables_extension mysql=n sqlite=n
:::

::: note PostgreSQL has no built-in system versioning
Use the \`temporal_tables\` extension, or the common manual pattern: a \`valid_from\`/\`valid_to\` pair plus an audit trigger. PostgreSQL's \`tstzrange\` type with a GiST exclusion constraint enforces non-overlapping periods better than most native implementations.
:::

~~~sql title="Application-time periods in PostgreSQL, enforced" engine="postgresql" run
CREATE TABLE prices (
    product_id BIGINT NOT NULL,
    price      NUMERIC(10,2) NOT NULL,
    valid      DATERANGE NOT NULL,
    EXCLUDE USING GIST (product_id WITH =, valid WITH &&)   -- no overlapping price periods
);

SELECT price FROM prices WHERE product_id = 1 AND valid @> DATE '2026-03-15';
~~~
`,
    related: [
      { label: 'Indexes', href: '/indexes/' },
      { label: 'JSON', href: '/sql/json/' },
      { label: 'PostgreSQL', href: '/databases/postgresql/' },
      { label: 'Data types', href: '/datatypes/' },
    ],
  },
];
