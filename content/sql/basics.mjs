export const section = { id: 'basics', title: 'Basics', order: 1 };

export default [
  {
    slug: 'what-is-sql',
    title: 'What is SQL?',
    category: 'Basics',
    difficulty: 'beginner',
    standard: 'SQL:2023',
    summary: 'SQL is a declarative language for defining and querying relational data. What the standard covers, and why every engine still differs.',
    keywords: 'sql definition ansi standard declarative query language history',
    body: `
SQL (Structured Query Language) is a **declarative** language for defining, manipulating and querying data held in a relational database. You describe *what* result you want; the database's query planner decides *how* to produce it — which indexes to use, which join algorithm to run, in what order.

That single property explains most of SQL's character. There is no loop in \`SELECT\`, no explicit "open file, scan rows". The same query can execute in 3 milliseconds or 3 minutes depending on statistics, indexes and data volume, without a character of it changing.

## A worked example

~~~sql title="One statement, four operations" engine="ansi" run
SELECT   d.name              AS department,
         COUNT(*)            AS headcount,
         ROUND(AVG(e.salary)) AS avg_salary
FROM     employees e
JOIN     departments d ON d.id = e.department_id
WHERE    e.hired_at >= DATE '2020-01-01'
GROUP BY d.name
HAVING   COUNT(*) > 5
ORDER BY avg_salary DESC;
~~~

Nowhere does that statement say "scan the employees table, hash the departments table, aggregate into a hash map". It states a relationship and a shape. The engine picks the strategy.

## The standard, and what it is worth

SQL is standardised by ISO/IEC 9075. The revisions that matter in practice:

| Revision | Year | Notable additions |
| --- | --- | --- |
| SQL-92 | 1992 | The baseline most people mean by "standard SQL": \`JOIN\` syntax, subqueries, \`CASE\`, string/date types |
| SQL:1999 | 1999 | Recursive queries (\`WITH RECURSIVE\`), triggers, user-defined types, \`GROUPING SETS\` |
| SQL:2003 | 2003 | Window functions, \`MERGE\`, sequence generators, XML |
| SQL:2008 | 2008 | \`FETCH FIRST … ROWS ONLY\`, \`INSTEAD OF\` triggers, \`TRUNCATE\` |
| SQL:2011 | 2011 | Temporal tables (system- and application-time periods), extended window frames |
| SQL:2016 | 2016 | \`JSON\` functions, row pattern matching (\`MATCH_RECOGNIZE\`), polymorphic table functions |
| SQL:2023 | 2023 | \`JSON\` data type, property graph queries (SQL/PGQ), \`ANY_VALUE\` |

::: warn Conformance is partial, everywhere
No shipping database implements the full standard, and every database ships features the standard never described. Treat "standard SQL" as a *portability budget*, not a guarantee. This reference marks each construct as ANSI or vendor-specific, and shows the differences rather than averaging them away.
:::

## The sublanguages

SQL is usually split into functional groups. The boundaries are conventional, not defined by the standard, but the vocabulary is universal:

| Group | Stands for | Statements |
| --- | --- | --- |
| **DDL** | Data Definition Language | \`CREATE\`, \`ALTER\`, \`DROP\`, \`TRUNCATE\`, \`COMMENT\` |
| **DML** | Data Manipulation Language | \`SELECT\`, \`INSERT\`, \`UPDATE\`, \`DELETE\`, \`MERGE\` |
| **DCL** | Data Control Language | \`GRANT\`, \`REVOKE\` |
| **TCL** | Transaction Control Language | \`BEGIN\`, \`COMMIT\`, \`ROLLBACK\`, \`SAVEPOINT\` |

Some texts classify \`SELECT\` separately as DQL (Data Query Language). Nothing depends on the label.

## Logical evaluation order

SQL clauses are *written* in one order and *evaluated* in another. This is the single most useful thing a beginner can memorise, because it explains three quarters of "why can't I use my alias there?" errors.

~~~text title="Logical processing order"
1.  FROM        — resolve tables, apply joins
2.  WHERE       — filter individual rows
3.  GROUP BY    — collapse rows into groups
4.  HAVING      — filter groups
5.  SELECT      — evaluate expressions, assign aliases
6.  DISTINCT    — remove duplicate result rows
7.  ORDER BY    — sort the result
8.  LIMIT/OFFSET— slice the result
~~~

So a \`SELECT\` alias is not visible in \`WHERE\` (step 2 runs before step 5) but *is* visible in \`ORDER BY\` (step 7 runs after):

~~~sql title="Alias visibility" engine="ansi"
SELECT price * quantity AS line_total
FROM   order_items
WHERE  price * quantity > 100   -- must repeat the expression, alias not yet assigned
ORDER BY line_total DESC;       -- alias is fine here
~~~

::: note Engines that relax this
MySQL, MariaDB, SQLite and ClickHouse permit \`SELECT\` aliases in \`GROUP BY\` and \`HAVING\`; MySQL also allows them in \`HAVING\` per the standard. BigQuery, Snowflake and Databricks additionally allow aliases in \`WHERE\` in many positions. PostgreSQL, SQL Server and Oracle do not — code written against the permissive engines does not port.
:::

## Set semantics, not row semantics

A SQL table is a **multiset** (a bag): unordered, duplicates allowed unless a constraint forbids them. Two consequences trip people up constantly:

- **There is no default order.** Without \`ORDER BY\`, a result's row order is undefined and may change between runs, after a vacuum, or when the plan changes to a parallel scan.
- **\`NULL\` is not a value.** It is a marker for "unknown", and it makes comparisons three-valued. See [NULL handling](/sql/null/).

:::cards
Tables, rows, columns :: /sql/relational-model/ :: The data model underneath the language
NULL and three-valued logic :: /sql/null/ :: Why NULL = NULL is not true
SELECT :: /sql/select/ :: The statement you will write most
Dialect comparison :: /comparison/ :: The same task in eight dialects
:::
`,
    related: [
      { label: 'The relational model', href: '/sql/relational-model/' },
      { label: 'SELECT', href: '/sql/select/' },
      { label: 'NULL', href: '/sql/null/' },
      { label: 'Dialect comparison', href: '/comparison/' },
    ],
  },

  {
    slug: 'relational-model',
    title: 'Relational databases, tables, rows & columns',
    category: 'Basics',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Relations, tuples and attributes — and what tables, rows and columns actually guarantee in a real engine.',
    keywords: 'relational model table row column tuple attribute relation cardinality degree normalization',
    body: `
The relational model, defined by E. F. Codd in 1970, represents all data as **relations**: unordered sets of tuples over a set of named, typed attributes. SQL implements this model loosely — it uses multisets rather than sets, and it adds \`NULL\` — but the vocabulary maps directly.

| Relational theory | SQL | Meaning |
| --- | --- | --- |
| Relation | Table | A named collection of rows with a fixed column list |
| Tuple | Row / record | One entity instance |
| Attribute | Column / field | One named, typed property |
| Domain | Data type | The permitted set of values |
| Cardinality | Row count | How many rows |
| Degree | Column count | How many columns |

## Tables

A table has a name, an ordered column list, and zero or more rows. Column *order* is part of the table definition (it affects \`SELECT *\` and \`INSERT\` without a column list) but is otherwise not meaningful — always name your columns explicitly in production code.

~~~sql title="A table definition with its parts labelled" engine="ansi" run
CREATE TABLE employees (
    id             BIGINT       PRIMARY KEY,        -- identity
    email          VARCHAR(255) NOT NULL UNIQUE,    -- natural key, enforced
    full_name      VARCHAR(120) NOT NULL,
    department_id  INT          REFERENCES departments(id),
    salary         NUMERIC(12,2) CHECK (salary >= 0),
    hired_at       DATE         NOT NULL DEFAULT CURRENT_DATE,
    manager_id     BIGINT       REFERENCES employees(id)  -- self-reference
);
~~~

::: tip Name things in the singular or plural, but pick one
There is no technical difference. \`employees\` (plural table, singular row) is the most common convention in application schemas; Oracle shops often use singular. Consistency matters far more than the choice.
:::

## Rows

A row is one instance. Two rows are *duplicates* if every column compares equal — which, thanks to \`NULL\`, is subtler than it sounds: two rows both containing \`NULL\` in a column are treated as duplicates by \`DISTINCT\`, \`GROUP BY\` and \`UNION\` (which use "not distinct from" semantics), but \`NULL = NULL\` in a \`WHERE\` clause is unknown, not true.

~~~sql title="NULL is one value for grouping, unknown for comparison" engine="postgresql"
SELECT DISTINCT department_id FROM employees;  -- one row for all the NULLs
SELECT * FROM employees WHERE department_id = NULL;  -- always zero rows
SELECT * FROM employees WHERE department_id IS NULL; -- correct
~~~

## Columns

Every column carries a **name**, a **data type**, an optional **default**, a **nullability** flag and optional **constraints**. Types are not decoration — they determine storage size, comparison and sort behaviour, index compatibility and overflow rules.

| Property | Set by | Notes |
| --- | --- | --- |
| Type | \`column_name TYPE\` | See the [data types explorer](/datatypes/) |
| Nullability | \`NOT NULL\` | Columns are nullable by default |
| Default | \`DEFAULT expr\` | Applied when the column is omitted from \`INSERT\`, not when \`NULL\` is passed explicitly |
| Collation | \`COLLATE\` | Governs comparison and sort order for text |
| Generated | \`GENERATED ALWAYS AS (…)\` | Computed from other columns; stored or virtual |
| Identity | \`GENERATED … AS IDENTITY\` | Auto-numbering; see [sequences](/sql/sequences/) |

## Normalization, in one screen

Normalization removes redundancy so that each fact is stored exactly once. The forms in practical use:

- **1NF** — every column holds a single atomic value; no repeating groups, no comma-separated lists in a text column.
- **2NF** — 1NF, plus every non-key column depends on the *whole* primary key (only relevant with composite keys).
- **3NF** — 2NF, plus no non-key column depends on another non-key column (no transitive dependencies).
- **BCNF** — a stricter 3NF: every determinant is a candidate key.

::: note The practical rule
Design in 3NF, then denormalize deliberately, with measurements, when a read path demands it. Analytical warehouses (Redshift, Snowflake, BigQuery, Databricks) routinely use wide denormalized star schemas because joins across billions of rows cost more than duplicated columns.
:::

~~~sql title="Denormalized vs normalized — the same fact" engine="ansi"
-- Not 1NF: a list in a column. Cannot be indexed or joined usefully.
CREATE TABLE orders_bad (id INT, product_names TEXT);  -- 'Widget, Gizmo, Doodad'

-- 1NF+: one row per fact, joinable, indexable, constrainable.
CREATE TABLE orders      (id INT PRIMARY KEY, customer_id INT NOT NULL);
CREATE TABLE order_items (
    order_id   INT NOT NULL REFERENCES orders(id),
    product_id INT NOT NULL REFERENCES products(id),
    quantity   INT NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (order_id, product_id)
);
~~~

## Physical storage differs sharply by engine

The logical model is shared; the physical layout is not, and it drives performance advice that does not transfer between engines.

| Engine | Row layout | Consequence |
| --- | --- | --- |
| PostgreSQL | Heap + separate indexes | Index scans need a heap fetch unless the index covers the query (index-only scan) |
| MySQL/InnoDB | Clustered by primary key | Secondary indexes store the PK, so lookups cost two traversals; keep the PK narrow |
| SQL Server | Heap or clustered index | The clustered index *is* the table |
| SQLite | B-tree per table, rowid-keyed | \`WITHOUT ROWID\` tables cluster on the declared PK |
| Redshift / Snowflake / BigQuery / ClickHouse | Columnar blocks | Reading fewer *columns* is what saves I/O; \`SELECT *\` is genuinely expensive |
`,
    related: [
      { label: 'Primary & foreign keys', href: '/sql/keys/' },
      { label: 'Constraints', href: '/sql/constraints/' },
      { label: 'Data types', href: '/datatypes/' },
      { label: 'Indexes', href: '/indexes/' },
    ],
  },

  {
    slug: 'keys',
    title: 'Primary keys & foreign keys',
    category: 'Basics',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Surrogate vs natural keys, composite keys, referential actions, and the engine-specific behaviour of auto-increment.',
    keywords: 'primary key foreign key composite surrogate natural identity autoincrement serial referential integrity cascade',
    body: `
## Primary keys

A primary key uniquely identifies each row. It implies \`NOT NULL\` + \`UNIQUE\`, and every mainstream engine backs it with an index automatically.

~~~sql title="Three ways to declare one" engine="ansi"
-- column constraint
CREATE TABLE users (id BIGINT PRIMARY KEY, email TEXT NOT NULL);

-- table constraint (required for composite keys)
CREATE TABLE order_items (
    order_id   INT NOT NULL,
    product_id INT NOT NULL,
    quantity   INT NOT NULL,
    CONSTRAINT pk_order_items PRIMARY KEY (order_id, product_id)
);

-- added later
ALTER TABLE users ADD CONSTRAINT pk_users PRIMARY KEY (id);
~~~

### Surrogate vs natural keys

| | Surrogate (generated id) | Natural (real-world value) |
| --- | --- | --- |
| Stability | Never changes | Changes when the world changes (email, ISBN, VAT number) |
| Width | Narrow — 4/8 bytes | Often wide text, inflating every secondary index |
| Joins | Fast integer comparison | Slower string comparison, collation-sensitive |
| Meaning | None — needs a lookup to interpret | Self-describing |
| Recommendation | Default choice for OLTP | Add as a \`UNIQUE\` constraint alongside the surrogate |

::: tip The usual answer
Use a surrogate primary key **and** a \`UNIQUE\` constraint on the natural key. You get stable joins plus enforced business uniqueness. Do not rely on the surrogate alone — without the \`UNIQUE\` constraint nothing stops two rows with the same email.
:::

### Auto-generated keys, per engine

This is one of the least portable areas of SQL.

~~~sql title="Standard identity columns (SQL:2003)" engine="ansi"
CREATE TABLE t (id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name TEXT);
CREATE TABLE u (id INT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY, name TEXT);
~~~

~~~sql title="PostgreSQL" engine="postgresql"
-- Preferred (PG 10+): standard identity
CREATE TABLE t (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
-- Legacy but still ubiquitous: serial types create a sequence + default
CREATE TABLE t (id BIGSERIAL PRIMARY KEY);
~~~

~~~sql title="MySQL / MariaDB" engine="mysql"
CREATE TABLE t (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY);
SELECT LAST_INSERT_ID();
~~~

~~~sql title="SQL Server" engine="sqlserver"
CREATE TABLE t (id BIGINT IDENTITY(1,1) PRIMARY KEY);
SELECT SCOPE_IDENTITY();
-- SQL Server 2012+ also supports sequences and standard IDENTITY
~~~

~~~sql title="SQLite" engine="sqlite"
-- INTEGER PRIMARY KEY aliases the internal rowid; the AUTOINCREMENT keyword
-- only prevents id reuse and adds overhead — usually omit it.
CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT);
~~~

~~~sql title="Oracle" engine="oracle"
-- 12c+
CREATE TABLE t (id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
-- pre-12c pattern
CREATE SEQUENCE t_seq;
CREATE TABLE t (id NUMBER PRIMARY KEY);
-- then: INSERT INTO t VALUES (t_seq.NEXTVAL);
~~~

::: warn Warehouses do not enforce keys
Redshift, Snowflake, BigQuery, Databricks and Synapse accept \`PRIMARY KEY\`/\`FOREIGN KEY\` declarations but **do not enforce them**. They exist purely as optimizer hints. Duplicate rows will land silently; deduplicate in your pipeline. Redshift and Snowflake will produce wrong results from a query the optimizer rewrote assuming an unenforced uniqueness constraint you violated.
:::

## Foreign keys

A foreign key requires that each non-\`NULL\` value in the referencing column exists in the referenced column, which must be a primary key or unique constraint.

~~~sql title="Declaring a foreign key" engine="ansi" run
CREATE TABLE orders (
    id          BIGINT PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES customers (id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);
~~~

### Referential actions

| Action | On delete of the parent | On update of the parent key |
| --- | --- | --- |
| \`NO ACTION\` | Reject — check deferred to end of statement/transaction | Reject |
| \`RESTRICT\` | Reject immediately, cannot be deferred | Reject immediately |
| \`CASCADE\` | Delete the children too | Propagate the new value |
| \`SET NULL\` | Set the child column to \`NULL\` (must be nullable) | Same |
| \`SET DEFAULT\` | Set the child column to its default | Same |

::: danger ON DELETE CASCADE is a loaded gun
A single \`DELETE\` on a parent can silently remove millions of descendant rows across a deep tree, inside one transaction, holding locks the whole time. It is right for genuinely owned data (order → order_items) and wrong for anything a human might want back. Prefer \`RESTRICT\` plus an explicit archival step for everything else.
:::

:::support
postgresql=y mysql=y~InnoDB_only sqlite=w~PRAGMA_foreign_keys=ON sqlserver=y oracle=y~no_ON_UPDATE db2=y cockroachdb=y mariadb=y redshift=n~declarative_only snowflake=n~declarative_only bigquery=n~declarative_only databricks=n~declarative_only clickhouse=n trino=n
:::

::: warn Two footguns worth memorising
**SQLite** does not enforce foreign keys unless you run \`PRAGMA foreign_keys = ON;\` on **every connection** — the default is off for backwards compatibility.

**Oracle** has no \`ON UPDATE\` clause at all. Primary key values are expected to be immutable; propagate updates with a trigger or, better, don't update keys.
:::

### Always index your foreign keys

Only PostgreSQL, SQL Server and Oracle leave the referencing column unindexed by default; MySQL/InnoDB creates one automatically. An unindexed FK column makes every parent delete or update perform a full scan of the child table, and in Oracle it escalates to a share lock on the whole child table.

~~~sql title="The index most schemas are missing" engine="ansi"
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
~~~
`,
    related: [
      { label: 'Constraints', href: '/sql/constraints/' },
      { label: 'Sequences & identity', href: '/sql/sequences/' },
      { label: 'CREATE TABLE', href: '/sql/create/' },
      { label: 'Indexes', href: '/indexes/' },
    ],
  },

  {
    slug: 'constraints',
    title: 'Constraints',
    category: 'Basics',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'NOT NULL, UNIQUE, CHECK, DEFAULT, EXCLUDE and deferrable constraints — with the enforcement gaps in each engine.',
    keywords: 'constraint not null unique check default exclude deferrable validate enforced',
    body: `
Constraints are declarative rules the database enforces on every write, from every client, forever. Application-level validation is advisory; a constraint is the only thing that actually guarantees an invariant holds.

## The catalogue

| Constraint | Guarantees | Index created? |
| --- | --- | --- |
| \`NOT NULL\` | Value is present | No |
| \`UNIQUE\` | No two rows share the value | Yes (all major engines) |
| \`PRIMARY KEY\` | \`UNIQUE\` + \`NOT NULL\`, one per table | Yes |
| \`FOREIGN KEY\` | Value exists in the referenced table | Not automatically (except MySQL) |
| \`CHECK\` | A boolean expression holds per row | No |
| \`DEFAULT\` | Supplies a value when the column is omitted | No |
| \`EXCLUDE\` | No two rows satisfy a set of operator comparisons | Yes (GiST) — PostgreSQL only |

~~~sql title="All of them, on one table" engine="postgresql" run
CREATE TABLE bookings (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id     INT       NOT NULL REFERENCES rooms(id),
    guest_email TEXT      NOT NULL,
    guests      INT       NOT NULL DEFAULT 1,
    period      TSTZRANGE NOT NULL,
    status      TEXT      NOT NULL DEFAULT 'pending',

    CONSTRAINT ck_guests   CHECK (guests BETWEEN 1 AND 8),
    CONSTRAINT ck_status   CHECK (status IN ('pending','confirmed','cancelled')),
    CONSTRAINT ck_email    CHECK (guest_email LIKE '%@%'),
    CONSTRAINT uq_ref      UNIQUE (room_id, period),
    -- no two confirmed bookings for the same room may overlap in time:
    CONSTRAINT ex_overlap  EXCLUDE USING GIST (room_id WITH =, period WITH &&)
                           WHERE (status = 'confirmed')
);
~~~

## UNIQUE and NULL

\`UNIQUE\` permits multiple \`NULL\`s in most engines, because two unknowns are not known to be equal. SQL Server is the notable exception.

| Engine | \`NULL\`s allowed in a UNIQUE column |
| --- | --- |
| PostgreSQL | Many. PG 15+ adds \`UNIQUE NULLS NOT DISTINCT\` to opt into single-NULL behaviour |
| MySQL / MariaDB | Many |
| SQLite | Many |
| Oracle | Many (but a composite unique key with all columns NULL is not stored) |
| **SQL Server** | **Exactly one** — a second \`NULL\` violates the constraint |
| Db2 | One by default; \`EXCLUDING NULL KEYS\` on an index changes it |

~~~sql title="Workaround: a partial unique index for 'at most one active row per user'" engine="postgresql"
CREATE UNIQUE INDEX uq_one_active_session
    ON sessions (user_id)
    WHERE ended_at IS NULL;
~~~

~~~sql title="The same intent in SQL Server" engine="sqlserver"
CREATE UNIQUE INDEX uq_one_active_session
    ON sessions (user_id)
    WHERE ended_at IS NULL;   -- filtered index
~~~

## CHECK constraints

A \`CHECK\` passes when the expression is \`TRUE\` **or \`UNKNOWN\`**. A row with \`NULL\` in the checked column therefore passes unless you also declare \`NOT NULL\` — a subtle and common source of dirty data.

~~~sql title="This does not reject NULL" engine="ansi"
CREATE TABLE products (
    price NUMERIC CHECK (price > 0)      -- NULL price is accepted!
);
CREATE TABLE products_fixed (
    price NUMERIC NOT NULL CHECK (price > 0)
);
~~~

:::support
postgresql=y mysql=y~8.0.16+_enforced mariadb=y sqlite=y sqlserver=y oracle=y db2=y cockroachdb=y duckdb=y redshift=n snowflake=n~parsed_not_enforced bigquery=n databricks=w~CONSTRAINT_on_Delta trino=n clickhouse=w~CONSTRAINT_on_INSERT
:::

::: warn MySQL before 8.0.16 parsed and ignored CHECK
MySQL accepted \`CHECK\` syntax from 5.x onward but silently did nothing with it until 8.0.16. If you inherit a schema from that era, the constraints you think you have may never have been enforced. Re-validate the data before relying on them.
:::

## Adding constraints to a live table

Validating an existing table takes a lock and a full scan. PostgreSQL and Oracle let you split the two phases.

~~~sql title="Two-phase constraint addition (PostgreSQL)" engine="postgresql"
-- 1. Add unvalidated: brief ACCESS EXCLUSIVE lock, no scan. New rows are checked.
ALTER TABLE orders ADD CONSTRAINT ck_total CHECK (total >= 0) NOT VALID;

-- 2. Validate later: SHARE UPDATE EXCLUSIVE only, does not block reads or writes.
ALTER TABLE orders VALIDATE CONSTRAINT ck_total;
~~~

~~~sql title="Oracle equivalent" engine="oracle"
ALTER TABLE orders ADD CONSTRAINT ck_total CHECK (total >= 0) ENABLE NOVALIDATE;
ALTER TABLE orders MODIFY CONSTRAINT ck_total VALIDATE;
~~~

~~~sql title="SQL Server: WITH NOCHECK skips validation of existing rows" engine="sqlserver"
ALTER TABLE orders WITH NOCHECK ADD CONSTRAINT ck_total CHECK (total >= 0);
-- the constraint is now 'untrusted' and the optimizer will ignore it:
ALTER TABLE orders WITH CHECK CHECK CONSTRAINT ck_total;   -- makes it trusted again
~~~

## Deferrable constraints

A deferred constraint is checked at \`COMMIT\` rather than at statement end — necessary for circular references and for bulk swaps of unique values.

~~~sql title="Swapping two unique values in one transaction" engine="postgresql" run
ALTER TABLE pages ADD CONSTRAINT uq_slot UNIQUE (slot) DEFERRABLE INITIALLY IMMEDIATE;

BEGIN;
  SET CONSTRAINTS uq_slot DEFERRED;
  UPDATE pages SET slot = 2 WHERE id = 1;   -- transiently duplicates slot 2
  UPDATE pages SET slot = 1 WHERE id = 2;
COMMIT;                                      -- checked here, and passes
~~~

:::support
postgresql=y oracle=y db2=y cockroachdb=w~unique_only mysql=n~FKs_deferred_only_in_a_sense sqlserver=n sqlite=w~FK_only_DEFERRABLE bigquery=n snowflake=n redshift=n
:::

::: note SQL Server and MySQL have no deferrable constraints
In SQL Server, drop and recreate the constraint, or use a temporary sentinel value. In MySQL, \`SET FOREIGN_KEY_CHECKS = 0\` disables FK checking for the session — a blunt instrument that lets you commit inconsistent data, so re-enable it and validate afterwards.
:::
`,
    related: [
      { label: 'Primary & foreign keys', href: '/sql/keys/' },
      { label: 'ALTER TABLE', href: '/sql/alter/' },
      { label: 'NULL', href: '/sql/null/' },
      { label: 'Indexes', href: '/indexes/' },
    ],
  },

  {
    slug: 'null',
    title: 'NULL & three-valued logic',
    category: 'Basics',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'NULL is not a value. How three-valued logic changes comparisons, aggregates, joins, uniqueness and NOT IN.',
    keywords: 'null is null coalesce nvl ifnull nullif three valued logic unknown not in trap empty string',
    body: `
\`NULL\` marks the **absence of a value** — "unknown" or "not applicable". It is not zero, not an empty string, and not equal to another \`NULL\`. Every comparison involving it yields \`UNKNOWN\`, giving SQL a three-valued logic.

## The truth tables

~~~text title="AND"
        TRUE     FALSE    UNKNOWN
TRUE    TRUE     FALSE    UNKNOWN
FALSE   FALSE    FALSE    FALSE
UNKNOWN UNKNOWN  FALSE    UNKNOWN
~~~

~~~text title="OR"
        TRUE     FALSE    UNKNOWN
TRUE    TRUE     TRUE     TRUE
FALSE   TRUE     FALSE    UNKNOWN
UNKNOWN TRUE     UNKNOWN  UNKNOWN
~~~

\`WHERE\` keeps a row only when the predicate is \`TRUE\`. \`UNKNOWN\` is discarded exactly like \`FALSE\` — which is why the following returns nothing at all:

~~~sql title="Never do this" engine="ansi"
SELECT * FROM employees WHERE manager_id = NULL;   -- 0 rows, always
SELECT * FROM employees WHERE manager_id <> NULL;  -- 0 rows, always
~~~

~~~sql title="Correct" engine="ansi" run
SELECT * FROM employees WHERE manager_id IS NULL;
SELECT * FROM employees WHERE manager_id IS NOT NULL;
~~~

## The NOT IN trap

This is the single most expensive \`NULL\` bug in production SQL. If the subquery returns **even one** \`NULL\`, \`NOT IN\` returns no rows.

~~~sql title="Silently returns zero rows if any manager_id is NULL" engine="ansi"
SELECT * FROM employees
WHERE  id NOT IN (SELECT manager_id FROM employees);
~~~

The reason: \`id NOT IN (1, 2, NULL)\` expands to \`id <> 1 AND id <> 2 AND id <> NULL\`, and that last term is \`UNKNOWN\`, so the whole conjunction can never be \`TRUE\`.

~~~sql title="Three safe rewrites" engine="ansi" run
-- 1. NOT EXISTS — correct, and usually the best plan (anti-join)
SELECT e.* FROM employees e
WHERE NOT EXISTS (SELECT 1 FROM employees m WHERE m.manager_id = e.id);

-- 2. Filter the NULLs out of the subquery
SELECT * FROM employees
WHERE  id NOT IN (SELECT manager_id FROM employees WHERE manager_id IS NOT NULL);

-- 3. LEFT JOIN … IS NULL
SELECT e.* FROM employees e
LEFT JOIN employees m ON m.manager_id = e.id
WHERE m.id IS NULL;
~~~

::: tip Prefer NOT EXISTS
It is \`NULL\`-safe by construction, expresses the intent ("no matching row"), and PostgreSQL, SQL Server and Oracle all compile it to an anti-join. \`NOT IN\` frequently blocks that optimization.
:::

## NULL in aggregates

Aggregate functions **ignore \`NULL\`** — except \`COUNT(*)\`, which counts rows rather than values.

~~~sql title="The COUNT distinction" engine="ansi" run
SELECT COUNT(*)            AS all_rows,        -- counts every row
       COUNT(bonus)        AS rows_with_bonus, -- ignores NULL bonuses
       COUNT(DISTINCT dept) AS distinct_depts, -- ignores NULL depts
       AVG(bonus)          AS avg_bonus,       -- SUM(bonus)/COUNT(bonus), not /COUNT(*)
       SUM(bonus)          AS total_bonus      -- NULL if every bonus is NULL
FROM   employees;
~~~

::: warn AVG is not what you may think
\`AVG(bonus)\` divides by the number of **non-NULL** bonuses. If you want NULLs treated as zero, say so: \`AVG(COALESCE(bonus, 0))\`. The two produce different numbers on the same data, and both are "right" for different questions.
:::

Note also that \`SUM\` over an empty or all-\`NULL\` set returns \`NULL\`, not \`0\`. Wrap it if a number is required: \`COALESCE(SUM(x), 0)\`.

## The NULL-handling functions

| Function | Behaviour | Engines |
| --- | --- | --- |
| \`COALESCE(a, b, …)\` | First non-NULL argument | ANSI — universal |
| \`NULLIF(a, b)\` | \`NULL\` when \`a = b\`, else \`a\` | ANSI — universal |
| \`IFNULL(a, b)\` | Two-argument COALESCE | MySQL, SQLite, BigQuery, Databricks |
| \`NVL(a, b)\` | Two-argument COALESCE | Oracle, Redshift, Db2 |
| \`NVL2(a, b, c)\` | \`b\` if \`a\` is not NULL, else \`c\` | Oracle, Redshift |
| \`ISNULL(a, b)\` | Two-argument COALESCE | SQL Server, Synapse |
| \`a IS NOT DISTINCT FROM b\` | NULL-safe equality | PostgreSQL, Db2, CockroachDB, DuckDB, Trino |
| \`a <=> b\` | NULL-safe equality | MySQL, MariaDB, SQLite, Databricks |

~~~sql title="Guarding a division and a default" engine="ansi" run
SELECT name,
       COALESCE(nickname, first_name, 'anonymous') AS display_name,
       revenue / NULLIF(orders, 0)                 AS avg_order_value  -- no divide-by-zero
FROM   customers;
~~~

## NULL-safe comparison

~~~sql title="Detecting changed values including NULL transitions" engine="postgresql" run
SELECT * FROM staging s
JOIN   target  t ON t.id = s.id
WHERE  s.email IS DISTINCT FROM t.email;    -- TRUE when one side is NULL and the other is not
~~~

~~~sql title="MySQL / SQLite equivalent" engine="mysql"
SELECT * FROM staging s
JOIN   target  t ON t.id = s.id
WHERE  NOT (s.email <=> t.email);
~~~

~~~sql title="Portable fallback" engine="ansi"
WHERE (s.email <> t.email)
   OR (s.email IS NULL AND t.email IS NOT NULL)
   OR (s.email IS NOT NULL AND t.email IS NULL)
~~~

## Sorting

The standard leaves \`NULL\` ordering implementation-defined but provides \`NULLS FIRST\` / \`NULLS LAST\`.

| Engine | Default in \`ORDER BY x ASC\` | \`NULLS FIRST/LAST\` supported |
| --- | --- | --- |
| PostgreSQL, Oracle | NULLs **last** | Yes |
| MySQL, MariaDB, SQLite, SQL Server | NULLs **first** | SQLite 3.30+ and MariaDB yes; MySQL and SQL Server no |
| BigQuery, Snowflake, DuckDB, Databricks | NULLs first (Snowflake: last) | Yes |

~~~sql title="Portable NULL ordering with a sort key" engine="ansi"
SELECT * FROM tasks
ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,  -- NULLs last, everywhere
         due_date;
~~~

::: danger Oracle: '' IS NULL
Oracle treats the zero-length string as \`NULL\` for \`VARCHAR2\`. \`WHERE name = ''\` never matches, and \`INSERT … VALUES ('')\` stores a \`NULL\`. This is Oracle-specific and long-standing; no other major engine behaves this way. Migrations to and from Oracle must handle it explicitly.
:::
`,
    related: [
      { label: 'Constraints', href: '/sql/constraints/' },
      { label: 'WHERE', href: '/sql/where/' },
      { label: 'Aggregate functions', href: '/functions/#aggregate' },
      { label: 'Subqueries', href: '/sql/subqueries/' },
    ],
  },

  {
    slug: 'schemas',
    title: 'Schemas, catalogs & naming',
    category: 'Basics',
    difficulty: 'intermediate',
    standard: 'SQL-92',
    summary: 'Three-part naming, search paths, and what "database" and "schema" mean in each engine — they are not the same thing.',
    keywords: 'schema catalog database namespace search_path qualified name public dbo identifier quoting case sensitivity',
    body: `
The standard defines a three-level namespace: **catalog → schema → object**. Engines map their own concepts onto it inconsistently, which is why a "database" in MySQL is a "schema" in PostgreSQL.

| Engine | Catalog | Schema | Cross-container query in one statement? |
| --- | --- | --- | --- |
| PostgreSQL | database | schema (\`public\` default) | No — one database per connection (or use FDW / dblink) |
| MySQL / MariaDB | *(unused)* | database == schema | **Yes** — \`db1.t\` joined to \`db2.t\` |
| SQL Server / Synapse | database | schema (\`dbo\` default) | Yes — \`db.schema.table\` |
| Oracle | database / PDB | user == schema | Within a PDB; across PDBs via DB links |
| SQLite | attached db (\`main\`, \`temp\`) | *(none)* | Yes, after \`ATTACH DATABASE\` |
| Snowflake | database | schema | Yes — \`db.schema.table\` |
| BigQuery | project | dataset | Yes — \`\` \`project.dataset.table\` \`\` |
| Redshift | database | schema | Yes (cross-database read via federated names) |
| Databricks | catalog | schema | Yes — Unity Catalog \`catalog.schema.table\` |

~~~sql title="Creating and using a schema" engine="ansi" run
CREATE SCHEMA analytics;
CREATE TABLE analytics.daily_revenue (day DATE PRIMARY KEY, amount NUMERIC(14,2));
SELECT * FROM analytics.daily_revenue;
DROP SCHEMA analytics CASCADE;   -- CASCADE drops contained objects too
~~~

## Resolution: search_path and friends

Unqualified names are resolved against an ordered list of schemas.

~~~sql title="PostgreSQL" engine="postgresql"
SHOW search_path;                          -- "$user", public
SET search_path TO analytics, public;      -- session
ALTER ROLE reporting SET search_path TO analytics, public;   -- per role
ALTER DATABASE app SET search_path TO app, public;           -- per database
~~~

~~~sql title="MySQL / SQL Server / Oracle / Snowflake" engine="mysql"
USE analytics;                    -- MySQL, SQL Server, Snowflake, ClickHouse
~~~

~~~sql title="Oracle: schema == user; ALTER SESSION changes the default" engine="oracle"
ALTER SESSION SET CURRENT_SCHEMA = analytics;
~~~

::: danger search_path is a security boundary
A function running as \`SECURITY DEFINER\` with an attacker-controlled \`search_path\` can be tricked into calling a shadowed function or reading a shadowed table. Always pin it:

~~~sql
CREATE FUNCTION admin_op() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public   -- pinned
AS $$ … $$;
~~~
:::

## Identifier quoting and case

Unquoted identifiers are **case-insensitive** but get folded to a canonical case — and the engines disagree on which case.

| Engine | Unquoted folds to | Quote character | Quoted is case-sensitive |
| --- | --- | --- | --- |
| PostgreSQL | lower | \`"name"\` | Yes |
| Oracle, Db2, Snowflake | UPPER | \`"NAME"\` | Yes |
| SQL Server | preserved (comparison follows the collation) | \`[name]\` or \`"name"\` | Depends on collation |
| MySQL / MariaDB | preserved | backtick-quoted \`name\` or \`"name"\` in ANSI_QUOTES mode | Table names follow the filesystem; columns are case-insensitive |
| SQLite | preserved, compared case-insensitively | \`"name"\`, \`[name]\`, backtick-quoted \`name\` | No |
| BigQuery | preserved; datasets/tables case-sensitive | backtick-quoted \`project.dataset.table\` | Yes |

~~~sql title="The classic quoting mistake" engine="postgresql"
CREATE TABLE "MyTable" (id INT);  -- stored as MyTable, exactly
SELECT * FROM MyTable;            -- folds to mytable → ERROR: relation "mytable" does not exist
SELECT * FROM "MyTable";          -- works, forever, in every query you ever write
~~~

::: tip Use snake_case, never quote
Lowercase \`snake_case\` identifiers behave identically in every engine and never require quoting. The moment one \`"CamelCase"\` name enters a schema, every tool, ORM and ad-hoc query has to quote it correctly forever.
:::

## Reserved words

\`user\`, \`order\`, \`group\`, \`table\`, \`from\`, \`select\`, \`key\`, \`value\`, \`timestamp\`, \`level\`, \`rank\` and several hundred others are reserved somewhere. A name that works in MySQL may fail in PostgreSQL or Oracle.

~~~sql title="Avoid, or you will quote forever" engine="ansi"
CREATE TABLE "order" ("user" INT, "timestamp" TIMESTAMP);  -- painful
CREATE TABLE orders  (user_id INT, created_at TIMESTAMP);  -- portable
~~~
`,
    related: [
      { label: 'CREATE', href: '/sql/create/' },
      { label: 'GRANT & REVOKE', href: '/admin/#users-roles-privileges' },
      { label: 'Views', href: '/sql/views/' },
      { label: 'Database explorer', href: '/databases/' },
    ],
  },

  {
    slug: 'views',
    title: 'Views & materialized views',
    category: 'Basics',
    difficulty: 'intermediate',
    standard: 'SQL-92 / SQL:2003',
    summary: 'Stored queries, updatable views, WITH CHECK OPTION, and the refresh strategies for materialized views in each engine.',
    keywords: 'view materialized view create view updatable check option refresh concurrently indexed view',
    body: `
A **view** is a named query. It stores no data: every reference re-executes the underlying statement, and the optimizer usually inlines it into the calling query.

~~~sql title="Creating a view" engine="ansi" run
CREATE VIEW active_customers AS
SELECT c.id, c.email, c.created_at, SUM(o.total) AS lifetime_value
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
WHERE  c.status = 'active'
GROUP BY c.id, c.email, c.created_at;

SELECT * FROM active_customers WHERE lifetime_value > 1000;
~~~

Views are worth using for three reasons: they hide join complexity behind a stable name, they act as a **security boundary** (grant on the view, not the base tables), and they give you a compatibility layer when the physical schema has to change under a live application.

::: note Views are not a performance feature
A plain view costs the same as pasting its body into your query — no more, no less. If you need the result cached, you want a **materialized view** or a summary table.
:::

## Updatable views

The standard allows \`INSERT\`/\`UPDATE\`/\`DELETE\` through a view when the engine can map each result row unambiguously to exactly one base row: a single base table, no aggregation, no \`DISTINCT\`, no \`GROUP BY\`, no set operations, no window functions.

~~~sql title="Automatically updatable" engine="postgresql" run
CREATE VIEW eu_customers AS
SELECT id, email, country FROM customers WHERE country IN ('DE','FR','ES','IT');

UPDATE eu_customers SET email = 'x@y.z' WHERE id = 42;   -- writes through
~~~

\`WITH CHECK OPTION\` stops writes that would create rows the view cannot see:

~~~sql title="Preventing rows from escaping the view" engine="ansi"
CREATE VIEW eu_customers AS
SELECT id, email, country FROM customers WHERE country IN ('DE','FR')
WITH CHECK OPTION;

INSERT INTO eu_customers VALUES (99, 'a@b.c', 'US');
-- ERROR: new row violates check option for view "eu_customers"
~~~

For anything more complex, intercept the write with a trigger:

~~~sql title="INSTEAD OF trigger for a non-updatable view" engine="postgresql"
CREATE FUNCTION customers_view_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO customers (email, country) VALUES (NEW.email, NEW.country)
  RETURNING id INTO NEW.id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_insert INSTEAD OF INSERT ON customer_summary
FOR EACH ROW EXECUTE FUNCTION customers_view_insert();
~~~

:::support
postgresql=y mysql=y~simple_views_auto sqlite=w~INSTEAD_OF_triggers_only sqlserver=y~INSTEAD_OF oracle=y db2=y mariadb=y cockroachdb=w duckdb=n bigquery=n snowflake=n redshift=n
:::

## Materialized views

A materialized view stores the **result**. Queries read the stored rows; the trade-off is staleness plus refresh cost.

~~~sql title="PostgreSQL" engine="postgresql"
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT date_trunc('day', created_at) AS day, SUM(total) AS revenue
FROM   orders GROUP BY 1
WITH DATA;

-- A UNIQUE index is required for CONCURRENTLY:
CREATE UNIQUE INDEX ON daily_revenue (day);

REFRESH MATERIALIZED VIEW daily_revenue;               -- takes an ACCESS EXCLUSIVE lock
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;  -- readers keep working, slower
~~~

~~~sql title="Oracle — with query rewrite and incremental refresh" engine="oracle"
CREATE MATERIALIZED VIEW daily_revenue
  BUILD IMMEDIATE
  REFRESH FAST ON COMMIT           -- incremental, needs a materialized view log
  ENABLE QUERY REWRITE             -- optimizer can silently substitute it
AS SELECT TRUNC(created_at) AS day, SUM(total) AS revenue FROM orders GROUP BY TRUNC(created_at);
~~~

~~~sql title="SQL Server — indexed views refresh synchronously" engine="sqlserver"
CREATE VIEW dbo.daily_revenue WITH SCHEMABINDING AS
SELECT CAST(created_at AS date) AS day, SUM(total) AS revenue, COUNT_BIG(*) AS cnt
FROM   dbo.orders GROUP BY CAST(created_at AS date);

CREATE UNIQUE CLUSTERED INDEX ix_daily_revenue ON dbo.daily_revenue (day);
-- from here the view is maintained on every write to dbo.orders
~~~

~~~sql title="Snowflake / BigQuery — maintained automatically" engine="snowflake"
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT DATE_TRUNC('day', created_at) AS day, SUM(total) AS revenue FROM orders GROUP BY 1;
-- Snowflake: single-table only, no joins, no ORDER BY; maintained by a background service.
~~~

~~~sql title="ClickHouse — an insert trigger, not a cache" engine="clickhouse"
CREATE MATERIALIZED VIEW daily_revenue_mv
ENGINE = SummingMergeTree ORDER BY day
AS SELECT toDate(created_at) AS day, sum(total) AS revenue
   FROM orders GROUP BY day;
-- Fires on INSERT into orders and writes the aggregate. It does NOT see pre-existing rows
-- and does NOT see rows removed by DELETE.
~~~

| Engine | Incremental refresh | Auto refresh | Query rewrite |
| --- | --- | --- | --- |
| PostgreSQL | No — full rebuild | No (schedule it) | No |
| Oracle | Yes (\`FAST\`, with MV logs) | \`ON COMMIT\` / \`ON DEMAND\` | Yes |
| SQL Server (indexed view) | Yes — synchronous | Always | Yes (Enterprise) |
| Snowflake | Yes — background service | Yes | Yes |
| BigQuery | Yes — incremental | Yes (\`enable_refresh\`) | Yes |
| Redshift | Yes (\`AUTO REFRESH YES\`) | Yes | Yes |
| Databricks | Yes (Delta Live Tables / MVs) | Scheduled | Limited |
| ClickHouse | Insert-time only | On insert | No |
| MySQL / SQLite / DuckDB | **Not supported** — use a table + scheduled job | — | — |

::: warn "Materialized view" means five different things
In Oracle and SQL Server it can be maintained transactionally; in PostgreSQL it is a manual snapshot; in ClickHouse it is an insert trigger that never sees historical rows. Read the engine's page before assuming the semantics you know carry over.
:::
`,
    related: [
      { label: 'CREATE', href: '/sql/create/' },
      { label: 'Triggers', href: '/sql/procedures/' },
      { label: 'Performance', href: '/performance/' },
      { label: 'Schemas', href: '/sql/schemas/' },
    ],
  },

  {
    slug: 'sequences',
    title: 'Sequences & identity columns',
    category: 'Basics',
    difficulty: 'intermediate',
    standard: 'SQL:2003',
    summary: 'Generating unique numbers: sequences, identity columns, caching, gaps, and why sequences are not transactional.',
    keywords: 'sequence nextval currval identity autoincrement serial gaps cache cycle uuid snowflake id',
    body: `
A **sequence** is a schema object that hands out numbers. An **identity column** is a column wired to an implicit sequence. Both exist to generate surrogate keys without a race between concurrent inserts.

~~~sql title="Standard sequence (SQL:2003)" engine="ansi" run
CREATE SEQUENCE order_id_seq
    START WITH 1000
    INCREMENT BY 1
    MINVALUE 1000
    MAXVALUE 9223372036854775807
    CACHE 50
    NO CYCLE;

INSERT INTO orders (id, total) VALUES (NEXT VALUE FOR order_id_seq, 99.00);
~~~

| Operation | PostgreSQL | Oracle / Db2 | SQL Server | MariaDB |
| --- | --- | --- | --- | --- |
| Next value | \`nextval('s')\` | \`s.NEXTVAL\` | \`NEXT VALUE FOR s\` | \`NEXTVAL(s)\` |
| Last value (this session) | \`currval('s')\` | \`s.CURRVAL\` | — (\`SCOPE_IDENTITY()\`) | \`LASTVAL(s)\` |
| Reset | \`setval('s', 1)\` | \`ALTER SEQUENCE … RESTART\` | \`ALTER SEQUENCE … RESTART WITH 1\` | \`ALTER SEQUENCE … RESTART\` |

::: warn Sequences are not transactional, by design
\`nextval\` is exempt from rollback. If a transaction consumes id 42 and then rolls back, 42 is gone forever. **Gaps are normal and unavoidable** — a sequence guarantees uniqueness and monotonicity, never contiguity.

If you need gapless numbering (invoice numbers in many jurisdictions), you need a counter table plus a serialised update, and you must accept the write contention that comes with it.
:::

~~~sql title="Gapless numbering — correct, and deliberately serialised" engine="postgresql"
BEGIN;
  UPDATE invoice_counters SET last_number = last_number + 1
   WHERE year = 2026
  RETURNING last_number INTO v_number;      -- row lock held to COMMIT
  INSERT INTO invoices (number, …) VALUES (v_number, …);
COMMIT;
~~~

## Identity columns

~~~sql title="Standard identity" engine="ansi"
CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- cannot be overridden
    -- or: GENERATED BY DEFAULT AS IDENTITY                -- may be supplied explicitly
    total NUMERIC(12,2)
);
~~~

\`GENERATED ALWAYS\` rejects an explicit value unless you override it, which is what you want in normal operation but painful during a data migration:

~~~sql title="Overriding during a migration" engine="postgresql"
INSERT INTO orders (id, total) OVERRIDING SYSTEM VALUE VALUES (5, 10.00);
-- then repair the sequence, or the next natural insert will collide:
SELECT setval(pg_get_serial_sequence('orders','id'), (SELECT MAX(id) FROM orders));
~~~

~~~sql title="SQL Server equivalent" engine="sqlserver"
SET IDENTITY_INSERT dbo.orders ON;
INSERT INTO dbo.orders (id, total) VALUES (5, 10.00);
SET IDENTITY_INSERT dbo.orders OFF;
DBCC CHECKIDENT ('dbo.orders', RESEED);
~~~

::: danger The single most common migration bug
Loading rows with explicit ids and forgetting to advance the sequence. Everything works until the first natural insert, which then fails with a duplicate key error — often days later, in production. Reseed as the last step of every restore or bulk load.
:::

## CACHE and the cost of a crash

\`CACHE n\` preallocates \`n\` values per session in memory. It removes a catalog write per insert (a large throughput win) at the cost of losing the unused block on crash or disconnect — bigger gaps.

Oracle's default cache is 20; PostgreSQL's is 1. Under heavy concurrent insert load in PostgreSQL, raising the cache is a real optimization; in a cluster with logical replication, remember each node caches separately.

## Distributed alternatives

A central sequence is a coordination point that does not scale across nodes or regions.

| Strategy | Sortable | Coordination | Notes |
| --- | --- | --- | --- |
| \`UUIDv4\` | No | None | Random; terrible for clustered-index locality (page splits in InnoDB/SQL Server) |
| \`UUIDv7\` | Yes (time-ordered) | None | Now the default recommendation; PG 18 ships \`uuidv7()\`, others via extension |
| ULID | Yes | None | 26-char lexicographically sortable, same idea as UUIDv7 |
| Snowflake ID | Yes | Node id assignment | 64-bit: timestamp + node + counter; fits \`BIGINT\` |
| \`unique_rowid()\` | Roughly | None | CockroachDB built-in; avoids the hot-range problem of sequential keys |

~~~sql title="Time-ordered UUID keys" engine="postgresql"
-- PostgreSQL 18+
CREATE TABLE events (id UUID PRIMARY KEY DEFAULT uuidv7(), payload JSONB);

-- Earlier versions: pg_uuidv7 extension, or generate in the application
CREATE TABLE events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payload JSONB);
~~~

::: warn UUIDv4 as a clustered primary key
In MySQL/InnoDB and SQL Server the primary key determines physical row order. Random UUIDs scatter inserts across every page in the table, causing page splits, write amplification and a buffer pool that no longer fits the working set. Use \`UUIDv7\`/ULID, or store a \`BIGINT\` key and keep the UUID as a secondary unique column.
:::
`,
    related: [
      { label: 'Primary & foreign keys', href: '/sql/keys/' },
      { label: 'INSERT', href: '/sql/insert/' },
      { label: 'Data types', href: '/datatypes/' },
      { label: 'Transactions', href: '/transactions/' },
    ],
  },
];
