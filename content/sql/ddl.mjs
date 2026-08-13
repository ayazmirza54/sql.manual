export const section = { id: 'ddl', title: 'DDL — Data Definition', order: 2 };

export default [
  {
    slug: 'create',
    title: 'CREATE',
    category: 'DDL',
    difficulty: 'beginner',
    standard: 'SQL-92',
    summary: 'CREATE TABLE, and the vendor clauses that follow it: storage engines, distribution keys, partitioning and CTAS.',
    keywords: 'create table create database create index create view ctas temporary unlogged if not exists storage engine',
    body: `
\`CREATE\` defines objects. The core \`CREATE TABLE\` is portable; nearly everything after the closing parenthesis is not.

~~~sql title="Portable CREATE TABLE" engine="ansi" run
CREATE TABLE customers (
    id          BIGINT       NOT NULL,
    email       VARCHAR(255) NOT NULL,
    full_name   VARCHAR(120),
    country     CHAR(2)      NOT NULL DEFAULT 'US',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_customers PRIMARY KEY (id),
    CONSTRAINT uq_customers_email UNIQUE (email),
    CONSTRAINT ck_customers_country CHECK (country ~ '^[A-Z]{2}$')
);
~~~

## IF NOT EXISTS

:::support
postgresql=y mysql=y sqlite=y mariadb=y cockroachdb=y duckdb=y snowflake=y bigquery=y databricks=y clickhouse=y trino=y redshift=y oracle=n~use_PL/SQL_block sqlserver=n~use_IF_NOT_EXISTS_check db2=n
:::

~~~sql title="SQL Server has no IF NOT EXISTS on CREATE TABLE" engine="sqlserver"
IF OBJECT_ID('dbo.customers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.customers (id BIGINT PRIMARY KEY);
END
~~~

~~~sql title="Oracle needs a PL/SQL block" engine="oracle"
BEGIN
   EXECUTE IMMEDIATE 'CREATE TABLE customers (id NUMBER PRIMARY KEY)';
EXCEPTION
   WHEN OTHERS THEN IF SQLCODE != -955 THEN RAISE; END IF;  -- ORA-00955: name already used
END;
/
~~~

## Table variants

| Variant | Syntax | Lifetime |
| --- | --- | --- |
| Temporary | \`CREATE TEMPORARY TABLE\` / \`CREATE TEMP TABLE\` | Session (or transaction with \`ON COMMIT DROP\`) |
| SQL Server temp | \`CREATE TABLE #local\` / \`##global\` | Session / last session |
| Unlogged | \`CREATE UNLOGGED TABLE\` (PostgreSQL) | Persists, but not crash-safe or replicated — much faster writes |
| Global temporary | \`CREATE GLOBAL TEMPORARY TABLE\` (Oracle, Db2) | Definition permanent, data per session |
| Transient | \`CREATE TRANSIENT TABLE\` (Snowflake) | Persists, no fail-safe period — cheaper |
| External | \`CREATE EXTERNAL TABLE\` | Metadata only; data lives in object storage |

## CREATE TABLE AS SELECT (CTAS)

~~~sql title="CTAS — the fastest way to build a derived table" engine="ansi" run
CREATE TABLE customer_summary AS
SELECT c.id, c.email, COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS lifetime_value
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.id, c.email;
~~~

| Engine | CTAS syntax | Copies constraints/indexes? |
| --- | --- | --- |
| PostgreSQL, MySQL, SQLite, Oracle, Snowflake, Redshift, DuckDB | \`CREATE TABLE t AS SELECT …\` | No — only column names and types |
| SQL Server / Synapse | \`SELECT … INTO t FROM …\` (Synapse also supports CTAS) | No |
| BigQuery, Databricks | \`CREATE TABLE t AS SELECT …\` | No |

~~~sql title="Copy the structure without the data" engine="mysql"
CREATE TABLE archive LIKE orders;            -- MySQL, MariaDB: indexes included
~~~
~~~sql title="PostgreSQL" engine="postgresql"
CREATE TABLE archive (LIKE orders INCLUDING ALL);   -- defaults, constraints, indexes, identity
~~~

## Vendor storage clauses

~~~sql title="MySQL — engine, charset, row format" engine="mysql"
CREATE TABLE events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    body JSON NOT NULL,
    KEY idx_created (created_at)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_0900_ai_ci
  ROW_FORMAT = DYNAMIC;
~~~

~~~sql title="Redshift — distribution and sort keys decide everything" engine="redshift"
CREATE TABLE fact_orders (
    order_id    BIGINT,
    customer_id BIGINT,
    order_date  DATE,
    total       NUMERIC(12,2)
)
DISTSTYLE KEY
DISTKEY (customer_id)          -- co-locate joins on customer_id
COMPOUND SORTKEY (order_date); -- enables zone-map pruning on date ranges
~~~

~~~sql title="BigQuery — partitioning and clustering replace indexes" engine="bigquery"
CREATE TABLE analytics.events (
    event_time TIMESTAMP,
    user_id    STRING,
    name       STRING,
    props      JSON
)
PARTITION BY DATE(event_time)
CLUSTER BY user_id, name
OPTIONS (partition_expiration_days = 400,
         require_partition_filter = TRUE);   -- refuses unpartitioned scans
~~~

~~~sql title="ClickHouse — the engine is mandatory" engine="clickhouse"
CREATE TABLE events (
    event_time DateTime,
    user_id    UInt64,
    name       LowCardinality(String)
) ENGINE = MergeTree
ORDER BY (user_id, event_time)      -- also the sparse primary index
PARTITION BY toYYYYMM(event_time)
TTL event_time + INTERVAL 90 DAY;
~~~

~~~sql title="Oracle — tablespace, partitioning, compression" engine="oracle"
CREATE TABLE sales (
    id NUMBER GENERATED ALWAYS AS IDENTITY,
    sold_on DATE NOT NULL,
    amount NUMBER(12,2)
)
TABLESPACE users
PARTITION BY RANGE (sold_on) INTERVAL (NUMTOYMINTERVAL(1,'MONTH'))
  (PARTITION p0 VALUES LESS THAN (DATE '2024-01-01'))
ROW STORE COMPRESS ADVANCED;
~~~

## Generated columns

~~~sql title="Stored and virtual generated columns" engine="postgresql" run
CREATE TABLE line_items (
    quantity   INT     NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    total      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
~~~

| Engine | Stored | Virtual (computed on read) |
| --- | --- | --- |
| PostgreSQL | Yes | 18+ only (earlier: stored only) |
| MySQL / MariaDB | Yes | Yes (default) |
| SQLite | Yes | Yes (default) |
| SQL Server | \`PERSISTED\` | Yes (default) |
| Oracle | \`VIRTUAL\` columns | Yes |
| BigQuery / Snowflake | Snowflake: yes | BigQuery: no |
`,
    related: [
      { label: 'ALTER', href: '/sql/alter/' },
      { label: 'Constraints', href: '/sql/constraints/' },
      { label: 'Data types', href: '/datatypes/' },
      { label: 'Partitioning', href: '/admin/#partitioning' },
    ],
  },

  {
    slug: 'alter',
    title: 'ALTER',
    category: 'DDL',
    difficulty: 'intermediate',
    standard: 'SQL-92',
    summary: 'Changing live schemas: which ALTERs are instant, which rewrite the table, and how to migrate without downtime.',
    keywords: 'alter table add column drop column rename modify change lock ddl online migration zero downtime',
    body: `
\`ALTER TABLE\` is where portability and *safety* diverge most sharply. The same statement can be a metadata-only flick in one engine and a multi-hour full-table rewrite holding an exclusive lock in another.

## The operations

~~~sql title="Add, drop, rename" engine="ansi" run
ALTER TABLE customers ADD COLUMN phone VARCHAR(32);
ALTER TABLE customers DROP COLUMN phone;
ALTER TABLE customers RENAME COLUMN full_name TO display_name;
ALTER TABLE customers RENAME TO clients;

ALTER TABLE customers ADD CONSTRAINT ck_country CHECK (LENGTH(country) = 2);
ALTER TABLE customers DROP CONSTRAINT ck_country;
~~~

Changing a column type is the least portable statement in common use:

| Engine | Syntax |
| --- | --- |
| PostgreSQL, Db2, CockroachDB | \`ALTER TABLE t ALTER COLUMN c TYPE BIGINT USING c::BIGINT\` |
| MySQL / MariaDB | \`ALTER TABLE t MODIFY c BIGINT NOT NULL\` (repeat every attribute!) |
| SQL Server / Synapse | \`ALTER TABLE t ALTER COLUMN c BIGINT NOT NULL\` |
| Oracle | \`ALTER TABLE t MODIFY (c NUMBER(19))\` |
| SQLite | Not supported — rebuild the table |
| Snowflake, BigQuery | Widening only (\`INT64\`→\`NUMERIC\`, \`VARCHAR(10)\`→\`VARCHAR(20)\`) |

::: danger MySQL MODIFY discards omitted attributes
\`ALTER TABLE t MODIFY c BIGINT\` on a column that was \`NOT NULL DEFAULT 0 COMMENT 'x'\` silently drops the \`NOT NULL\`, the default and the comment. You must restate the entire column definition every time.
:::

## SQLite: the twelve-step rebuild

SQLite supports only \`ADD COLUMN\`, \`RENAME COLUMN\`, \`RENAME TO\` and \`DROP COLUMN\` (3.35+). Everything else means recreating the table.

~~~sql title="The official SQLite table-alteration procedure" engine="sqlite"
PRAGMA foreign_keys = OFF;
BEGIN;
  CREATE TABLE customers_new (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'US'      -- the change
  );
  INSERT INTO customers_new (id, email, country) SELECT id, email, 'US' FROM customers;
  DROP TABLE customers;
  ALTER TABLE customers_new RENAME TO customers;
  CREATE INDEX idx_customers_email ON customers (email);   -- recreate indexes/triggers
COMMIT;
PRAGMA foreign_key_check;
PRAGMA foreign_keys = ON;
~~~

## What locks, and for how long

This table is the difference between a deploy and an outage.

| Operation | PostgreSQL | MySQL 8 (InnoDB) | SQL Server | Oracle |
| --- | --- | --- | --- | --- |
| \`ADD COLUMN\` (nullable, no default) | Instant, metadata only | Instant (\`ALGORITHM=INSTANT\`) | Instant | Instant |
| \`ADD COLUMN\` with a constant default | Instant (PG 11+) | Instant (8.0.12+) | Instant (2012+, Enterprise) | Instant (11g+) |
| \`ADD COLUMN\` with a volatile default | Full rewrite | Rewrite | Rewrite | Rewrite |
| \`DROP COLUMN\` | Instant (space reclaimed on rewrite) | Rebuild (\`INPLACE\`, online) | Instant metadata | \`SET UNUSED\` is instant |
| \`ALTER COLUMN TYPE\` (widening) | Rewrite (some no-ops in 12+) | Often rebuild | Often instant | Often instant |
| \`ADD INDEX\` | \`CREATE INDEX CONCURRENTLY\` avoids blocking | \`ALGORITHM=INPLACE\`, online | \`WITH (ONLINE=ON)\` (Enterprise) | \`ONLINE\` |
| \`ADD NOT NULL\` | Full scan; PG 12+ can use a matching \`CHECK\` to skip it | Rebuild | Scan | Scan (or \`NOVALIDATE\`) |

~~~sql title="Non-blocking index creation" engine="postgresql"
CREATE INDEX CONCURRENTLY idx_orders_customer ON orders (customer_id);
-- Slower, cannot run inside a transaction, and can leave an INVALID index
-- if it fails — check with: SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;
~~~

~~~sql title="MySQL: state the algorithm so a surprise rebuild fails loudly" engine="mysql"
ALTER TABLE orders ADD COLUMN note VARCHAR(255), ALGORITHM = INSTANT;
-- If MySQL cannot do it instantly it errors instead of silently locking the table for an hour.
ALTER TABLE orders ADD INDEX idx_note (note), ALGORITHM = INPLACE, LOCK = NONE;
~~~

::: tip Always set a lock timeout before DDL
An \`ALTER\` waiting on a long-running query queues behind it — and every *subsequent* query queues behind the \`ALTER\`. A metadata-only change can take a healthy database down. Bound the wait:

~~~sql
SET lock_timeout = '3s';                    -- PostgreSQL
SET lock_wait_timeout = 3;                  -- MySQL (session)
SET LOCK_TIMEOUT 3000;                      -- SQL Server (ms)
ALTER TABLE orders ADD COLUMN note TEXT;
~~~
:::

## The expand–contract migration

The portable pattern for changing a column without downtime, on any engine:

1. **Expand** — add the new column (nullable, no default). Instant.
2. **Dual-write** — deploy code writing both old and new.
3. **Backfill** — copy in batches (\`WHERE id BETWEEN … \`), committing each batch, with a pause between them.
4. **Verify** — count mismatches; add the \`NOT NULL\` constraint as \`NOT VALID\`, then validate.
5. **Switch reads** — deploy code reading the new column.
6. **Contract** — stop writing the old column, then drop it in a later release.

~~~sql title="Batched backfill that does not hold a long transaction" engine="postgresql"
DO $$
DECLARE last_id BIGINT := 0;
BEGIN
  LOOP
    UPDATE orders SET total_cents = (total * 100)::BIGINT
     WHERE id > last_id AND id <= last_id + 10000 AND total_cents IS NULL;
    EXIT WHEN NOT FOUND;
    last_id := last_id + 10000;
    COMMIT;                     -- PG 11+ inside procedures; use a driver loop otherwise
    PERFORM pg_sleep(0.05);     -- let replication and autovacuum keep up
  END LOOP;
END $$;
~~~

::: warn Transactional DDL is not universal
PostgreSQL, SQLite, SQL Server, Db2 and CockroachDB can roll back DDL inside a transaction — a failed migration leaves nothing behind. **MySQL and Oracle commit implicitly** before and after each DDL statement, so a multi-statement migration that fails halfway leaves the schema in a partial state. Write MySQL and Oracle migrations to be individually idempotent.
:::
`,
    related: [
      { label: 'CREATE', href: '/sql/create/' },
      { label: 'Constraints', href: '/sql/constraints/' },
      { label: 'Transactions', href: '/transactions/' },
      { label: 'Indexes', href: '/indexes/' },
    ],
  },

  {
    slug: 'drop-truncate',
    title: 'DROP, TRUNCATE & COMMENT',
    category: 'DDL',
    difficulty: 'beginner',
    standard: 'SQL-92 / SQL:2008',
    summary: 'Removing objects and data — DROP vs TRUNCATE vs DELETE, cascade behaviour, and recovering from a mistake.',
    keywords: 'drop table truncate delete cascade restrict purge recycle bin comment on identity reset',
    body: `
## DROP

~~~sql title="Dropping objects" engine="ansi" run
DROP TABLE IF EXISTS staging_orders;
DROP VIEW  IF EXISTS active_customers;
DROP INDEX IF EXISTS idx_orders_customer;
DROP SCHEMA analytics CASCADE;      -- also drops everything inside it
DROP TABLE orders RESTRICT;         -- default: fail if anything depends on it
~~~

| Engine | \`DROP TABLE IF EXISTS\` | Multiple tables in one statement | \`CASCADE\` |
| --- | --- | --- | --- |
| PostgreSQL | Yes | Yes | Yes — drops dependent views and FK constraints |
| MySQL / MariaDB | Yes | Yes | Parsed and ignored |
| SQLite | Yes | No | No |
| SQL Server | 2016+ | 2016+ | No — drop dependents manually |
| Oracle | No (use PL/SQL) | No | \`CASCADE CONSTRAINTS\` |
| Snowflake / BigQuery | Yes | No | Snowflake: yes |

::: warn PostgreSQL CASCADE is broader than it looks
\`DROP TABLE orders CASCADE\` also drops every view, materialized view and foreign key constraint that references it — silently, in one statement. Run the drop inside a transaction and inspect the \`NOTICE\` output first, or list dependencies with \`\\d+ orders\` in psql.
:::

### Undo options

| Engine | Recovery mechanism |
| --- | --- |
| Oracle | Recycle bin: \`FLASHBACK TABLE orders TO BEFORE DROP;\` (unless \`PURGE\` was used) |
| SQL Server | None for DROP — restore from backup, or \`RESTORE … WITH STOPAT\` for point-in-time |
| Snowflake | \`UNDROP TABLE orders;\` within the time-travel retention window |
| PostgreSQL / MySQL / SQLite | None — restore from backup. A DDL transaction that has not committed can still be rolled back in PostgreSQL |
| BigQuery | \`CREATE TABLE t AS SELECT * FROM t FOR SYSTEM_TIME AS OF …\` within 7 days |

## TRUNCATE

\`TRUNCATE\` empties a table by deallocating its storage rather than deleting rows one by one.

~~~sql title="TRUNCATE" engine="ansi" run
TRUNCATE TABLE staging_orders;
TRUNCATE TABLE a, b, c RESTART IDENTITY CASCADE;   -- PostgreSQL
~~~

| | \`DELETE FROM t\` | \`TRUNCATE TABLE t\` |
| --- | --- | --- |
| Type | DML | DDL |
| Speed on a large table | O(rows), writes WAL/redo per row | Near-constant |
| \`WHERE\` clause | Yes | No |
| Fires row triggers | Yes | No |
| Transactional / rollbackable | Yes | PostgreSQL, SQL Server, Db2: **yes**. MySQL, Oracle: **no** (implicit commit) |
| Resets identity/auto-increment | No | SQL Server, MySQL, Oracle: yes. PostgreSQL: only with \`RESTART IDENTITY\` |
| Reclaims disk immediately | No (needs \`VACUUM\`/\`OPTIMIZE\`) | Yes |
| Blocked by foreign keys | Enforced per row | Refused if any FK references the table (unless \`CASCADE\`) |
| Lock | Row locks | \`ACCESS EXCLUSIVE\` / table lock |

::: danger TRUNCATE cannot be undone in MySQL or Oracle
Both perform an implicit \`COMMIT\` before and after. \`BEGIN; TRUNCATE t; ROLLBACK;\` leaves the table empty. In PostgreSQL and SQL Server the same sequence restores every row.
:::

~~~sql title="Reclaiming space after a large DELETE" engine="postgresql"
DELETE FROM events WHERE created_at < now() - interval '1 year';
VACUUM (ANALYZE) events;          -- marks space reusable, updates statistics
VACUUM FULL events;               -- rewrites the table, returns space to the OS, ACCESS EXCLUSIVE lock
~~~
~~~sql title="MySQL / InnoDB" engine="mysql"
DELETE FROM events WHERE created_at < NOW() - INTERVAL 1 YEAR;
OPTIMIZE TABLE events;            -- rebuilds; online in 8.0 but doubles disk use during the rebuild
~~~

## COMMENT

Documentation stored in the catalog, where every client and IDE can read it.

~~~sql title="ANSI / PostgreSQL / Oracle / Db2 / Snowflake" engine="postgresql" run
COMMENT ON TABLE  orders          IS 'One row per confirmed customer order.';
COMMENT ON COLUMN orders.total    IS 'Gross total in the order currency, tax inclusive.';
COMMENT ON COLUMN orders.status   IS 'pending | paid | shipped | refunded';
~~~

~~~sql title="MySQL — inline only" engine="mysql"
CREATE TABLE orders (
  id BIGINT PRIMARY KEY COMMENT 'Surrogate key',
  total DECIMAL(12,2) COMMENT 'Gross total, tax inclusive'
) COMMENT = 'One row per confirmed customer order.';

ALTER TABLE orders MODIFY total DECIMAL(12,2) COMMENT 'Updated meaning';
~~~

~~~sql title="SQL Server — extended properties" engine="sqlserver"
EXEC sys.sp_addextendedproperty
     @name = N'MS_Description', @value = N'One row per confirmed customer order.',
     @level0type = N'SCHEMA', @level0name = 'dbo',
     @level1type = N'TABLE',  @level1name = 'orders';
~~~

~~~sql title="Reading comments back" engine="postgresql"
SELECT c.relname, obj_description(c.oid) FROM pg_class c WHERE c.relkind = 'r';
SELECT column_name, col_description('orders'::regclass, ordinal_position)
FROM information_schema.columns WHERE table_name = 'orders';
~~~
`,
    related: [
      { label: 'DELETE', href: '/sql/delete/' },
      { label: 'ALTER', href: '/sql/alter/' },
      { label: 'Transactions', href: '/transactions/' },
      { label: 'Backup & restore', href: '/admin/#backup-restore' },
    ],
  },
];
