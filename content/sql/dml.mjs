export const section = { id: 'dml', title: 'DML — Data Manipulation', order: 3 };

export default [
  {
    slug: 'select',
    title: 'SELECT',
    category: 'DML',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'The full SELECT anatomy, clause evaluation order, aliases, expressions, and what SELECT * really costs.',
    keywords: 'select from where group by having order by limit alias distinct expression projection star',
    body: `
\`SELECT\` retrieves rows. Every other query construct — joins, subqueries, CTEs, windows, set operations — hangs off it.

~~~sql title="Full clause order (as written)" engine="ansi"
SELECT   [DISTINCT] select_list
FROM     table_reference [join …]
WHERE    row_predicate
GROUP BY grouping_columns
HAVING   group_predicate
WINDOW   window_name AS (…)
ORDER BY sort_expressions
LIMIT    n OFFSET m
~~~

Remember that the *evaluation* order differs: \`FROM → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT\`. See [what is SQL](/sql/what-is-sql/#logical-evaluation-order).

~~~sql title="A realistic query" engine="ansi" run
SELECT   c.country,
         COUNT(*)                                    AS orders,
         SUM(o.total)                                AS revenue,
         SUM(o.total) / NULLIF(COUNT(DISTINCT c.id), 0) AS revenue_per_customer
FROM     orders o
JOIN     customers c ON c.id = o.customer_id
WHERE    o.status = 'paid'
  AND    o.created_at >= DATE '2026-01-01'
GROUP BY c.country
HAVING   SUM(o.total) > 10000
ORDER BY revenue DESC
LIMIT    20;
~~~

## The select list

You can project columns, literals, expressions, function calls, subqueries and window functions.

~~~sql title="Everything that can appear in a select list" engine="ansi"
SELECT
    o.id,                                             -- column
    'order'                            AS record_type,-- literal
    o.total * 1.2                      AS total_gross,-- expression
    UPPER(c.email)                     AS email,      -- function
    CASE WHEN o.total > 500 THEN 'large' ELSE 'small' END AS bucket,
    (SELECT MAX(paid_at) FROM payments p WHERE p.order_id = o.id) AS last_payment,
    ROW_NUMBER() OVER (PARTITION BY o.customer_id ORDER BY o.created_at) AS seq
FROM orders o JOIN customers c ON c.id = o.customer_id;
~~~

## Aliases

\`AS\` is optional for columns in every engine and for tables in most, but writing it is clearer and avoids a nasty class of typo:

~~~sql title="A missing comma silently becomes an alias" engine="ansi"
SELECT first_name last_name FROM users;   -- ONE column, aliased 'last_name'. No error.
SELECT first_name, last_name FROM users;  -- what you meant
~~~

Double quotes make aliases with spaces or case; single quotes are **strings**, not identifiers (SQL Server and MySQL accept them here, but it is not portable):

~~~sql title="Quoting aliases" engine="ansi"
SELECT total AS "Total Revenue" FROM orders;   -- portable
~~~

## SELECT DISTINCT

Removes duplicate result rows after the select list is evaluated. It considers \`NULL\`s equal to each other.

~~~sql title="DISTINCT applies to the whole row" engine="ansi" run
SELECT DISTINCT country, city FROM customers;  -- distinct PAIRS, not distinct countries
~~~

PostgreSQL adds \`DISTINCT ON\`, which keeps the first row per group according to \`ORDER BY\`:

~~~sql title="Latest order per customer, in one clause" engine="postgresql" run
SELECT DISTINCT ON (customer_id) customer_id, id, total, created_at
FROM   orders
ORDER  BY customer_id, created_at DESC;
~~~

:::support
postgresql=y~DISTINCT_ON duckdb=y~DISTINCT_ON mysql=n sqlite=n sqlserver=n oracle=n bigquery=n snowflake=n redshift=n
:::

The portable equivalent uses a window function — see the [cookbook recipe](/cookbook/#latest-row-per-group).

## SELECT without FROM

~~~sql title="Scalar evaluation" engine="ansi" run
SELECT 1 + 1;                       -- PostgreSQL, MySQL, SQLite, SQL Server, Snowflake, BigQuery, DuckDB
SELECT 1 + 1 FROM dual;             -- Oracle (DUAL is a one-row dummy table); MySQL also accepts it
SELECT 1 + 1 FROM sysibm.sysdummy1; -- Db2
~~~

## SELECT *

Convenient in the console, a liability in code.

- **Breaks on schema change.** A new column appears in every result; a dropped one breaks positional access.
- **Defeats index-only scans.** A covering index cannot satisfy \`SELECT *\`, forcing a heap/table lookup per row.
- **Costs real money on columnar engines.** BigQuery, Redshift, Snowflake, ClickHouse and Databricks read only referenced columns. \`SELECT *\` on a 200-column table can scan 50× the bytes — and BigQuery bills on bytes scanned.
- **Ambiguous after joins.** Two \`id\` columns in the result, order dependent on the join order.

~~~sql title="Excluding columns without listing them all" engine="bigquery"
SELECT * EXCEPT (password_hash, internal_notes) FROM users;         -- BigQuery
SELECT * REPLACE (UPPER(email) AS email) FROM users;                -- BigQuery
~~~
~~~sql title="Same idea elsewhere" engine="snowflake"
SELECT * EXCLUDE (password_hash) FROM users;              -- Snowflake, DuckDB
SELECT * EXCEPT (password_hash) FROM users;               -- Databricks, DuckDB
-- PostgreSQL, MySQL, SQL Server, Oracle: no equivalent — list the columns.
~~~

## Row limiting

The single least portable clause in daily use. Full comparison in the [dialect diff](/comparison/#limit-rows).

| Engine | Syntax |
| --- | --- |
| PostgreSQL, MySQL, SQLite, Redshift, BigQuery, Snowflake, DuckDB, ClickHouse, CockroachDB | \`LIMIT 10 OFFSET 20\` |
| SQL Server, Synapse | \`SELECT TOP 10 …\` or \`OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY\` (needs \`ORDER BY\`) |
| Oracle 12c+, Db2, PostgreSQL 8.4+ | \`OFFSET 20 ROWS FETCH FIRST 10 ROWS ONLY\` (ANSI) |
| Oracle 11g and earlier | \`WHERE ROWNUM <= 10\` wrapped around an ordered subquery |
`,
    related: [
      { label: 'WHERE', href: '/sql/where/' },
      { label: 'GROUP BY', href: '/sql/group-by/' },
      { label: 'Joins', href: '/joins/' },
      { label: 'LIMIT & pagination', href: '/sql/limit/' },
    ],
  },

  {
    slug: 'insert',
    title: 'INSERT',
    category: 'DML',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'Single and multi-row inserts, INSERT … SELECT, RETURNING, upserts, and bulk-loading throughput.',
    keywords: 'insert into values select returning upsert on conflict on duplicate key ignore bulk load copy',
    body: `
~~~sql title="The forms" engine="ansi" run
-- single row
INSERT INTO customers (email, country) VALUES ('a@example.com', 'DE');

-- multiple rows in one statement (SQL-92; universal except very old Oracle)
INSERT INTO customers (email, country) VALUES
    ('a@example.com', 'DE'),
    ('b@example.com', 'FR'),
    ('c@example.com', 'ES');

-- from a query
INSERT INTO customers_archive (id, email, country)
SELECT id, email, country FROM customers WHERE created_at < DATE '2020-01-01';

-- default row
INSERT INTO audit_log DEFAULT VALUES;
~~~

::: tip Always name the columns
\`INSERT INTO t VALUES (…)\` binds to column *position*. Adding a column to the middle of the table silently changes what your inserts mean.
:::

~~~sql title="Oracle multi-row insert" engine="oracle"
-- Oracle has no VALUES row constructor list for multiple rows:
INSERT ALL
    INTO customers (email, country) VALUES ('a@example.com', 'DE')
    INTO customers (email, country) VALUES ('b@example.com', 'FR')
SELECT * FROM dual;
~~~

## Returning generated values

~~~sql title="RETURNING" engine="postgresql" run
INSERT INTO orders (customer_id, total) VALUES (42, 99.00)
RETURNING id, created_at;
~~~

:::support
postgresql=y mariadb=y sqlite=y~3.35+ duckdb=y cockroachdb=y oracle=w~RETURNING_INTO db2=w~SELECT_FROM_FINAL_TABLE sqlserver=w~OUTPUT_INSERTED mysql=n~LAST_INSERT_ID() bigquery=n snowflake=n redshift=n
:::

~~~sql title="Per-engine equivalents" engine="ansi"
-- SQL Server
INSERT INTO orders (customer_id, total) OUTPUT INSERTED.id VALUES (42, 99.00);
-- Oracle (PL/SQL)
INSERT INTO orders (customer_id, total) VALUES (42, 99.00) RETURNING id INTO v_id;
-- Db2
SELECT id FROM FINAL TABLE (INSERT INTO orders (customer_id, total) VALUES (42, 99.00));
-- MySQL
INSERT INTO orders (customer_id, total) VALUES (42, 99.00);
SELECT LAST_INSERT_ID();   -- per connection; with multi-row insert returns the FIRST id
~~~

## Upsert — insert or update

~~~sql title="PostgreSQL / SQLite / DuckDB / CockroachDB" engine="postgresql" run
INSERT INTO inventory (sku, quantity, updated_at)
VALUES ('ABC-1', 10, now())
ON CONFLICT (sku) DO UPDATE
    SET quantity   = inventory.quantity + EXCLUDED.quantity,
        updated_at = EXCLUDED.updated_at
WHERE inventory.quantity <> EXCLUDED.quantity;   -- optional guard

INSERT INTO inventory (sku, quantity) VALUES ('ABC-1', 10)
ON CONFLICT DO NOTHING;
~~~

~~~sql title="MySQL / MariaDB" engine="mysql"
INSERT INTO inventory (sku, quantity) VALUES ('ABC-1', 10)
ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity);
-- MySQL 8.0.20+ prefers an alias over the deprecated VALUES():
INSERT INTO inventory (sku, quantity) VALUES ('ABC-1', 10) AS new
ON DUPLICATE KEY UPDATE quantity = inventory.quantity + new.quantity;

INSERT IGNORE INTO inventory (sku, quantity) VALUES ('ABC-1', 10);  -- swallows ALL errors, not just duplicates
~~~

~~~sql title="SQL Server / Oracle / Snowflake / BigQuery — MERGE" engine="sqlserver"
MERGE INTO inventory AS t
USING (SELECT 'ABC-1' AS sku, 10 AS quantity) AS s
   ON t.sku = s.sku
WHEN MATCHED     THEN UPDATE SET t.quantity = t.quantity + s.quantity
WHEN NOT MATCHED THEN INSERT (sku, quantity) VALUES (s.sku, s.quantity);
~~~

::: warn INSERT IGNORE hides real errors
MySQL's \`INSERT IGNORE\` downgrades every error to a warning — duplicate keys, but also truncated strings, invalid dates and failed foreign keys. Prefer \`ON DUPLICATE KEY UPDATE\` or \`INSERT … ON CONFLICT DO NOTHING\` (MySQL 8 has no direct equivalent; use \`ON DUPLICATE KEY UPDATE id = id\`).
:::

## Bulk loading

Row-by-row \`INSERT\` is the slowest way to load data — typically 10–100× slower than the engine's bulk path.

~~~bash title="Native bulk loaders"
# PostgreSQL — COPY is 10-50x faster than INSERT
psql -c "\\copy orders FROM 'orders.csv' WITH (FORMAT csv, HEADER)"

# MySQL
mysql -e "LOAD DATA LOCAL INFILE 'orders.csv' INTO TABLE orders
          FIELDS TERMINATED BY ',' IGNORE 1 LINES"

# SQLite
sqlite3 app.db ".mode csv" ".import orders.csv orders"

# SQL Server
bcp mydb.dbo.orders in orders.csv -c -t, -S localhost -U sa

# DuckDB — reads the file directly, no load step needed
duckdb -c "CREATE TABLE orders AS SELECT * FROM read_csv_auto('orders.csv')"
~~~

~~~sql title="Cloud warehouses load from object storage" engine="snowflake"
-- Snowflake
COPY INTO orders FROM @my_stage/orders/ FILE_FORMAT = (TYPE = CSV SKIP_HEADER = 1);
-- Redshift
COPY orders FROM 's3://bucket/orders/' IAM_ROLE 'arn:aws:iam::…' FORMAT AS CSV IGNOREHEADER 1;
-- BigQuery
LOAD DATA INTO dataset.orders FROM FILES (format = 'CSV', uris = ['gs://bucket/orders*.csv']);
~~~

::: tip Batching rules of thumb
When you must use \`INSERT\`: batch 500–1,000 rows per statement, wrap batches in an explicit transaction (SQLite goes from ~100 to ~50,000 inserts/second this way), use prepared statements, and drop non-essential secondary indexes before a very large load, rebuilding them afterwards.
:::
`,
    related: [
      { label: 'MERGE / upsert', href: '/sql/merge/' },
      { label: 'UPDATE', href: '/sql/update/' },
      { label: 'Sequences', href: '/sql/sequences/' },
      { label: 'Transactions', href: '/transactions/' },
    ],
  },

  {
    slug: 'update',
    title: 'UPDATE',
    category: 'DML',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'UPDATE with joins in each dialect, correlated updates, batching large updates, and the missing-WHERE disaster.',
    keywords: 'update set where from join correlated subquery returning batch limit rows affected',
    body: `
~~~sql title="The basic form" engine="ansi" run
UPDATE customers
SET    country    = 'DE',
       updated_at = CURRENT_TIMESTAMP
WHERE  id = 42;
~~~

::: danger An UPDATE without WHERE updates every row
There is no confirmation prompt. Enable \`SET SQL_SAFE_UPDATES = 1\` in MySQL, run \`BEGIN;\` first in PostgreSQL so you can \`ROLLBACK\`, and habitually write the \`SELECT\` first, then edit it into an \`UPDATE\`.
:::

~~~sql title="The safe workflow" engine="postgresql"
BEGIN;
  SELECT count(*) FROM customers WHERE country = 'de';   -- 1. verify the target set
  UPDATE customers SET country = 'DE' WHERE country = 'de';
  -- check the reported row count matches
ROLLBACK;   -- or COMMIT
~~~

## UPDATE from another table

Every engine solves this differently — one of the sharpest dialect splits in SQL.

~~~sql title="PostgreSQL / Redshift / DuckDB / CockroachDB" engine="postgresql"
UPDATE orders o
SET    customer_country = c.country
FROM   customers c
WHERE  c.id = o.customer_id
  AND  o.customer_country IS DISTINCT FROM c.country;
~~~

~~~sql title="SQL Server / Synapse" engine="sqlserver"
UPDATE o
SET    o.customer_country = c.country
FROM   orders o
JOIN   customers c ON c.id = o.customer_id;
~~~

~~~sql title="MySQL / MariaDB — join in the UPDATE clause itself" engine="mysql"
UPDATE orders o
JOIN   customers c ON c.id = o.customer_id
SET    o.customer_country = c.country;
~~~

~~~sql title="Oracle / SQLite / Db2 / standard — correlated subquery" engine="oracle"
UPDATE orders o
SET    customer_country = (SELECT c.country FROM customers c WHERE c.id = o.customer_id)
WHERE  EXISTS            (SELECT 1 FROM customers c WHERE c.id = o.customer_id);
~~~

::: warn Omitting the EXISTS guard nulls out non-matching rows
In the correlated form, rows with no matching customer get \`NULL\` — the subquery returns nothing. The \`WHERE EXISTS\` clause restricts the update to rows that actually have a match. This bug is easy to miss because it looks like it worked.
:::

~~~sql title="SQLite 3.33+ also supports UPDATE … FROM" engine="sqlite"
UPDATE orders
SET    customer_country = c.country
FROM   customers c
WHERE  c.id = orders.customer_id;
~~~

## Updating with a window function

Rank, dedupe and number rows in place by joining to a derived table:

~~~sql title="Flagging all but the newest duplicate" engine="postgresql" run
UPDATE contacts c
SET    is_duplicate = TRUE
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at DESC) AS rn
    FROM   contacts
) d
WHERE d.id = c.id AND d.rn > 1;
~~~

## Batching large updates

A single \`UPDATE\` touching millions of rows holds locks for its whole duration, bloats the undo/WAL, and can stall replication. Chunk it.

~~~sql title="PostgreSQL — bounded batches by key range" engine="postgresql"
UPDATE orders SET status = 'archived'
WHERE  id IN (
    SELECT id FROM orders
    WHERE status = 'closed' AND closed_at < now() - interval '1 year'
    ORDER BY id
    LIMIT 5000
    FOR UPDATE SKIP LOCKED        -- don't block on rows another worker holds
);
~~~

~~~sql title="MySQL — LIMIT directly on UPDATE" engine="mysql"
UPDATE orders SET status = 'archived'
WHERE  status = 'closed' AND closed_at < NOW() - INTERVAL 1 YEAR
ORDER BY id
LIMIT 5000;
~~~

~~~sql title="SQL Server — TOP" engine="sqlserver"
UPDATE TOP (5000) dbo.orders SET status = 'archived'
WHERE status = 'closed' AND closed_at < DATEADD(year, -1, SYSUTCDATETIME());
~~~

::: note LIMIT on UPDATE is not portable
MySQL, MariaDB and SQLite (compiled with \`SQLITE_ENABLE_UPDATE_DELETE_LIMIT\`) accept \`LIMIT\` on \`UPDATE\`. PostgreSQL, Oracle and Db2 do not — use the \`IN (SELECT … LIMIT n)\` pattern above.
:::

## Rows affected

| Engine | How to read the count |
| --- | --- |
| PostgreSQL | \`GET DIAGNOSTICS n = ROW_COUNT\` in PL/pgSQL; driver-reported otherwise |
| MySQL | \`ROW_COUNT()\` — by default counts rows *changed*, not matched. \`CLIENT_FOUND_ROWS\` flips this |
| SQL Server | \`@@ROWCOUNT\` |
| Oracle | \`SQL%ROWCOUNT\` |
| SQLite | \`changes()\` |

::: warn MySQL's "0 rows affected" can mean success
If the new values equal the existing ones, MySQL reports 0 changed rows even though the \`WHERE\` matched. Application code that treats 0 as "row not found" will misbehave.
:::
`,
    related: [
      { label: 'DELETE', href: '/sql/delete/' },
      { label: 'MERGE', href: '/sql/merge/' },
      { label: 'Transactions', href: '/transactions/' },
      { label: 'Locking', href: '/transactions/#locking' },
    ],
  },

  {
    slug: 'delete',
    title: 'DELETE',
    category: 'DML',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'DELETE with joins, deleting duplicates, soft deletes, batching, and reclaiming the space afterwards.',
    keywords: 'delete from where using join cascade soft delete batch purge dead tuples vacuum',
    body: `
~~~sql title="Basic DELETE" engine="ansi" run
DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
DELETE FROM sessions;              -- every row; still row-by-row and fully logged
~~~

For emptying a whole table, [\`TRUNCATE\`](/sql/drop-truncate/) is dramatically faster.

## DELETE with a join

~~~sql title="PostgreSQL / Redshift — USING" engine="postgresql"
DELETE FROM order_items oi
USING orders o
WHERE o.id = oi.order_id
  AND o.status = 'cancelled';
~~~

~~~sql title="MySQL / MariaDB — name the table(s) to delete from" engine="mysql"
DELETE oi
FROM   order_items oi
JOIN   orders o ON o.id = oi.order_id
WHERE  o.status = 'cancelled';

DELETE oi, o FROM order_items oi JOIN orders o ON o.id = oi.order_id;  -- both tables
~~~

~~~sql title="SQL Server" engine="sqlserver"
DELETE oi
FROM   order_items oi
JOIN   orders o ON o.id = oi.order_id
WHERE  o.status = 'cancelled';
~~~

~~~sql title="Oracle / SQLite / standard — subquery" engine="oracle"
DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');
~~~

## Deleting duplicates, keeping one

~~~sql title="PostgreSQL — the ctid trick (no key needed)" engine="postgresql" run
DELETE FROM contacts a
USING contacts b
WHERE a.ctid < b.ctid
  AND lower(a.email) = lower(b.email);   -- keeps the physically-last row per email
~~~

~~~sql title="Portable — window function + key" engine="ansi" run
DELETE FROM contacts
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY lower(email) ORDER BY created_at DESC, id) AS rn
        FROM contacts
    ) d
    WHERE d.rn > 1
);
~~~

~~~sql title="MySQL cannot read the target table in a subquery directly" engine="mysql"
-- ERROR 1093 unless you nest one level deeper to force materialization:
DELETE FROM contacts
WHERE id IN (
    SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at DESC) rn
        FROM contacts
    ) AS tmp
    WHERE rn > 1
);
~~~

~~~sql title="SQLite — rowid" engine="sqlite"
DELETE FROM contacts
WHERE rowid NOT IN (SELECT MIN(rowid) FROM contacts GROUP BY lower(email));
~~~

## Soft deletes

Marking rows as deleted rather than removing them keeps history and makes "undo" trivial, at the cost of every query needing a filter.

~~~sql title="Soft delete + a view that hides the flag" engine="postgresql" run
ALTER TABLE customers ADD COLUMN deleted_at TIMESTAMPTZ;

UPDATE customers SET deleted_at = now() WHERE id = 42;

CREATE VIEW active_customers AS SELECT * FROM customers WHERE deleted_at IS NULL;

-- keep unique constraints meaningful for live rows only:
CREATE UNIQUE INDEX uq_customers_email_live ON customers (email) WHERE deleted_at IS NULL;

-- and keep the common path indexed:
CREATE INDEX idx_customers_live ON customers (id) WHERE deleted_at IS NULL;
~~~

::: warn Soft deletes and foreign keys do not mix cleanly
A foreign key cannot express "must reference a *non-deleted* row". Children keep pointing at logically-deleted parents. Either enforce it in application code, or use a trigger, or accept it.
:::

## Batched purge

~~~sql title="Delete a year of history without a long transaction" engine="postgresql"
-- run in a loop until 0 rows are reported
DELETE FROM events
WHERE  id IN (SELECT id FROM events WHERE created_at < now() - interval '1 year'
              ORDER BY id LIMIT 10000);
~~~

~~~sql title="Partition drop — instant, if the table is partitioned by time" engine="postgresql"
ALTER TABLE events DETACH PARTITION events_2024_01;
DROP TABLE events_2024_01;         -- O(1) instead of O(rows)
~~~

::: tip Partition by time for anything with a retention policy
Deleting a month of data from a 2-billion-row table takes hours as a \`DELETE\` and milliseconds as a partition drop. If you know in advance that data expires, partition on the expiry dimension from day one.
:::

## Space is not returned automatically

| Engine | After a large DELETE |
| --- | --- |
| PostgreSQL | Rows become dead tuples. Autovacuum makes the space reusable; \`VACUUM FULL\` (exclusive lock) or \`pg_repack\` (online) returns it to the OS |
| MySQL/InnoDB | Space stays in the tablespace. \`OPTIMIZE TABLE\` rebuilds; with \`innodb_file_per_table\` the file shrinks |
| SQL Server | Pages are deallocated; run \`ALTER INDEX … REBUILD\` to defragment |
| Oracle | High-water mark stays put; \`ALTER TABLE … SHRINK SPACE\` (needs row movement enabled) |
| SQLite | Freed pages are reused; \`VACUUM;\` rewrites the file, or set \`PRAGMA auto_vacuum\` |
`,
    related: [
      { label: 'TRUNCATE', href: '/sql/drop-truncate/' },
      { label: 'UPDATE', href: '/sql/update/' },
      { label: 'Partitioning', href: '/admin/#partitioning' },
      { label: 'Vacuum & maintenance', href: '/admin/#maintenance' },
    ],
  },

  {
    slug: 'merge',
    title: 'MERGE / UPSERT',
    category: 'DML',
    difficulty: 'advanced',
    standard: 'SQL:2003',
    summary: 'The standard MERGE statement, its concurrency caveats, and the native upsert syntax in engines that lack it.',
    keywords: 'merge upsert on conflict on duplicate key when matched slowly changing dimension scd2 idempotent load',
    body: `
\`MERGE\` applies inserts, updates and deletes to a target table from a source in one statement — the standard way to express an upsert or a warehouse load.

~~~sql title="Full MERGE (SQL:2003)" engine="ansi" run
MERGE INTO customers AS t
USING staging_customers AS s
   ON t.id = s.id
WHEN MATCHED AND s.is_deleted = TRUE THEN
    DELETE
WHEN MATCHED AND (t.email, t.country) IS DISTINCT FROM (s.email, s.country) THEN
    UPDATE SET email = s.email, country = s.country, updated_at = CURRENT_TIMESTAMP
WHEN NOT MATCHED THEN
    INSERT (id, email, country) VALUES (s.id, s.email, s.country);
~~~

:::support
postgresql=y~15+ oracle=y sqlserver=y db2=y snowflake=y bigquery=y databricks=y synapse=y teradata=y~ redshift=y~2023+ duckdb=y~1.4+ mysql=n~ON_DUPLICATE_KEY sqlite=n~ON_CONFLICT clickhouse=n cockroachdb=n~UPSERT trino=y~connector_dependent
:::

## When the engine has no MERGE

~~~sql title="PostgreSQL (any version) / SQLite / DuckDB / CockroachDB" engine="postgresql"
INSERT INTO customers (id, email, country)
SELECT id, email, country FROM staging_customers
ON CONFLICT (id) DO UPDATE
   SET email = EXCLUDED.email, country = EXCLUDED.country, updated_at = now()
 WHERE (customers.email, customers.country) IS DISTINCT FROM (EXCLUDED.email, EXCLUDED.country);
~~~

~~~sql title="MySQL / MariaDB" engine="mysql"
INSERT INTO customers (id, email, country)
SELECT id, email, country FROM staging_customers AS s
ON DUPLICATE KEY UPDATE email = s.email, country = s.country;
~~~

~~~sql title="CockroachDB shorthand" engine="cockroachdb"
UPSERT INTO customers (id, email, country) SELECT id, email, country FROM staging_customers;
~~~

::: note ON CONFLICT needs a unique index
\`ON CONFLICT (col)\` requires an actual unique constraint or unique index on \`col\` — the "conflict target". Without one, PostgreSQL raises *"there is no unique or exclusion constraint matching the ON CONFLICT specification"*. Use \`ON CONFLICT ON CONSTRAINT constraint_name\` to be explicit.
:::

## Concurrency: MERGE is not atomic against concurrent writers

Under \`READ COMMITTED\`, two concurrent \`MERGE\` statements can both find no matching row and both attempt an insert; one fails with a duplicate key error, or worse, both succeed if no unique constraint exists.

- **PostgreSQL**: \`INSERT … ON CONFLICT\` *is* internally atomic and is the safe choice under concurrency. \`MERGE\` (15+) is not — it can raise a unique violation and must be retried.
- **SQL Server**: \`MERGE\` requires \`HOLDLOCK\`/\`SERIALIZABLE\` on the target to be safe: \`MERGE INTO t WITH (HOLDLOCK)\`. Without it, deadlocks and duplicate-key errors under load are well documented.
- **Oracle**: \`MERGE\` takes row locks as it goes; concurrent inserts of the same key still collide. A unique constraint plus retry is the reliable pattern.

~~~sql title="The concurrency-safe SQL Server form" engine="sqlserver"
MERGE INTO dbo.customers WITH (HOLDLOCK) AS t
USING (SELECT @id AS id, @email AS email) AS s ON t.id = s.id
WHEN MATCHED     THEN UPDATE SET email = s.email
WHEN NOT MATCHED THEN INSERT (id, email) VALUES (s.id, s.email);
~~~

::: warn Always put a unique constraint behind an upsert
Whatever syntax you use, the only thing that actually prevents duplicates under concurrency is a unique index. The statement then either succeeds or raises a violation you can retry — instead of silently writing two rows.
:::

## A slowly changing dimension (Type 2)

~~~sql title="SCD2 load with MERGE" engine="snowflake" run
MERGE INTO dim_customer AS t
USING (
    SELECT s.customer_id, s.email, s.country, CURRENT_DATE AS effective_from
    FROM   staging_customer s
) AS s
   ON t.customer_id = s.customer_id AND t.is_current = TRUE
WHEN MATCHED AND (t.email <> s.email OR t.country <> s.country) THEN
    UPDATE SET t.is_current = FALSE, t.effective_to = s.effective_from
WHEN NOT MATCHED THEN
    INSERT (customer_id, email, country, effective_from, effective_to, is_current)
    VALUES (s.customer_id, s.email, s.country, s.effective_from, DATE '9999-12-31', TRUE);
-- Note: a single MERGE cannot both close the old row and insert the new one for the
-- same key. Run the INSERT of new versions as a second statement.
~~~

::: danger MERGE cannot match a target row twice
If the source contains two rows with the same join key, standard \`MERGE\` raises an error ("attempted to update the same row twice" / ORA-30926). Deduplicate the source first:

~~~sql
USING (SELECT DISTINCT ON (id) * FROM staging ORDER BY id, updated_at DESC) AS s
~~~
:::
`,
    related: [
      { label: 'INSERT', href: '/sql/insert/' },
      { label: 'UPDATE', href: '/sql/update/' },
      { label: 'Isolation levels', href: '/transactions/#isolation-levels' },
      { label: 'Cookbook: upsert', href: '/cookbook/#upsert' },
    ],
  },
];
