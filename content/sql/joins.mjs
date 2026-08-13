export const section = { id: 'joins', title: 'Joins', order: 5 };

export default [
  {
    slug: 'joins',
    path: '/joins/',
    title: 'SQL Joins',
    category: 'Joins',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Every join type with row-matching diagrams: INNER, LEFT, RIGHT, FULL, CROSS, SELF, LATERAL, semi and anti joins.',
    keywords: 'join inner left right full outer cross self lateral apply semi anti natural using on join algorithms hash merge nested loop',
    body: `
A join combines rows from two tables using a predicate. The join *type* decides what happens to rows with no match on the other side.

:::raw
<div class="joinviz" id="joinviz"></div>
:::

## The sample data

Every example below runs against these two tables. Note the deliberate mismatches: one employee has no department, one department has no employees.

~~~sql title="Setup" engine="ansi" run
CREATE TABLE departments (id INT PRIMARY KEY, name TEXT);
INSERT INTO departments VALUES (1,'Engineering'), (2,'Finance'), (3,'Legal');

CREATE TABLE employees (id INT PRIMARY KEY, name TEXT, dept_id INT);
INSERT INTO employees VALUES
    (1,'Ada',    1),
    (2,'Grace',  1),
    (3,'Linus',  2),
    (4,'Margaret', NULL);   -- no department

SELECT * FROM employees;
~~~

## INNER JOIN

Returns only rows with a match on **both** sides. Unmatched rows from either table disappear.

~~~sql title="INNER JOIN" engine="ansi" run
SELECT e.name, d.name AS department
FROM   employees e
INNER JOIN departments d ON d.id = e.dept_id;
~~~

~~~text title="Result — 3 rows. Margaret and Legal are gone."
name   | department
-------+------------
Ada    | Engineering
Grace  | Engineering
Linus  | Finance
~~~

\`JOIN\` alone means \`INNER JOIN\` in every engine.

## LEFT JOIN (LEFT OUTER JOIN)

Every row from the left table, plus matching right-hand columns — or \`NULL\` where there is no match.

~~~sql title="LEFT JOIN" engine="ansi" run
SELECT e.name, d.name AS department
FROM   employees e
LEFT JOIN departments d ON d.id = e.dept_id;
~~~

~~~text title="Result — 4 rows. Margaret is kept, with NULL department."
name     | department
---------+------------
Ada      | Engineering
Grace    | Engineering
Linus    | Finance
Margaret | NULL
~~~

::: danger The LEFT JOIN that silently became an INNER JOIN
Putting a condition on the right-hand table in \`WHERE\` filters out the \`NULL\`-extended rows, undoing the outer join:

~~~sql
-- BROKEN: behaves like an INNER JOIN
SELECT e.name, d.name FROM employees e
LEFT JOIN departments d ON d.id = e.dept_id
WHERE d.name <> 'Legal';            -- NULL <> 'Legal' is UNKNOWN → Margaret dropped

-- CORRECT: filter in the ON clause
SELECT e.name, d.name FROM employees e
LEFT JOIN departments d ON d.id = e.dept_id AND d.name <> 'Legal';
~~~

**Rule:** conditions on the *outer* (optional) table belong in \`ON\`. Conditions on the *preserved* table belong in \`WHERE\`.
:::

## RIGHT JOIN

The mirror image: every row from the right table. Rarely written in practice — swapping the table order and using \`LEFT JOIN\` reads better and keeps the "preserved" table first.

~~~sql title="RIGHT JOIN" engine="ansi" run
SELECT e.name, d.name AS department
FROM   employees e
RIGHT JOIN departments d ON d.id = e.dept_id;
~~~

~~~text title="Result — 4 rows. Legal is kept, with NULL employee."
name   | department
-------+------------
Ada    | Engineering
Grace  | Engineering
Linus  | Finance
NULL   | Legal
~~~

:::support
postgresql=y mysql=y sqlite=y~3.39+ sqlserver=y oracle=y db2=y snowflake=y bigquery=y redshift=y duckdb=y clickhouse=y trino=y mariadb=y
:::

## FULL OUTER JOIN

Every row from both sides, matched where possible.

~~~sql title="FULL OUTER JOIN" engine="ansi" run
SELECT e.name, d.name AS department
FROM   employees e
FULL OUTER JOIN departments d ON d.id = e.dept_id;
~~~

~~~text title="Result — 5 rows. Both Margaret and Legal survive."
name     | department
---------+------------
Ada      | Engineering
Grace    | Engineering
Linus    | Finance
Margaret | NULL
NULL     | Legal
~~~

:::support
postgresql=y sqlserver=y oracle=y db2=y snowflake=y bigquery=y redshift=y duckdb=y trino=y sqlite=y~3.39+ mysql=n mariadb=n clickhouse=y
:::

~~~sql title="MySQL has no FULL OUTER JOIN — emulate with UNION" engine="mysql"
SELECT e.name, d.name AS department FROM employees e
LEFT JOIN departments d ON d.id = e.dept_id
UNION
SELECT e.name, d.name FROM employees e
RIGHT JOIN departments d ON d.id = e.dept_id;
-- UNION (not UNION ALL) removes the duplicated matched rows.
~~~

## CROSS JOIN

The Cartesian product: every left row paired with every right row. \`n × m\` rows, no predicate.

~~~sql title="CROSS JOIN — 4 × 3 = 12 rows" engine="ansi" run
SELECT e.name, d.name AS department
FROM   employees e
CROSS JOIN departments d;
~~~

Legitimate uses: generating a dense calendar × dimension grid, building test data, or expanding a small lookup set.

~~~sql title="Every day × every product, for gap-filling a report" engine="postgresql" run
SELECT d.day, p.id AS product_id, COALESCE(s.units, 0) AS units
FROM   generate_series(DATE '2026-01-01', DATE '2026-01-31', interval '1 day') AS d(day)
CROSS JOIN products p
LEFT  JOIN sales s ON s.sold_on = d.day AND s.product_id = p.id;
~~~

::: warn An accidental cross join is the classic runaway query
Omitting a join condition — or writing the old comma syntax and forgetting a \`WHERE\` term — turns two million-row tables into 10¹² rows. If a query "hangs", check the plan for a Nested Loop with no join condition.
:::

## SELF JOIN

A table joined to itself, using aliases to distinguish the two roles. The standard way to walk a parent/child hierarchy one level.

~~~sql title="Employees and their managers" engine="ansi" run
SELECT e.name AS employee, m.name AS manager
FROM   employees e
LEFT JOIN employees m ON m.id = e.manager_id;
~~~

~~~sql title="Finding pairs — note the < to avoid duplicates and self-pairs" engine="ansi" run
SELECT a.name, b.name, a.dept_id
FROM   employees a
JOIN   employees b ON b.dept_id = a.dept_id AND b.id > a.id;
~~~

For arbitrary-depth hierarchies you need a [recursive CTE](/sql/cte/#with-recursive), not a self join.

## LATERAL JOIN / CROSS APPLY

A lateral subquery can reference columns from tables **earlier in the FROM clause** — effectively a correlated subquery that returns multiple rows and columns. The canonical use is "top N per group".

~~~sql title="The three most recent orders per customer" engine="postgresql" run
SELECT c.id, c.email, o.id AS order_id, o.total, o.created_at
FROM   customers c
CROSS JOIN LATERAL (
    SELECT id, total, created_at
    FROM   orders
    WHERE  customer_id = c.id      -- references c — only legal because of LATERAL
    ORDER  BY created_at DESC
    LIMIT  3
) o;
~~~

Use \`LEFT JOIN LATERAL … ON TRUE\` to keep customers with no orders.

~~~sql title="SQL Server / Oracle spelling" engine="sqlserver"
SELECT c.id, c.email, o.id, o.total
FROM   customers c
CROSS APPLY (SELECT TOP 3 id, total FROM orders WHERE customer_id = c.id ORDER BY created_at DESC) o;
-- OUTER APPLY keeps customers with no orders (like LEFT JOIN LATERAL)
~~~

:::support
postgresql=y~LATERAL oracle=y~both_spellings sqlserver=y~APPLY db2=y snowflake=y~LATERAL bigquery=w~UNNEST_correlation duckdb=y trino=y mysql=y~8.0.14+_LATERAL mariadb=n sqlite=n redshift=n~limited clickhouse=n cockroachdb=y
:::

## Semi and anti joins

Not spelled as join keywords in standard SQL — expressed with \`EXISTS\` / \`NOT EXISTS\` and recognised by the optimizer.

~~~sql title="Semi join — customers who have ordered (each customer once)" engine="ansi" run
SELECT c.* FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
~~~

~~~sql title="Anti join — customers who never ordered" engine="ansi" run
SELECT c.* FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
~~~

A plain \`INNER JOIN\` would duplicate a customer once per order; the semi join returns each customer exactly once without a \`DISTINCT\`.

## USING and NATURAL JOIN

~~~sql title="USING — shorthand when the column names match" engine="ansi" run
SELECT * FROM orders JOIN customers USING (customer_id);
-- the join column appears ONCE in the result, unqualified
~~~

~~~sql title="NATURAL JOIN — joins on every same-named column" engine="ansi"
SELECT * FROM orders NATURAL JOIN customers;   -- do not use this
~~~

::: danger Never use NATURAL JOIN in production
It silently joins on **every** column the two tables happen to share. Add a \`created_at\` column to both tables in a later migration and the join condition changes underneath you, producing wrong results with no error. \`USING\` is safe because the columns are named explicitly.
:::

## Join algorithms

The engine picks one; understanding them explains most plan surprises.

| Algorithm | How it works | Best when | Cost |
| --- | --- | --- | --- |
| **Nested loop** | For each outer row, probe the inner table (ideally by index) | Small outer set, indexed inner key | O(n × log m) with an index, O(n × m) without |
| **Hash join** | Build a hash table on the smaller side, probe with the larger | Large unsorted sets, equality predicates | O(n + m), needs memory; spills to disk |
| **Merge join** | Sort both sides, walk them in step | Both inputs already sorted (e.g. by index) | O(n log n + m log m), or O(n + m) if pre-sorted |

~~~sql title="Reading the choice from a plan" engine="postgresql"
EXPLAIN ANALYZE SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id;
--  Hash Join  (cost=… rows=… )                    ← chosen algorithm
--    Hash Cond: (o.customer_id = c.id)
--    ->  Seq Scan on orders o
--    ->  Hash  (…)  Buckets: 8192  Batches: 1     ← Batches > 1 means it spilled to disk
--          ->  Seq Scan on customers c
~~~

::: note Only hash joins need equality
A hash join can only serve equality predicates (\`a.x = b.y\`). Range or inequality joins (\`a.start < b.end\`) force a nested loop or merge join — which is why \`BETWEEN\`-style joins on large tables are so often the slow part of a query.
:::

## Join order and the optimizer

You write joins in one order; the optimizer reorders them freely (inner joins are commutative and associative). Outer joins constrain reordering, which is one reason a query with many \`LEFT JOIN\`s can plan worse than the equivalent inner joins.

With more than ~8–12 tables, most planners give up on exhaustive search and use heuristics (PostgreSQL switches to a genetic algorithm at \`geqo_threshold\`, default 12). Splitting a very wide query into CTEs or temp tables can produce a better plan than trusting the search.
`,
    related: [
      { label: 'Subqueries', href: '/sql/subqueries/' },
      { label: 'CTEs', href: '/sql/cte/' },
      { label: 'Set operations', href: '/sql/set-operations/' },
      { label: 'Execution plans', href: '/performance/#reading-a-plan' },
    ],
  },
];
