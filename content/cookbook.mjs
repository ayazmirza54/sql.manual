/** SQL Cookbook — practical "how do I…" recipes. Bodies use the markdown subset. */

export const groups = [
  { id: 'dedupe', label: 'Duplicates & data quality' },
  { id: 'ranking', label: 'Ranking & top-N' },
  { id: 'timeseries', label: 'Time series' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'hierarchy', label: 'Hierarchies & graphs' },
  { id: 'maintenance', label: 'Writes & maintenance' },
];

export default [
  {
    id: 'find-duplicates',
    group: 'dedupe',
    q: 'How do I find duplicate rows?',
    tags: 'duplicate dedupe group by having count',
    body: `
**Problem.** A column that should be unique is not — you need to see which values repeat and how often.

~~~sql title="Which emails appear more than once" engine="ansi" run
SELECT   lower(email) AS email, COUNT(*) AS copies
FROM     customers
GROUP BY lower(email)
HAVING   COUNT(*) > 1
ORDER BY copies DESC;
~~~

**Explanation.** Group by the candidate key, then filter groups with \`HAVING COUNT(*) > 1\`. \`HAVING\` rather than \`WHERE\`, because the count only exists after grouping.

**To see the offending rows themselves**, not just the keys, use a window function — one pass instead of a self-join:

~~~sql title="Every row that participates in a duplicate" engine="ansi" run
SELECT * FROM (
    SELECT c.*,
           COUNT(*)     OVER (PARTITION BY lower(email)) AS copies,
           ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at, id) AS rn
    FROM   customers c
) t
WHERE copies > 1
ORDER BY lower(email), rn;
~~~

**Duplicates across several columns** — just extend the partition:

~~~sql
PARTITION BY lower(email), phone, date_of_birth
~~~

::: note Dialect differences
Universal. \`lower()\` is unnecessary in MySQL and SQL Server, whose default collations are already case-insensitive — but harmless, and it makes the intent explicit.
:::
`,
  },
  {
    id: 'delete-duplicates',
    group: 'dedupe',
    q: 'How do I delete duplicates, keeping one row?',
    tags: 'delete duplicates keep oldest newest row_number ctid rowid',
    body: `
**Problem.** Remove duplicate rows but keep exactly one — usually the oldest or the newest.

~~~sql title="Portable: window function over the primary key" engine="ansi" run
DELETE FROM customers
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at, id) AS rn
        FROM   customers
    ) d
    WHERE d.rn > 1        -- keep rn = 1: the earliest row per email
);
~~~

~~~sql title="PostgreSQL: ctid works even with no unique column" engine="postgresql"
DELETE FROM customers a
USING customers b
WHERE a.ctid > b.ctid
  AND lower(a.email) = lower(b.email);
~~~

~~~sql title="SQLite: rowid" engine="sqlite"
DELETE FROM customers
WHERE rowid NOT IN (SELECT MIN(rowid) FROM customers GROUP BY lower(email));
~~~

~~~sql title="MySQL: needs an extra derived table (ERROR 1093)" engine="mysql"
DELETE FROM customers
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at) rn
        FROM customers
    ) AS tmp                     -- this alias forces materialization
    WHERE rn > 1
);
~~~

::: danger Run the SELECT first, every time
Replace \`DELETE FROM … WHERE id IN\` with \`SELECT * FROM … WHERE id IN\` and check the count and a sample before deleting. Then wrap the delete in a transaction so you can roll back if the number surprises you.
:::

**Afterwards, add the constraint** so it cannot happen again:

~~~sql
CREATE UNIQUE INDEX uq_customers_email ON customers (lower(email));
~~~
`,
  },
  {
    id: 'second-highest',
    group: 'ranking',
    q: 'How do I find the second highest value?',
    tags: 'second highest salary nth top n dense_rank offset',
    body: `
**Problem.** The classic interview question — and it has three correct answers depending on how you want to handle ties.

~~~sql title="Second highest distinct salary (ties collapse)" engine="ansi" run
SELECT DISTINCT salary FROM employees ORDER BY salary DESC OFFSET 1 LIMIT 1;
~~~

~~~sql title="Everyone earning the second-highest distinct salary" engine="ansi" run
SELECT * FROM (
    SELECT e.*, DENSE_RANK() OVER (ORDER BY salary DESC) AS dr
    FROM   employees e
) t WHERE dr = 2;
~~~

~~~sql title="The literal second person, ties broken arbitrarily" engine="ansi" run
SELECT * FROM (
    SELECT e.*, ROW_NUMBER() OVER (ORDER BY salary DESC, id) AS rn
    FROM   employees e
) t WHERE rn = 2;
~~~

**Which to use:** \`DENSE_RANK\` for "the second-highest *salary*", \`ROW_NUMBER\` for "the second-highest-*paid person*". They give different answers as soon as two people earn the same.

~~~sql title="Per department" engine="ansi" run
SELECT * FROM (
    SELECT e.*, DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS dr
    FROM   employees e
) t WHERE dr = 2;
~~~

::: note Dialect differences
\`OFFSET 1 LIMIT 1\` becomes \`OFFSET 1 ROWS FETCH NEXT 1 ROWS ONLY\` in SQL Server, Oracle 12c+ and Db2. Snowflake and BigQuery let you skip the subquery with \`QUALIFY DENSE_RANK() OVER (…) = 2\`.
:::
`,
  },
  {
    id: 'latest-row-per-group',
    group: 'ranking',
    q: 'How do I get the latest row per user?',
    tags: 'latest most recent per group top n per group distinct on lateral qualify greatest-n-per-group',
    body: `
**Problem.** One row per customer — their most recent order, with all its columns.

~~~sql title="Portable: ROW_NUMBER" engine="ansi" run
SELECT * FROM (
    SELECT o.*,
           ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC, id DESC) AS rn
    FROM   orders o
) t
WHERE rn = 1;
~~~

~~~sql title="PostgreSQL / DuckDB: DISTINCT ON — shorter and usually faster" engine="postgresql" run
SELECT DISTINCT ON (customer_id) *
FROM   orders
ORDER  BY customer_id, created_at DESC, id DESC;
~~~

~~~sql title="Snowflake / BigQuery / Databricks: QUALIFY" engine="snowflake"
SELECT * FROM orders
QUALIFY ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) = 1;
~~~

~~~sql title="When you have a customers table: LATERAL stops early" engine="postgresql" run
SELECT c.id, c.email, o.*
FROM   customers c
LEFT JOIN LATERAL (
    SELECT * FROM orders WHERE customer_id = c.id ORDER BY created_at DESC LIMIT 1
) o ON TRUE;
~~~

**Why LATERAL can be much faster:** with an index on \`(customer_id, created_at DESC)\` it reads exactly one index entry per customer. \`ROW_NUMBER\` sorts every order row first. On a table with millions of orders and thousands of customers, the difference is large.

::: danger Always include a tie-breaker
\`ORDER BY created_at DESC\` alone is non-deterministic when two orders share a timestamp — the "latest" row can change between runs. Append the primary key.
:::

::: note Dialect differences
SQL Server: \`CROSS APPLY (SELECT TOP 1 …)\`. MySQL 8.0.14+ supports \`LATERAL\`; earlier versions need the \`ROW_NUMBER\` form. ClickHouse has \`LIMIT 1 BY customer_id\`.
:::
`,
  },
  {
    id: 'running-total',
    group: 'timeseries',
    q: 'How do I calculate a running total?',
    tags: 'running total cumulative sum window frame rows unbounded preceding',
    body: `
**Problem.** A cumulative sum down an ordered result — revenue to date, account balance, inventory position.

~~~sql title="Running total" engine="ansi" run
SELECT day,
       revenue,
       SUM(revenue) OVER (ORDER BY day ROWS UNBOUNDED PRECEDING) AS running_total
FROM   daily_revenue
ORDER  BY day;
~~~

~~~sql title="Restarting per group" engine="ansi" run
SELECT customer_id, created_at, total,
       SUM(total) OVER (PARTITION BY customer_id ORDER BY created_at
                        ROWS UNBOUNDED PRECEDING) AS customer_running_total
FROM   orders;
~~~

::: danger Say ROWS, not the default
Omitting the frame gives you \`RANGE UNBOUNDED PRECEDING\`, which includes **every row with the same sort key**. With two rows on the same day, a RANGE running total jumps to the day's full amount on the first of them. Use \`ROWS\` for a strict row-by-row cumulative sum, or aggregate to one row per day first.
:::

~~~sql title="The safe shape: aggregate, then accumulate" engine="ansi" run
WITH daily AS (
    SELECT DATE_TRUNC('day', created_at) AS day, SUM(total) AS revenue
    FROM   orders GROUP BY 1
)
SELECT day, revenue,
       SUM(revenue) OVER (ORDER BY day ROWS UNBOUNDED PRECEDING) AS running_total
FROM   daily ORDER BY day;
~~~

::: note Dialect differences
Every engine with window functions supports this: PostgreSQL 8.4+, MySQL 8.0+, SQLite 3.25+, SQL Server 2012+, Oracle, and all the warehouses. On MySQL 5.7 or SQLite 3.24 you need a correlated subquery or a self-join, both O(n²).
:::
`,
  },
  {
    id: 'moving-average',
    group: 'timeseries',
    q: 'How do I calculate a rolling / moving average?',
    tags: 'moving average rolling window 7 day frame preceding smoothing',
    body: `
**Problem.** Smooth a noisy daily series with a trailing 7-day average.

~~~sql title="7-row trailing average" engine="ansi" run
SELECT day, revenue,
       AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS ma_7,
       COUNT(*)     OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS days_in_window
FROM   daily_revenue
ORDER  BY day;
~~~

The \`COUNT\` column matters: the first six rows average fewer than seven days. Filter them out if a partial window would mislead:

~~~sql title="Only complete windows" engine="ansi" run
SELECT * FROM (
    SELECT day, revenue,
           AVG(revenue)  OVER w AS ma_7,
           COUNT(*)      OVER w AS n
    FROM   daily_revenue
    WINDOW w AS (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
) t WHERE n = 7;
~~~

::: warn ROWS counts rows, not days
If a day has no rows, \`6 PRECEDING\` reaches back seven *rows*, which may be nine calendar days. Two fixes:

**1. A true time window** (PostgreSQL 11+, Oracle, Snowflake, DuckDB, Db2):
~~~sql
AVG(revenue) OVER (ORDER BY day RANGE BETWEEN INTERVAL '6 days' PRECEDING AND CURRENT ROW)
~~~

**2. Gap-fill first** with a generated date series so every day has a row — see [How do I find missing dates?](#missing-dates)
:::

**Centred average** — three days, one on each side:

~~~sql
AVG(revenue) OVER (ORDER BY day ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING)
~~~
`,
  },
  {
    id: 'missing-dates',
    group: 'timeseries',
    q: 'How do I find missing dates / fill gaps in a series?',
    tags: 'gap fill missing dates generate_series calendar spine zero fill',
    body: `
**Problem.** A daily report shows nothing for days with no sales — but the chart needs a zero, not a missing point.

**Solution: generate a complete date spine and LEFT JOIN the data to it.**

~~~sql title="PostgreSQL / DuckDB / CockroachDB" engine="postgresql" run
SELECT d.day::date AS day,
       COALESCE(SUM(o.total), 0) AS revenue
FROM   generate_series(DATE '2026-01-01', DATE '2026-01-31', INTERVAL '1 day') AS d(day)
LEFT JOIN orders o ON o.created_at >= d.day AND o.created_at < d.day + INTERVAL '1 day'
GROUP  BY d.day
ORDER  BY d.day;
~~~

~~~sql title="Portable: a recursive CTE" engine="ansi" run
WITH RECURSIVE days (day) AS (
    SELECT DATE '2026-01-01'
    UNION ALL
    SELECT day + INTERVAL '1 day' FROM days WHERE day < DATE '2026-01-31'
)
SELECT d.day, COALESCE(SUM(o.total), 0) AS revenue
FROM   days d
LEFT JOIN orders o ON CAST(o.created_at AS DATE) = d.day
GROUP  BY d.day ORDER BY d.day;
~~~

~~~sql title="Engine shortcuts" engine="ansi"
-- BigQuery
SELECT day FROM UNNEST(GENERATE_DATE_ARRAY('2026-01-01', '2026-01-31')) AS day;
-- Snowflake
SELECT DATEADD(day, SEQ4(), '2026-01-01') FROM TABLE(GENERATOR(ROWCOUNT => 31));
-- SQL Server
SELECT DATEADD(day, n, '2026-01-01') FROM (SELECT TOP 31 ROW_NUMBER() OVER (ORDER BY (SELECT 1)) - 1 AS n FROM sys.all_objects) t;
-- ClickHouse
SELECT toDate('2026-01-01') + number AS day FROM numbers(31);
~~~

**Just the missing dates**, rather than a filled series:

~~~sql title="Days with no orders at all" engine="postgresql" run
SELECT d.day::date
FROM   generate_series(DATE '2026-01-01', DATE '2026-01-31', INTERVAL '1 day') AS d(day)
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE CAST(o.created_at AS DATE) = d.day::date);
~~~

::: tip Build a permanent calendar table
If you gap-fill often, materialise a \`dim_date\` table once with a row per day plus fiscal period, weekday, holiday flags and week numbers. It joins faster than generating a series and it centralises the business calendar.
:::
`,
  },
  {
    id: 'pivot',
    group: 'analytics',
    q: 'How do I pivot rows into columns?',
    tags: 'pivot crosstab transpose rows to columns conditional aggregation',
    body: `
**Problem.** Turn a tall table (one row per product per quarter) into a wide one (one row per product, one column per quarter).

~~~sql title="Portable: conditional aggregation" engine="ansi" run
SELECT product_id,
       SUM(CASE WHEN quarter = 'Q1' THEN revenue ELSE 0 END) AS q1,
       SUM(CASE WHEN quarter = 'Q2' THEN revenue ELSE 0 END) AS q2,
       SUM(CASE WHEN quarter = 'Q3' THEN revenue ELSE 0 END) AS q3,
       SUM(CASE WHEN quarter = 'Q4' THEN revenue ELSE 0 END) AS q4,
       SUM(revenue) AS total
FROM   sales
GROUP  BY product_id;
~~~

~~~sql title="With FILTER (PostgreSQL, SQLite, DuckDB, Db2, Trino)" engine="postgresql" run
SELECT product_id,
       SUM(revenue) FILTER (WHERE quarter = 'Q1') AS q1,
       SUM(revenue) FILTER (WHERE quarter = 'Q2') AS q2
FROM   sales GROUP BY product_id;
~~~

~~~sql title="Native PIVOT (SQL Server, Oracle, Snowflake, Databricks, DuckDB)" engine="sqlserver"
SELECT * FROM (SELECT product_id, quarter, revenue FROM sales) s
PIVOT (SUM(revenue) FOR quarter IN ([Q1],[Q2],[Q3],[Q4])) p;
~~~

::: warn The column list must be known at parse time
SQL results have a fixed shape, so a pivot over values discovered at runtime requires generated SQL. See [Pivot & unpivot](/sql/pivot/#dynamic-pivots) — and quote the identifiers, because those values come from your data.
:::

**Unpivot (columns back to rows)** in one pass:

~~~sql title="PostgreSQL / SQL Server" engine="postgresql" run
SELECT q.product_id, v.quarter, v.revenue
FROM   quarterly q
CROSS JOIN LATERAL (VALUES ('Q1', q.q1), ('Q2', q.q2), ('Q3', q.q3), ('Q4', q.q4))
           AS v(quarter, revenue)
WHERE  v.revenue IS NOT NULL;
~~~
`,
  },
  {
    id: 'percentages',
    group: 'analytics',
    q: 'How do I calculate percentages of a total?',
    tags: 'percentage share of total window sum over ratio integer division',
    body: `
**Problem.** Each row's share of the whole, without a self-join or a second query.

~~~sql title="Share of grand total, and of the group" engine="ansi" run
SELECT region, country, revenue,
       ROUND(100.0 * revenue / SUM(revenue) OVER (),                 2) AS pct_of_total,
       ROUND(100.0 * revenue / SUM(revenue) OVER (PARTITION BY region), 2) AS pct_of_region
FROM   country_revenue
ORDER  BY revenue DESC;
~~~

::: danger Two traps in one line
**Integer division.** \`100 * revenue / SUM(revenue)\` with integer columns gives 0 in PostgreSQL, SQL Server, Oracle and Db2 — the division truncates before the multiply matters. Force a decimal: \`100.0 *\` or \`CAST(… AS NUMERIC)\`.

**Division by zero.** If the total can be zero, guard it: \`revenue / NULLIF(SUM(revenue) OVER (), 0)\` returns \`NULL\` instead of raising an error.
:::

~~~sql title="Both guards applied" engine="ansi" run
SELECT region, revenue,
       ROUND(100.0 * revenue / NULLIF(SUM(revenue) OVER (), 0), 2) AS pct
FROM   region_revenue;
~~~

**Percent change between periods:**

~~~sql title="Month over month" engine="ansi" run
SELECT month, revenue,
       LAG(revenue) OVER (ORDER BY month) AS prev,
       ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
                    / NULLIF(LAG(revenue) OVER (ORDER BY month), 0), 1) AS mom_pct
FROM   monthly_revenue ORDER BY month;
~~~

**Cumulative percentage (Pareto / ABC analysis):**

~~~sql title="Which products make 80% of revenue" engine="ansi" run
SELECT * FROM (
    SELECT product_id, revenue,
           ROUND(100.0 * SUM(revenue) OVER (ORDER BY revenue DESC ROWS UNBOUNDED PRECEDING)
                       / SUM(revenue) OVER (), 2) AS cumulative_pct
    FROM   product_revenue
) t WHERE cumulative_pct <= 80;
~~~
`,
  },
  {
    id: 'compare-tables',
    group: 'dedupe',
    q: 'How do I compare two tables and find the differences?',
    tags: 'diff compare tables except minus union all data validation reconciliation checksum',
    body: `
**Problem.** Verify that a migration, replica or ETL output matches its source.

~~~sql title="Rows that differ, and in which direction" engine="ansi" run
SELECT 'only_in_source' AS side, * FROM (SELECT * FROM source EXCEPT SELECT * FROM target) s
UNION ALL
SELECT 'only_in_target' AS side, * FROM (SELECT * FROM target EXCEPT SELECT * FROM source) t;
~~~

\`EXCEPT\` compares whole rows and treats two \`NULL\`s as equal, so it catches \`NULL\` transitions that a key join would silently miss.

~~~sql title="MySQL before 8.0.31 has no EXCEPT — use a full join" engine="mysql"
SELECT COALESCE(s.id, t.id) AS id,
       CASE WHEN t.id IS NULL THEN 'missing_in_target'
            WHEN s.id IS NULL THEN 'extra_in_target'
            ELSE 'differs' END AS issue,
       s.email AS source_email, t.email AS target_email
FROM   source s
LEFT JOIN target t ON t.id = s.id
WHERE  t.id IS NULL OR NOT (s.email <=> t.email)
UNION ALL
SELECT t.id, 'extra_in_target', NULL, t.email
FROM   target t LEFT JOIN source s ON s.id = t.id WHERE s.id IS NULL;
~~~

**Column-by-column diff** for rows that exist on both sides:

~~~sql title="Which columns changed" engine="postgresql" run
SELECT s.id,
       CASE WHEN s.email   IS DISTINCT FROM t.email   THEN 'email '   END ||
       CASE WHEN s.country IS DISTINCT FROM t.country THEN 'country ' END ||
       CASE WHEN s.total   IS DISTINCT FROM t.total   THEN 'total '   END AS changed_columns
FROM   source s JOIN target t ON t.id = s.id
WHERE  (s.email, s.country, s.total) IS DISTINCT FROM (t.email, t.country, t.total);
~~~

**Fast approximate check** on very large tables — compare a hash instead of the rows:

~~~sql title="Row-count and checksum comparison" engine="postgresql" run
SELECT 'source' AS side, COUNT(*), SUM(('x' || substr(md5(t::text), 1, 8))::bit(32)::bigint) AS checksum
FROM source t
UNION ALL
SELECT 'target', COUNT(*), SUM(('x' || substr(md5(t::text), 1, 8))::bit(32)::bigint) FROM target t;
~~~

::: tip Order-independent by construction
Summing per-row hashes gives the same answer regardless of row order, so the two sides can be compared without sorting either. If the sums match, the row sets almost certainly match; if they differ, fall back to the \`EXCEPT\` query to find out where.
:::
`,
  },
  {
    id: 'orphan-records',
    group: 'dedupe',
    q: 'How do I find orphan records?',
    tags: 'orphan foreign key missing parent referential integrity not exists anti join',
    body: `
**Problem.** Child rows pointing at parents that no longer exist — the usual aftermath of an import without foreign keys, or a delete that bypassed them.

~~~sql title="Orders whose customer is gone" engine="ansi" run
SELECT o.*
FROM   orders o
WHERE  o.customer_id IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id);
~~~

~~~sql title="Same thing as an anti-join" engine="ansi" run
SELECT o.*
FROM   orders o
LEFT JOIN customers c ON c.id = o.customer_id
WHERE  o.customer_id IS NOT NULL AND c.id IS NULL;
~~~

::: danger Do not use NOT IN here
\`WHERE customer_id NOT IN (SELECT id FROM customers)\` returns **zero rows** if any \`customers.id\` is \`NULL\`. \`NOT EXISTS\` has no such failure mode. See [NULL & three-valued logic](/sql/null/#the-not-in-trap).
:::

**Then fix it and prevent recurrence:**

~~~sql title="Clean up, then add the constraint" engine="ansi" run
-- 1. quantify
SELECT COUNT(*) FROM orders o
WHERE o.customer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id);

-- 2. decide: NULL them out, or delete them
UPDATE orders o SET customer_id = NULL
WHERE o.customer_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM customers c WHERE c.id = o.customer_id);

-- 3. make it impossible again
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT;
CREATE INDEX idx_orders_customer_id ON orders (customer_id);   -- FKs need this
~~~

**Auditing every foreign key at once** (PostgreSQL) — generate the check queries from the catalog:

~~~sql title="Generate one validation query per FK" engine="postgresql"
SELECT format(
  'SELECT %L AS fk, count(*) FROM %I.%I c WHERE %I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM %I.%I p WHERE p.%I = c.%I);',
  con.conname, cn.nspname, cl.relname, att.attname, pn.nspname, pcl.relname, patt.attname, att.attname)
FROM pg_constraint con
JOIN pg_class cl ON cl.oid = con.conrelid
JOIN pg_namespace cn ON cn.oid = cl.relnamespace
JOIN pg_class pcl ON pcl.oid = con.confrelid
JOIN pg_namespace pn ON pn.oid = pcl.relnamespace
JOIN pg_attribute att  ON att.attrelid  = con.conrelid  AND att.attnum  = con.conkey[1]
JOIN pg_attribute patt ON patt.attrelid = con.confrelid AND patt.attnum = con.confkey[1]
WHERE con.contype = 'f';
~~~
`,
  },
  {
    id: 'hierarchy',
    group: 'hierarchy',
    q: 'How do I query a tree or hierarchy?',
    tags: 'hierarchy tree recursive cte parent child org chart bom depth path connect by',
    body: `
**Problem.** An adjacency-list table (\`id\`, \`parent_id\`) and you need descendants, ancestors, depth or a path.

~~~sql title="All descendants of a node, with depth and path" engine="ansi" run
WITH RECURSIVE subtree AS (
    SELECT id, name, parent_id, 1 AS depth, CAST(name AS VARCHAR(1000)) AS path
    FROM   categories
    WHERE  id = 42                                    -- the root of the subtree

    UNION ALL

    SELECT c.id, c.name, c.parent_id, s.depth + 1,
           CAST(s.path || ' > ' || c.name AS VARCHAR(1000))
    FROM   categories c
    JOIN   subtree s ON c.parent_id = s.id
    WHERE  s.depth < 50                               -- guard against cycles
)
SELECT depth, path FROM subtree ORDER BY path;
~~~

~~~sql title="All ancestors — walk upward instead" engine="ansi" run
WITH RECURSIVE ancestors AS (
    SELECT id, name, parent_id, 0 AS levels_up FROM categories WHERE id = 4242
    UNION ALL
    SELECT c.id, c.name, c.parent_id, a.levels_up + 1
    FROM   categories c JOIN ancestors a ON c.id = a.parent_id
)
SELECT * FROM ancestors WHERE levels_up > 0 ORDER BY levels_up;
~~~

~~~sql title="Aggregate up the tree: total size per folder" engine="postgresql" run
WITH RECURSIVE tree AS (
    SELECT id, parent_id, size_bytes FROM files
    UNION ALL
    SELECT t.id, f.parent_id, t.size_bytes
    FROM   tree t JOIN files f ON f.id = t.parent_id
)
SELECT parent_id AS folder_id, SUM(size_bytes) AS total_bytes
FROM   tree WHERE parent_id IS NOT NULL GROUP BY parent_id;
~~~

~~~sql title="Oracle's CONNECT BY" engine="oracle"
SELECT LEVEL, LPAD(' ', 2*(LEVEL-1)) || name AS tree, SYS_CONNECT_BY_PATH(name, '/') AS path
FROM   categories
START WITH id = 42
CONNECT BY NOCYCLE PRIOR id = parent_id
ORDER SIBLINGS BY name;
~~~

::: danger Always bound the recursion
A single cyclic edge makes an unbounded recursive CTE run until it exhausts memory. PostgreSQL and SQLite impose **no** default limit. Add \`WHERE depth < n\`, or use the \`CYCLE\` clause (PostgreSQL 14+, Db2, Oracle). MySQL caps at \`cte_max_recursion_depth\` (1000) and SQL Server at \`OPTION (MAXRECURSION 100)\`.
:::

::: tip Alternatives to adjacency lists
For read-heavy trees that change rarely, a **materialised path** (\`/1/17/42/\`, queried with \`LIKE '/1/17/%'\`) or **closure table** (one row per ancestor-descendant pair) answers subtree queries with a single index scan and no recursion. PostgreSQL's \`ltree\` extension implements materialised paths with proper operators and GiST indexing.
:::
`,
  },
  {
    id: 'retention',
    group: 'analytics',
    q: 'How do I calculate cohort retention?',
    tags: 'retention cohort analysis monthly active users churn funnel',
    body: `
**Problem.** Of the users who signed up in month N, how many were still active in months N+1, N+2, …?

~~~sql title="Monthly cohort retention" engine="postgresql" run
WITH cohorts AS (
    SELECT user_id,
           DATE_TRUNC('month', MIN(event_time)) AS cohort_month
    FROM   events
    GROUP  BY user_id
),
activity AS (
    SELECT DISTINCT user_id, DATE_TRUNC('month', event_time) AS active_month
    FROM   events
),
joined AS (
    SELECT c.cohort_month,
           a.active_month,
           -- whole months between signup and activity
           (EXTRACT(YEAR FROM a.active_month) - EXTRACT(YEAR FROM c.cohort_month)) * 12
         + (EXTRACT(MONTH FROM a.active_month) - EXTRACT(MONTH FROM c.cohort_month)) AS month_number,
           a.user_id
    FROM   cohorts c JOIN activity a ON a.user_id = c.user_id
)
SELECT cohort_month,
       month_number,
       COUNT(DISTINCT user_id) AS active_users,
       ROUND(100.0 * COUNT(DISTINCT user_id)
             / MAX(COUNT(DISTINCT user_id)) OVER (PARTITION BY cohort_month), 1) AS retention_pct
FROM   joined
GROUP  BY cohort_month, month_number
ORDER  BY cohort_month, month_number;
~~~

**Reading it:** \`month_number = 0\` is the cohort size (100% by definition); each subsequent row is that month's returning share. The \`MAX(COUNT(…)) OVER (PARTITION BY cohort_month)\` trick takes month 0's count as the denominator without a second query.

~~~sql title="Pivoted into the familiar triangle" engine="ansi" run
SELECT cohort_month,
       MAX(CASE WHEN month_number = 0 THEN active_users END) AS m0,
       MAX(CASE WHEN month_number = 1 THEN retention_pct END) AS m1_pct,
       MAX(CASE WHEN month_number = 2 THEN retention_pct END) AS m2_pct,
       MAX(CASE WHEN month_number = 3 THEN retention_pct END) AS m3_pct
FROM   cohort_retention
GROUP  BY cohort_month ORDER BY cohort_month;
~~~

::: warn Incomplete periods distort the last diagonal
The most recent cohort has had less time to return, and the current month is not over. Exclude periods that have not fully elapsed, or the chart will show a fake cliff at the edge.
:::

::: note Dialect differences
\`DATE_TRUNC\` is PostgreSQL/Snowflake/Databricks/Redshift/DuckDB. BigQuery: \`DATE_TRUNC(date, MONTH)\`. MySQL: \`DATE_FORMAT(t, '%Y-%m-01')\`. SQL Server: \`DATETRUNC(month, t)\` (2022+) or \`DATEFROMPARTS(YEAR(t), MONTH(t), 1)\`. Month differences: \`DATEDIFF(month, a, b)\` in SQL Server, \`TIMESTAMPDIFF(MONTH, a, b)\` in MySQL, \`DATE_DIFF(a, b, MONTH)\` in BigQuery.
:::
`,
  },
  {
    id: 'upsert',
    group: 'maintenance',
    q: 'How do I insert a row only if it does not already exist?',
    tags: 'upsert insert if not exists on conflict merge idempotent race condition',
    body: `
**Problem.** Insert without failing when the row is already there — and without a race between the check and the insert.

~~~sql title="PostgreSQL / SQLite / DuckDB / CockroachDB" engine="postgresql" run
INSERT INTO settings (user_id, key, value)
VALUES (42, 'theme', 'dark')
ON CONFLICT (user_id, key) DO NOTHING;

-- or update on conflict:
INSERT INTO settings (user_id, key, value)
VALUES (42, 'theme', 'dark')
ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value;
~~~

~~~sql title="MySQL / MariaDB" engine="mysql"
INSERT INTO settings (user_id, setting_key, value) VALUES (42, 'theme', 'dark')
ON DUPLICATE KEY UPDATE value = VALUES(value);

-- "do nothing" idiom:
INSERT INTO settings (user_id, setting_key, value) VALUES (42, 'theme', 'dark')
ON DUPLICATE KEY UPDATE user_id = user_id;
~~~

~~~sql title="SQL Server / Oracle / Snowflake / BigQuery" engine="sqlserver"
MERGE INTO settings WITH (HOLDLOCK) AS t
USING (SELECT 42 AS user_id, 'theme' AS setting_key, 'dark' AS value) AS s
   ON t.user_id = s.user_id AND t.setting_key = s.setting_key
WHEN NOT MATCHED THEN INSERT (user_id, setting_key, value) VALUES (s.user_id, s.setting_key, s.value);
~~~

::: danger The check-then-insert race
~~~sql
-- BROKEN under concurrency
IF NOT EXISTS (SELECT 1 FROM settings WHERE …) INSERT INTO settings …;
~~~
Two sessions can both pass the check before either inserts. The window is microseconds, which means it will happen under load and never in testing.

**The only reliable guarantee is a unique constraint.** With one, either the upsert syntax handles it atomically, or the second insert raises a violation you can catch and retry. Without one, no amount of statement cleverness helps.
:::

~~~sql title="The prerequisite" engine="ansi"
ALTER TABLE settings ADD CONSTRAINT uq_settings UNIQUE (user_id, setting_key);
~~~

::: warn Upserts consume sequence values on conflict
In PostgreSQL, \`INSERT … ON CONFLICT DO NOTHING\` still calls \`nextval\` before detecting the conflict, so a high-conflict upsert loop burns through identity values fast. This is harmless with BIGINT and worth knowing about with INT.
:::
`,
  },
  {
    id: 'batch-delete',
    group: 'maintenance',
    q: 'How do I delete millions of rows without locking the table?',
    tags: 'batch delete chunk purge retention archive long transaction replication lag',
    body: `
**Problem.** A single \`DELETE\` of 50 million rows holds locks for hours, bloats the WAL/undo, and stalls replication.

~~~sql title="Batched delete loop" engine="postgresql" run
-- run repeatedly until it reports 0 rows
DELETE FROM events
WHERE  id IN (
    SELECT id FROM events
    WHERE  created_at < now() - INTERVAL '1 year'
    ORDER  BY id
    LIMIT  10000
);
~~~

~~~sql title="MySQL / SQL Server support LIMIT/TOP directly" engine="mysql"
DELETE FROM events WHERE created_at < NOW() - INTERVAL 1 YEAR ORDER BY id LIMIT 10000;
~~~
~~~sql title="SQL Server" engine="sqlserver"
WHILE 1 = 1
BEGIN
    DELETE TOP (5000) FROM dbo.events WHERE created_at < DATEADD(year, -1, SYSUTCDATETIME());
    IF @@ROWCOUNT = 0 BREAK;
    WAITFOR DELAY '00:00:00.100';   -- let replication and log backup keep up
END
~~~

**Rules for the driving loop:**

1. **Commit each batch.** One transaction per batch, not one for the whole job.
2. **Pause between batches** (50–200 ms) so replicas, checkpoints and autovacuum catch up.
3. **Index the predicate.** Without an index on \`created_at\`, every batch rescans the table and the job gets slower as it runs.
4. **Watch replication lag** and back off if it grows.
5. **Keep batches under the lock-escalation threshold** — SQL Server escalates to a table lock at roughly 5,000 row locks.

::: tip Partitioning turns this into an O(1) operation
If the table is range-partitioned on the retention column, a year of data disappears in milliseconds:

~~~sql
ALTER TABLE events DETACH PARTITION events_2025;   -- instant
DROP TABLE events_2025;
~~~

Any table with a retention policy should be partitioned on the retention dimension from the start.
:::

::: warn Deleting does not return disk space
PostgreSQL leaves dead tuples for autovacuum; MySQL/InnoDB keeps the space in the tablespace. Run \`VACUUM\` / \`OPTIMIZE TABLE\` afterwards, and budget for the table temporarily needing double its size if you rebuild it.
:::
`,
  },
  {
    id: 'sessionize',
    group: 'analytics',
    q: 'How do I group events into sessions?',
    tags: 'sessionization gap island events window lag conditional sum user session 30 minutes',
    body: `
**Problem.** Split a stream of user events into sessions, starting a new one after 30 minutes of inactivity.

**Solution: the "gaps and islands" pattern** — flag each row that starts a new session, then take a running sum of those flags as the session number.

~~~sql title="Sessionization in three steps" engine="ansi" run
WITH marked AS (
    SELECT user_id, event_time,
           CASE WHEN event_time - LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time)
                     > INTERVAL '30 minutes'
                  OR LAG(event_time) OVER (PARTITION BY user_id ORDER BY event_time) IS NULL
                THEN 1 ELSE 0 END AS is_new_session
    FROM   events
),
numbered AS (
    SELECT user_id, event_time,
           SUM(is_new_session) OVER (PARTITION BY user_id ORDER BY event_time
                                     ROWS UNBOUNDED PRECEDING) AS session_number
    FROM   marked
)
SELECT user_id, session_number,
       MIN(event_time)                      AS session_start,
       MAX(event_time)                      AS session_end,
       MAX(event_time) - MIN(event_time)    AS duration,
       COUNT(*)                             AS events
FROM   numbered
GROUP  BY user_id, session_number
ORDER  BY user_id, session_start;
~~~

The same three-step shape solves every "consecutive runs" problem: **detect the boundary** with \`LAG\`, **number the groups** with a running \`SUM\`, then **aggregate**.

~~~sql title="Same pattern: find consecutive date runs (streaks)" engine="ansi" run
WITH marked AS (
    SELECT user_id, activity_date,
           activity_date - CAST(ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_date) AS INT)
               AS streak_group    -- consecutive dates share this value
    FROM   (SELECT DISTINCT user_id, activity_date FROM activity) d
)
SELECT user_id, MIN(activity_date) AS streak_start, MAX(activity_date) AS streak_end,
       COUNT(*) AS streak_length
FROM   marked
GROUP  BY user_id, streak_group
HAVING COUNT(*) >= 3
ORDER  BY streak_length DESC;
~~~

::: note Dialect differences
Interval arithmetic varies: \`TIMESTAMPDIFF(MINUTE, prev, cur) > 30\` in MySQL, \`DATEDIFF(minute, prev, cur) > 30\` in SQL Server, \`TIMESTAMP_DIFF(cur, prev, MINUTE) > 30\` in BigQuery. Snowflake and BigQuery also have dedicated \`SESSIONIZE\`-style patterns in their docs, but this portable version works everywhere with window functions.
:::
`,
  },
  {
    id: 'parse-json',
    group: 'analytics',
    q: 'How do I parse and query JSON stored in a column?',
    tags: 'json parse extract query jsonb path index generated column',
    body: `
**Problem.** A \`payload\` column holds JSON and you need to filter, extract and aggregate on fields inside it.

~~~sql title="PostgreSQL" engine="postgresql" run
SELECT id,
       payload ->> 'event'                        AS event_name,
       payload -> 'user' ->> 'email'              AS email,
       (payload -> 'meta' ->> 'duration_ms')::int AS duration_ms
FROM   events
WHERE  payload @> '{"event":"purchase"}'          -- GIN-indexable containment
  AND  (payload -> 'meta' ->> 'duration_ms')::int > 1000;
~~~

~~~sql title="MySQL" engine="mysql"
SELECT id,
       payload ->> '$.event'         AS event_name,
       payload ->> '$.user.email'    AS email
FROM   events
WHERE  payload ->> '$.event' = 'purchase';
~~~

~~~sql title="SQL Server" engine="sqlserver"
SELECT id,
       JSON_VALUE(payload, '$.event')      AS event_name,
       JSON_VALUE(payload, '$.user.email') AS email
FROM   events
WHERE  JSON_VALUE(payload, '$.event') = 'purchase';
~~~

~~~sql title="BigQuery / Snowflake" engine="bigquery"
SELECT id, JSON_VALUE(payload, '$.event') AS event_name FROM events;   -- BigQuery
SELECT id, payload:event::STRING AS event_name FROM events;            -- Snowflake
~~~

**Expanding a JSON array into rows:**

~~~sql title="One row per item" engine="postgresql" run
SELECT e.id, item ->> 'sku' AS sku, (item ->> 'qty')::int AS qty
FROM   events e, jsonb_array_elements(e.payload -> 'items') AS item;
~~~

**Make it fast** — extraction on every row is a full scan unless you index it:

~~~sql title="Indexing JSON access" engine="postgresql"
CREATE INDEX idx_events_payload ON events USING GIN (payload jsonb_path_ops);  -- for @>
CREATE INDEX idx_events_type    ON events ((payload ->> 'event'));            -- for = and ranges
~~~
~~~sql title="MySQL: index a generated column" engine="mysql"
ALTER TABLE events
  ADD COLUMN event_name VARCHAR(64) GENERATED ALWAYS AS (payload ->> '$.event') STORED,
  ADD INDEX idx_event_name (event_name);
~~~

::: tip Promote the hot fields to real columns
If you filter, join or sort on a JSON field regularly, it should be a column. Keep JSON for the genuinely variable remainder. A generated column gives you both: the document stays authoritative and the extracted field is indexed.
:::
`,
  },
];
