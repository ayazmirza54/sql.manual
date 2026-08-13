export const section = { id: 'composition', title: 'Composition', order: 6 };

export default [
  {
    slug: 'subqueries',
    title: 'Subqueries',
    category: 'Composition',
    difficulty: 'intermediate',
    standard: 'SQL-92',
    summary: 'Scalar, row, table and correlated subqueries; EXISTS vs IN vs JOIN, and when each produces a better plan.',
    keywords: 'subquery scalar correlated exists not exists in any all derived table inline view uncorrelated',
    body: `
A subquery is a \`SELECT\` nested inside another statement. Four shapes, each legal in different positions:

| Shape | Returns | Legal in |
| --- | --- | --- |
| **Scalar** | Exactly one row, one column | \`SELECT\` list, \`WHERE\`, \`SET\`, \`HAVING\` |
| **Row** | One row, several columns | \`WHERE (a,b) = (SELECT …)\` |
| **Table** (derived table / inline view) | Many rows and columns | \`FROM\`, \`JOIN\` |
| **Correlated** | Re-evaluated per outer row | Anywhere, but conceptually a loop |

## Scalar subqueries

~~~sql title="One value, used like a column" engine="ansi" run
SELECT o.id,
       o.total,
       o.total - (SELECT AVG(total) FROM orders) AS diff_from_mean
FROM   orders o;
~~~

::: warn A scalar subquery returning more than one row is a runtime error
"more than one row returned by a subquery used as an expression" (PostgreSQL) / ORA-01427 (Oracle). It often only fires in production, when the data finally contains a duplicate. Guard with \`LIMIT 1\` plus a deterministic \`ORDER BY\`, or restructure as a join.
:::

A scalar subquery that returns **zero** rows yields \`NULL\`, not an error — a quieter and often nastier bug.

## Correlated subqueries

A correlated subquery references a column from the outer query, so it is logically re-evaluated for every outer row.

~~~sql title="Each employee against their own department's average" engine="ansi" run
SELECT e.name, e.salary, e.dept_id
FROM   employees e
WHERE  e.salary > (SELECT AVG(e2.salary) FROM employees e2 WHERE e2.dept_id = e.dept_id);
~~~

The same result as a window function, which reads the table once instead of once per row:

~~~sql title="Usually faster" engine="ansi" run
SELECT name, salary, dept_id FROM (
    SELECT e.*, AVG(salary) OVER (PARTITION BY dept_id) AS dept_avg FROM employees e
) t
WHERE salary > dept_avg;
~~~

::: tip Modern planners often decorrelate automatically
PostgreSQL, SQL Server, Oracle and DuckDB can rewrite many correlated subqueries into joins or hash aggregates. But "often" is not "always" — an \`EXPLAIN\` showing a nested loop with a subplan executed millions of times means it did not, and you should rewrite by hand.
:::

## EXISTS vs IN vs JOIN

Three ways to express "customers who have ordered":

~~~sql title="EXISTS — semi join, NULL-safe, stops at the first match" engine="ansi" run
SELECT c.* FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
~~~

~~~sql title="IN — equivalent here, but NULL-sensitive in its negation" engine="ansi" run
SELECT c.* FROM customers c
WHERE c.id IN (SELECT customer_id FROM orders);
~~~

~~~sql title="JOIN — needs DISTINCT, which usually costs a sort or hash" engine="ansi" run
SELECT DISTINCT c.* FROM customers c JOIN orders o ON o.customer_id = c.id;
~~~

| | \`EXISTS\` | \`IN\` | \`JOIN\` |
| --- | --- | --- | --- |
| Duplicates outer rows | No | No | Yes — needs \`DISTINCT\` |
| Safe when the inner set has NULLs | Yes | Yes for \`IN\`, **no** for \`NOT IN\` | Yes |
| Can select inner columns | No | No | Yes |
| Typical plan | Semi join | Semi join (after unnesting) | Hash/merge join + dedup |

::: danger NOT IN with NULLs returns nothing
If the subquery yields even one \`NULL\`, \`NOT IN\` can never be true. Use \`NOT EXISTS\`. Full explanation in [NULL & three-valued logic](/sql/null/#the-not-in-trap).
:::

\`SELECT 1\` vs \`SELECT *\` inside \`EXISTS\` makes no difference — every engine discards the select list. Write whichever you find clearer.

## ANY / ALL / SOME

~~~sql title="Quantified comparison" engine="ansi" run
SELECT * FROM products
WHERE  price > ALL (SELECT price FROM products WHERE category = 'budget');   -- more than every one

SELECT * FROM products
WHERE  price > ANY (SELECT price FROM products WHERE category = 'premium');  -- more than at least one
~~~

\`x = ANY (…)\` is exactly \`x IN (…)\`; \`x <> ALL (…)\` is exactly \`x NOT IN (…)\` — including the \`NULL\` trap. \`ALL\` over an **empty** set is \`TRUE\`; \`ANY\` over an empty set is \`FALSE\`.

:::support
postgresql=y mysql=y sqlserver=y oracle=y db2=y sqlite=n~IN_only snowflake=y bigquery=n~use_IN redshift=y duckdb=y
:::

## Derived tables

A subquery in \`FROM\`. Most engines require an alias.

~~~sql title="Two-step aggregation" engine="ansi" run
SELECT country, AVG(order_count) AS avg_orders_per_customer
FROM (
    SELECT c.id, c.country, COUNT(o.id) AS order_count
    FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
    GROUP  BY c.id, c.country
) AS per_customer          -- alias required in PostgreSQL, MySQL, SQL Server
GROUP BY country;
~~~

Beyond two levels of nesting, a [CTE](/sql/cte/) reads far better and can be reused.

## Subqueries in the SELECT list

~~~sql title="Convenient, but one execution per output row" engine="ansi"
SELECT c.id,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count,
       (SELECT MAX(total) FROM orders o WHERE o.customer_id = c.id) AS biggest_order
FROM   customers c;
~~~

~~~sql title="One pass instead of two per row" engine="ansi" run
SELECT c.id, COALESCE(o.order_count, 0) AS order_count, o.biggest_order
FROM   customers c
LEFT JOIN (
    SELECT customer_id, COUNT(*) AS order_count, MAX(total) AS biggest_order
    FROM   orders GROUP BY customer_id
) o ON o.customer_id = c.id;
~~~

## Restrictions worth knowing

- **MySQL** cannot modify a table and select from the same table in a subquery (\`ERROR 1093\`). Wrap the subquery in another derived table to force materialization.
- **SQLite** has no \`ALL\`/\`ANY\` quantifiers.
- **Redshift** does not support correlated subqueries in every position — some forms raise "This type of correlated subquery pattern is not supported".
- **BigQuery** requires correlated subqueries to be aggregated or \`EXISTS\`-shaped; arbitrary correlation is limited.
`,
    related: [
      { label: 'CTEs', href: '/sql/cte/' },
      { label: 'Joins', href: '/joins/' },
      { label: 'NULL', href: '/sql/null/' },
      { label: 'Window functions', href: '/windows/' },
    ],
  },

  {
    slug: 'cte',
    title: 'CTEs & recursive queries',
    category: 'Composition',
    difficulty: 'intermediate',
    standard: 'SQL:1999',
    summary: 'WITH clauses for readability, WITH RECURSIVE for hierarchies and graphs, and the optimization-fence question.',
    keywords: 'cte with clause common table expression recursive hierarchy tree graph materialized fence data modifying',
    body: `
A **Common Table Expression** names a subquery so the main query can reference it — sometimes several times — and so a pipeline reads top to bottom instead of inside out.

~~~sql title="A readable pipeline" engine="ansi" run
WITH paid_orders AS (
    SELECT * FROM orders WHERE status = 'paid'
),
customer_totals AS (
    SELECT customer_id, COUNT(*) AS orders, SUM(total) AS revenue
    FROM   paid_orders
    GROUP  BY customer_id
),
ranked AS (
    SELECT ct.*, RANK() OVER (ORDER BY revenue DESC) AS revenue_rank
    FROM   customer_totals ct
)
SELECT c.email, r.orders, r.revenue, r.revenue_rank
FROM   ranked r JOIN customers c ON c.id = r.customer_id
WHERE  r.revenue_rank <= 20
ORDER  BY r.revenue_rank;
~~~

:::support
postgresql=y mysql=y~8.0+ mariadb=y~10.2+ sqlite=y sqlserver=y oracle=y~9i+ db2=y snowflake=y bigquery=y redshift=y duckdb=y clickhouse=y trino=y databricks=y cockroachdb=y
:::

## WITH RECURSIVE

A recursive CTE has two parts joined by \`UNION ALL\`: an **anchor** that produces the starting rows, and a **recursive term** that references the CTE itself and runs repeatedly until it returns nothing.

~~~sql title="Walking an org chart down from the CEO" engine="ansi" run
WITH RECURSIVE org AS (
    -- anchor: the root
    SELECT id, name, manager_id, 1 AS depth, CAST(name AS VARCHAR(1000)) AS path
    FROM   employees
    WHERE  manager_id IS NULL

    UNION ALL

    -- recursive term: one level down, per iteration
    SELECT e.id, e.name, e.manager_id, o.depth + 1,
           CAST(o.path || ' > ' || e.name AS VARCHAR(1000))
    FROM   employees e
    JOIN   org o ON o.id = e.manager_id
    WHERE  o.depth < 20                     -- depth guard: stops runaway recursion
)
SELECT depth, path FROM org ORDER BY path;
~~~

~~~text title="Result"
depth | path
------+--------------------------------
1     | Kathleen
2     | Kathleen > Ada
3     | Kathleen > Ada > Grace
2     | Kathleen > Linus
~~~

::: note Syntax note
Oracle, SQL Server and Db2 do **not** use the \`RECURSIVE\` keyword — just \`WITH\`. PostgreSQL, MySQL, SQLite, MariaDB, BigQuery, Snowflake and Redshift require it. Write \`WITH RECURSIVE\` where accepted; it is also documentation for the reader.
:::

### Generating series

~~~sql title="A date spine without a calendar table" engine="ansi" run
WITH RECURSIVE days (d) AS (
    SELECT DATE '2026-01-01'
    UNION ALL
    SELECT d + INTERVAL '1 day' FROM days WHERE d < DATE '2026-12-31'
)
SELECT d FROM days;
~~~

Engine shortcuts: \`generate_series()\` (PostgreSQL, DuckDB, CockroachDB), \`GENERATE_DATE_ARRAY()\` (BigQuery), \`GENERATOR()\` (Snowflake), \`numbers()\` (ClickHouse), \`sequence()\` (Trino, Databricks).

### Graph traversal with cycle protection

Recursion over a graph loops forever unless you track visited nodes.

~~~sql title="Cycle-safe traversal" engine="postgresql" run
WITH RECURSIVE reachable AS (
    SELECT src, dst, ARRAY[src] AS visited, 1 AS hops
    FROM   edges WHERE src = 1

    UNION ALL

    SELECT e.src, e.dst, r.visited || e.dst, r.hops + 1
    FROM   edges e
    JOIN   reachable r ON e.src = r.dst
    WHERE  NOT (e.dst = ANY (r.visited))    -- do not revisit
      AND  r.hops < 50
)
SELECT DISTINCT dst, MIN(hops) AS shortest FROM reachable GROUP BY dst;
~~~

PostgreSQL 14+, Db2 and Oracle offer a declarative form:

~~~sql title="SQL:2023 CYCLE clause" engine="postgresql"
WITH RECURSIVE reachable (src, dst) AS (…)
CYCLE dst SET is_cycle USING path
SELECT * FROM reachable WHERE NOT is_cycle;
~~~

::: danger An unbounded recursive CTE will consume the machine
Without a depth guard or cycle check, a single cyclic edge produces infinite rows. MySQL caps iterations at \`cte_max_recursion_depth\` (default 1000); SQL Server defaults to \`OPTION (MAXRECURSION 100)\`. PostgreSQL and SQLite have **no default limit** — add \`WHERE depth < n\` yourself.
:::

## Oracle's CONNECT BY

Oracle's proprietary hierarchical syntax predates recursive CTEs and is still ubiquitous in Oracle codebases:

~~~sql title="CONNECT BY" engine="oracle"
SELECT LEVEL AS depth, LPAD(' ', 2*(LEVEL-1)) || name AS tree, SYS_CONNECT_BY_PATH(name, '>') AS path
FROM   employees
START WITH manager_id IS NULL
CONNECT BY PRIOR id = manager_id
ORDER SIBLINGS BY name;
~~~

\`LEVEL\`, \`SYS_CONNECT_BY_PATH\`, \`CONNECT_BY_ROOT\`, \`CONNECT_BY_ISLEAF\` and \`NOCYCLE\` come with it. Oracle also supports the standard \`WITH\` form; new code should prefer it.

## Data-modifying CTEs

PostgreSQL lets \`INSERT\`/\`UPDATE\`/\`DELETE … RETURNING\` appear inside a \`WITH\`, so a multi-table write becomes one atomic statement.

~~~sql title="Archive-and-delete in a single statement" engine="postgresql" run
WITH moved AS (
    DELETE FROM orders
    WHERE  created_at < now() - interval '2 years'
    RETURNING *
)
INSERT INTO orders_archive SELECT * FROM moved;
~~~

:::support
postgresql=y duckdb=y cockroachdb=y mariadb=n mysql=n sqlite=n sqlserver=n oracle=n snowflake=n bigquery=n redshift=n
:::

::: warn All sub-statements see the same snapshot
In a data-modifying CTE every branch reads the database as it was at statement start. A \`SELECT\` branch will **not** see rows written by an \`INSERT\` branch of the same statement.
:::

## Is a CTE an optimization fence?

Whether the engine inlines a CTE into the main query or materializes it once changes plans dramatically.

| Engine | Behaviour |
| --- | --- |
| PostgreSQL ≤ 11 | Always materialized — a hard optimization fence |
| PostgreSQL 12+ | Inlined when referenced once and not recursive; \`MATERIALIZED\` / \`NOT MATERIALIZED\` force either way |
| SQL Server, Oracle | Inlined by default; Oracle has \`/*+ MATERIALIZE */\` and \`/*+ INLINE */\` hints |
| MySQL 8 | Materialized into a temporary table in most cases |
| SQLite | Inlined when possible (\`MATERIALIZED\` hint available in 3.35+) |
| BigQuery, Snowflake, Redshift | Generally inlined; a CTE referenced n times may be **executed n times** |

~~~sql title="Forcing the choice in PostgreSQL" engine="postgresql"
WITH expensive AS MATERIALIZED (        -- compute once, reuse
    SELECT customer_id, SUM(total) AS revenue FROM orders GROUP BY customer_id
)
SELECT * FROM expensive a JOIN expensive b ON b.revenue = a.revenue AND b.customer_id <> a.customer_id;
~~~

::: tip A CTE referenced many times may be recomputed many times
On warehouses that inline, a CTE used in five places can run five times. If the CTE is expensive, write it to a temporary table instead — and measure, because the opposite (an unnecessary materialization blocking predicate pushdown) is just as common.
:::
`,
    related: [
      { label: 'Subqueries', href: '/sql/subqueries/' },
      { label: 'Window functions', href: '/windows/' },
      { label: 'Recursive recipes', href: '/cookbook/#hierarchy' },
      { label: 'Performance', href: '/performance/' },
    ],
  },

  {
    slug: 'set-operations',
    title: 'UNION, INTERSECT & EXCEPT',
    category: 'Composition',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Combining result sets vertically: duplicate handling, NULL semantics, type reconciliation and dialect names.',
    keywords: 'union union all intersect except minus set operation duplicate distinct compatible types corresponding',
    body: `
Set operations combine result sets **vertically**. Joins add columns; set operations add rows.

~~~sql title="The four operations" engine="ansi" run
SELECT email FROM customers
UNION                                  -- both sides, duplicates removed
SELECT email FROM leads;

SELECT email FROM customers
UNION ALL                              -- both sides, duplicates kept — much faster
SELECT email FROM leads;

SELECT email FROM customers
INTERSECT                              -- rows present in both
SELECT email FROM leads;

SELECT email FROM customers
EXCEPT                                 -- in the first, not in the second
SELECT email FROM leads;
~~~

| Operation | Duplicates | Oracle name | Notes |
| --- | --- | --- | --- |
| \`UNION\` | Removed | \`UNION\` | Requires a sort or hash — often the expensive part |
| \`UNION ALL\` | Kept | \`UNION ALL\` | No dedup step; prefer it when you know the sets are disjoint |
| \`INTERSECT\` | Removed | \`INTERSECT\` | \`INTERSECT ALL\` keeps min(m,n) copies |
| \`EXCEPT\` | Removed | **\`MINUS\`** | \`EXCEPT ALL\` keeps m−n copies |

:::support
postgresql=y mysql=y~8.0.31+_INTERSECT/EXCEPT sqlite=y sqlserver=y~EXCEPT oracle=y~MINUS db2=y snowflake=y bigquery=y~DISTINCT_required redshift=y duckdb=y clickhouse=y trino=y mariadb=y~10.3+
:::

::: note Oracle spells EXCEPT as MINUS
Oracle 21c+ also accepts \`EXCEPT\`. Earlier versions accept only \`MINUS\`. \`INTERSECT\` is spelled the same everywhere.
:::

::: warn BigQuery requires the modifier
BigQuery rejects a bare \`INTERSECT\` or \`EXCEPT\`: write \`INTERSECT DISTINCT\` or \`EXCEPT DISTINCT\`. \`UNION\` must be \`UNION ALL\` or \`UNION DISTINCT\`.
:::

## UNION vs UNION ALL

\`UNION\` does extra work: it must compare every output row against every other. On large result sets that is a sort or a hash aggregate over the entire output.

~~~sql title="Use ALL when duplicates are impossible or acceptable" engine="ansi"
-- these sets cannot overlap — UNION would sort millions of rows for nothing
SELECT id, 'order' AS kind FROM orders_2025
UNION ALL
SELECT id, 'order' AS kind FROM orders_2026;
~~~

::: tip UNION ALL is the default choice
Reach for \`UNION\` only when you actually need deduplication. A surprising share of slow reports are \`UNION\`s that should have been \`UNION ALL\`.
:::

## The rules

**1. Same number of columns, in the same order.** Names come from the first branch; the others' names are ignored.

~~~sql title="Column names come from the first SELECT" engine="ansi"
SELECT email AS contact FROM customers
UNION ALL
SELECT phone FROM leads;          -- result column is named "contact"
~~~

**2. Compatible types, reconciled to a common type.** \`INT\` and \`BIGINT\` unify; \`INT\` and \`DATE\` do not. Strict engines (BigQuery, Snowflake, Databricks in ANSI mode) reject implicit conversions others allow.

~~~sql title="Cast explicitly when branches differ" engine="ansi" run
SELECT id, CAST(amount AS NUMERIC(12,2)) AS amount FROM legacy_payments
UNION ALL
SELECT id, amount FROM payments;
~~~

**3. \`NULL\`s are equal for deduplication.** \`UNION\`, \`INTERSECT\` and \`EXCEPT\` treat two \`NULL\`s as the same value — unlike \`=\` in a \`WHERE\` clause.

**4. \`ORDER BY\` applies to the whole result** and goes at the very end. To order within a branch, wrap it in a derived table.

~~~sql title="One ORDER BY, at the end" engine="ansi" run
SELECT id, email, 'customer' AS source FROM customers
UNION ALL
SELECT id, email, 'lead'     AS source FROM leads
ORDER BY email;                 -- applies to the combined result
~~~

~~~sql title="Limiting a single branch" engine="ansi" run
(SELECT id, email FROM customers ORDER BY created_at DESC LIMIT 10)
UNION ALL
(SELECT id, email FROM leads ORDER BY created_at DESC LIMIT 10)
ORDER BY email;
~~~

Parenthesised branches with their own \`ORDER BY … LIMIT\` work in PostgreSQL, MySQL and SQLite. SQL Server and Oracle require a derived table instead.

## Precedence

\`INTERSECT\` binds tighter than \`UNION\` and \`EXCEPT\` in the standard (and in PostgreSQL, SQL Server and Db2). Oracle historically evaluates strictly left to right. **Use parentheses** — it costs nothing and removes the ambiguity:

~~~sql title="Say what you mean" engine="ansi"
(SELECT id FROM a UNION SELECT id FROM b) EXCEPT SELECT id FROM c;
SELECT id FROM a UNION (SELECT id FROM b EXCEPT SELECT id FROM c);
~~~

## Comparing two tables

\`EXCEPT\` in both directions is the fastest way to diff two result sets:

~~~sql title="What differs, and in which direction" engine="ansi" run
SELECT 'only_in_source' AS side, * FROM (SELECT * FROM source EXCEPT SELECT * FROM target) s
UNION ALL
SELECT 'only_in_target' AS side, * FROM (SELECT * FROM target EXCEPT SELECT * FROM source) t;
~~~

Because \`EXCEPT\` compares whole rows and treats \`NULL\`s as equal, this catches every difference including \`NULL\` transitions — which a join on the key would miss. See the [cookbook recipe](/cookbook/#compare-tables) for the MySQL version, which has no \`EXCEPT\` before 8.0.31.
`,
    related: [
      { label: 'Joins', href: '/joins/' },
      { label: 'Cookbook: compare two tables', href: '/cookbook/#compare-tables' },
      { label: 'CTEs', href: '/sql/cte/' },
      { label: 'Data types', href: '/datatypes/' },
    ],
  },
];
