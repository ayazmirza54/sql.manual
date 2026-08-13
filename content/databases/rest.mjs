/** Remaining engine explorer pages. Same shape as the tier-1 modules. */

export default [
  {
    id: 'sqlserver',
    summary: 'Microsoft\'s flagship RDBMS. T-SQL, clustered indexes, columnstore, and a set of defaults that differ from every other engine.',
    body: `
## Overview

SQL Server is a mature enterprise RDBMS with an unusually complete tooling story: a first-class procedural dialect (T-SQL), an integrated columnstore engine for analytics, and deep diagnostic DMVs. It runs on Windows, Linux and containers, and Azure SQL Database is the same engine as a managed service.

:::kv
FIRST RELEASE :: 1989
LICENSE :: Commercial (Developer and Express editions are free)
CURRENT :: SQL Server 2025; Azure SQL Database (evergreen)
WIRE PROTOCOL :: TDS, port 1433
DEFAULT ISOLATION :: READ COMMITTED (lock-based, unless RCSI is enabled)
BEST FOR :: Enterprise OLTP, .NET stacks, HTAP with columnstore, BI workloads
:::

## Architecture

A table is either a **heap** or a **clustered index** — and the clustered index *is* the table, exactly as in MySQL/InnoDB. Non-clustered indexes store the clustering key as their row locator, so a wide clustered key inflates every other index.

\`tempdb\` is a shared scratch database used by sorts, hash spills, temp tables, and the row-version store when snapshot isolation is on. It is a frequent bottleneck; configure multiple equally-sized data files.

## Installation & CLI

~~~bash title="Docker is the quickest route on any OS"
docker run -d --name mssql -e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD='Str0ng!Pass' \\
  -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest

sqlcmd -S localhost,1433 -U sa -P 'Str0ng!Pass' -d master -C
sqlcmd -S localhost -U sa -P '…' -i migrate.sql -b      # -b: non-zero exit on error
~~~

## T-SQL specifics

~~~sql title="Syntax that differs from ANSI" engine="sqlserver"
SELECT TOP 10 * FROM orders ORDER BY id;                  -- row limiting
SELECT * FROM orders ORDER BY id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY;
SELECT ISNULL(bonus, 0), IIF(total > 100, 'big', 'small');
SELECT first_name + ' ' + last_name;                       -- + concatenates
SELECT * FROM c CROSS APPLY (SELECT TOP 1 * FROM o WHERE o.cid = c.id ORDER BY d DESC) x;
SELECT * FROM [dbo].[Order Details];                       -- bracket quoting
GO                                                          -- batch separator (client-side)
~~~

~~~sql title="Error handling" engine="sqlserver"
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
      UPDATE accounts SET balance = balance - @amt WHERE id = @from;
      IF @@ROWCOUNT = 0 THROW 50001, 'Account not found', 1;
    COMMIT;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK;
    THROW;
END CATCH
~~~

## Indexes

~~~sql title="The index types" engine="sqlserver"
CREATE CLUSTERED INDEX ix_orders ON dbo.orders (id);
CREATE NONCLUSTERED INDEX ix_cust ON dbo.orders (customer_id) INCLUDE (total, status);
CREATE NONCLUSTERED INDEX ix_open ON dbo.orders (created_at) WHERE status = 'open';  -- filtered
CREATE CLUSTERED COLUMNSTORE INDEX cci_facts ON dbo.fact_sales;   -- analytics, 10x compression
CREATE INDEX ix_a ON dbo.t (a) WITH (ONLINE = ON, DATA_COMPRESSION = PAGE);
~~~

## Concurrency

::: danger The default makes readers block writers
Lock-based \`READ COMMITTED\` means a reporting query can block an \`UPDATE\` and vice versa. Enabling row versioning usually removes an entire class of timeouts:

~~~sql
ALTER DATABASE app SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
~~~
The cost is tempdb space for the version store. Almost every modern deployment turns it on.
:::

::: warn Triggers fire once per statement
\`inserted\` and \`deleted\` are **tables** containing every affected row. A trigger written as \`SELECT @id = id FROM inserted\` silently processes one arbitrary row of a multi-row update.
:::

## Diagnostics

~~~sql title="The DMVs worth memorising" engine="sqlserver"
SET STATISTICS IO, TIME ON;

SELECT TOP 20 qs.execution_count, qs.total_worker_time/1000 AS cpu_ms,
       qs.total_elapsed_time/qs.execution_count/1000 AS avg_ms,
       SUBSTRING(st.text, (qs.statement_start_offset/2)+1, 200) AS stmt
FROM sys.dm_exec_query_stats qs CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
ORDER BY qs.total_worker_time DESC;

SELECT * FROM sys.dm_db_index_usage_stats WHERE database_id = DB_ID();
SELECT * FROM sys.dm_os_wait_stats ORDER BY wait_time_ms DESC;
SELECT * FROM sys.dm_tran_locks;
~~~

## Backup & HA

~~~sql title="Backup with point-in-time recovery" engine="sqlserver"
BACKUP DATABASE app TO DISK='D:\\bk\\full.bak' WITH COMPRESSION, CHECKSUM;
BACKUP LOG app TO DISK='D:\\bk\\log.trn';
RESTORE DATABASE app FROM DISK='D:\\bk\\full.bak' WITH NORECOVERY;
RESTORE LOG app FROM DISK='D:\\bk\\log.trn' WITH STOPAT='2026-08-13T09:15:00', RECOVERY;
~~~

Always On availability groups provide synchronous or asynchronous replicas with automatic failover and readable secondaries.

## Best practices

- Enable \`READ_COMMITTED_SNAPSHOT\` unless you have a specific reason not to.
- Keep the clustered key narrow, unique, static and ever-increasing.
- Treat \`sys.dm_db_missing_index_details\` as a hint, not a script — it suggests wide, overlapping indexes.
- Use \`sp_executesql\` with parameters, never string concatenation, for dynamic SQL.
- Configure multiple tempdb data files sized equally.
- Remember: \`UNIQUE\` permits only **one** NULL here, and \`DATEDIFF\` counts boundary crossings, not elapsed time.
`,
  },

  {
    id: 'oracle',
    summary: 'The enterprise incumbent. PL/SQL, RAC, deep partitioning, and a dialect with more surprises than any other.',
    body: `
## Overview

Oracle Database is the enterprise standard in banking, telecoms and ERP. Its differentiators are PL/SQL (a full procedural language with packages), Real Application Clusters (active-active shared-storage clustering), a very sophisticated optimizer, and Flashback (query and restore the past without a backup).

:::kv
FIRST RELEASE :: 1979
LICENSE :: Commercial; Express Edition (XE) is free with limits
CURRENT :: 23ai
DEFAULT PORT :: 1521
DEFAULT ISOLATION :: READ COMMITTED (no REPEATABLE READ — only READ COMMITTED and SERIALIZABLE)
BEST FOR :: Large enterprise OLTP and DW, workloads needing RAC or Data Guard
:::

## Oracle-isms that catch everyone

::: danger The empty string is NULL
Oracle stores \`''\` as \`NULL\` in \`VARCHAR2\`. \`WHERE name = ''\` never matches anything, and \`NOT NULL\` columns reject empty strings. No other major engine behaves this way, and it breaks naive migrations in both directions.
:::

| Oracle | Everywhere else |
| --- | --- |
| \`SELECT … FROM dual\` | \`SELECT\` with no \`FROM\` |
| \`MINUS\` | \`EXCEPT\` |
| \`NVL(a,b)\`, \`NVL2\`, \`DECODE\` | \`COALESCE\`, \`CASE\` |
| \`VARCHAR2\` | \`VARCHAR\` |
| \`NUMBER\` | \`INTEGER\` / \`NUMERIC\` |
| \`DATE\` includes a time | \`DATE\` is date-only |
| \`SYSDATE\`, \`SYSTIMESTAMP\` | \`CURRENT_TIMESTAMP\` |
| No \`ON UPDATE\` on foreign keys | \`ON UPDATE CASCADE\` |
| Identifiers fold to UPPERCASE | PostgreSQL folds to lowercase |
| \`ROWNUM\` assigned before \`ORDER BY\` | — |

## Row limiting

~~~sql title="12c and later vs the 11g pattern" engine="oracle"
SELECT * FROM orders ORDER BY id FETCH FIRST 10 ROWS ONLY;
SELECT * FROM orders ORDER BY total DESC FETCH FIRST 10 ROWS WITH TIES;

-- 11g and earlier: ROWNUM is assigned BEFORE ORDER BY, so it must be nested
SELECT * FROM (SELECT * FROM orders ORDER BY id) WHERE ROWNUM <= 10;
~~~

## Hierarchical queries

~~~sql title="CONNECT BY predates recursive CTEs and is still everywhere" engine="oracle"
SELECT LEVEL, LPAD(' ', 2*(LEVEL-1)) || name AS tree,
       SYS_CONNECT_BY_PATH(name, '/') AS path, CONNECT_BY_ISLEAF AS is_leaf
FROM   employees
START WITH manager_id IS NULL
CONNECT BY NOCYCLE PRIOR id = manager_id
ORDER SIBLINGS BY name;
~~~

Oracle also supports standard \`WITH\` recursive CTEs; prefer them in new code.

## PL/SQL

~~~sql title="A package" engine="oracle"
CREATE OR REPLACE PACKAGE BODY orders_pkg AS
  FUNCTION lifetime_value(p_customer_id NUMBER) RETURN NUMBER IS
    v_total NUMBER;
  BEGIN
    SELECT NVL(SUM(total), 0) INTO v_total FROM orders WHERE customer_id = p_customer_id;
    RETURN v_total;
  EXCEPTION WHEN NO_DATA_FOUND THEN RETURN 0;
  END;
END orders_pkg;
/
~~~

The trailing \`/\` is required to execute a PL/SQL block in SQL*Plus — scripts fail silently without it.

## Partitioning & performance

~~~sql title="Interval partitioning creates partitions automatically" engine="oracle"
CREATE TABLE sales (id NUMBER, sold_on DATE, amount NUMBER(12,2))
PARTITION BY RANGE (sold_on) INTERVAL (NUMTOYMINTERVAL(1,'MONTH'))
  (PARTITION p0 VALUES LESS THAN (DATE '2024-01-01'));
~~~

~~~sql title="Plans and statistics" engine="oracle"
EXPLAIN PLAN FOR SELECT …;
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);
SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY_CURSOR(format => 'ALLSTATS LAST'));  -- actual
EXEC DBMS_STATS.GATHER_TABLE_STATS('APP', 'ORDERS');
~~~

## Flashback

~~~sql title="Query and restore the past" engine="oracle"
SELECT * FROM employees AS OF TIMESTAMP (SYSTIMESTAMP - INTERVAL '1' HOUR);
SELECT * FROM employees VERSIONS BETWEEN TIMESTAMP … AND …;
FLASHBACK TABLE employees TO BEFORE DROP;      -- undrop from the recycle bin
FLASHBACK TABLE employees TO TIMESTAMP …;
~~~

## Best practices

- Prefer standard SQL (\`COALESCE\`, \`CASE\`, \`FETCH FIRST\`, \`WITH\`) over the Oracle-only spellings in new code.
- Use bind variables everywhere — literal-laden SQL floods the shared pool with unshareable cursors.
- Never update primary keys; there is no \`ON UPDATE CASCADE\`.
- Handle the \`'' IS NULL\` behaviour explicitly in any cross-engine code.
- Gather statistics after bulk loads; Oracle's optimizer is heavily statistics-driven.
- Watch for \`ORA-01555 snapshot too old\` — undo retention too small for your long queries.
`,
  },

  {
    id: 'redshift',
    summary: 'AWS MPP warehouse forked from PostgreSQL 8.0. Distribution keys and sort keys are the whole performance story.',
    body: `
## Overview

Redshift is a massively parallel columnar warehouse. It speaks the PostgreSQL wire protocol (so \`psql\` and PostgreSQL drivers work) but the engine underneath is entirely different: columnar storage, MPP execution across slices, and no indexes at all.

:::kv
LAUNCHED :: 2013
BASE :: Forked from PostgreSQL 8.0 — expect no modern PG features
DEPLOYMENT :: Provisioned (RA3) or Serverless
PROTOCOL :: PostgreSQL, port 5439
BEST FOR :: Batch analytics on AWS, star-schema warehouses, S3 lakehouse queries via Spectrum
:::

## Architecture

~~~text
Leader node        parses SQL, builds the plan, distributes code to compute nodes
  └── Compute node ×N
        └── Slices        each slice owns a portion of every table's data
~~~

Rows are distributed across slices by the **distribution style**, and within each slice they are stored in 1 MB column blocks with **zone maps** (min/max per block) that let the scanner skip blocks. There are no indexes — the sort key is what makes pruning possible.

## Distribution and sort keys

~~~sql title="The two decisions that determine performance" engine="redshift"
CREATE TABLE fact_orders (
    order_id    BIGINT,
    customer_id BIGINT,
    order_date  DATE,
    total       NUMERIC(12,2)
)
DISTSTYLE KEY DISTKEY (customer_id)     -- co-locate joins on customer_id
COMPOUND SORTKEY (order_date);          -- zone-map pruning on date ranges
~~~

| Style | Behaviour | Use when |
| --- | --- | --- |
| \`AUTO\` | Redshift decides and may change it | The default; fine to start with |
| \`KEY\` | Rows with equal key land on the same slice | Large fact tables joined on that key |
| \`ALL\` | Full copy on every node | Small dimension tables (< a few million rows) |
| \`EVEN\` | Round-robin | No natural join key |

::: danger DS_BCAST_INNER in a plan means a table is being broadcast
Every compute node receives a full copy of the inner table across the network — usually the single largest cost in a slow Redshift query. Fix it by giving both tables the same \`DISTKEY\`, or by making the small side \`DISTSTYLE ALL\`.
:::

## Loading

~~~sql title="COPY is the only fast path" engine="redshift"
COPY fact_orders FROM 's3://bucket/orders/'
     IAM_ROLE 'arn:aws:iam::123:role/RedshiftCopy'
     FORMAT AS PARQUET;

UNLOAD ('SELECT * FROM fact_orders WHERE order_date >= ''2026-01-01''')
     TO 's3://bucket/export/' IAM_ROLE '…' PARQUET PARALLEL ON;
~~~

Split source files into a multiple of the slice count so every slice loads in parallel. Row-by-row \`INSERT\` is orders of magnitude slower and should never be used for bulk data.

## Maintenance & monitoring

~~~sql title="Redshift-specific system views" engine="redshift"
SELECT * FROM SVV_TABLE_INFO ORDER BY size DESC;   -- skew, unsorted %, size
SELECT * FROM STL_ALERT_EVENT_LOG ORDER BY event_time DESC LIMIT 20;  -- start here
SELECT * FROM SVL_QUERY_SUMMARY WHERE query = 12345;
VACUUM FULL fact_orders;    -- restore sort order after big loads
ANALYZE fact_orders;
~~~

## Best practices

- Set a \`DISTKEY\` on the join column of your largest fact table; use \`DISTSTYLE ALL\` for small dimensions.
- Put the column you filter by date on the \`SORTKEY\`.
- Watch for skew in \`SVV_TABLE_INFO\` — one overloaded slice makes the whole cluster wait.
- \`ANALYZE\` and \`VACUUM\` after large loads.
- Remember constraints are **not enforced** — the optimizer trusts them, so violating them can produce wrong results.
- Use Spectrum external tables for cold data in S3 rather than loading everything.
`,
  },

  {
    id: 'snowflake',
    summary: 'Storage separated from compute. Virtual warehouses, zero-copy cloning, time travel — and a cost model you must actively manage.',
    body: `
## Overview

Snowflake separates storage (columnar micro-partitions in cloud object storage) from compute (virtual warehouses you size and suspend independently). Multiple warehouses read the same data with no contention, which is what makes concurrent workloads straightforward.

:::kv
LAUNCHED :: 2014
DEPLOYMENT :: Managed SaaS on AWS, Azure and GCP
COMPUTE :: Virtual warehouses, XS → 6XL, resized instantly
STORAGE :: Immutable micro-partitions (~16 MB compressed) with automatic metadata
BEST FOR :: Cloud data warehousing, data sharing, semi-structured data at scale
:::

## Compute & cost

~~~sql title="Warehouse management is cost management" engine="snowflake"
CREATE WAREHOUSE analytics WITH
  WAREHOUSE_SIZE = 'MEDIUM'
  AUTO_SUSPEND = 60            -- seconds of idle before suspending — the biggest single saving
  AUTO_RESUME = TRUE
  MIN_CLUSTER_COUNT = 1 MAX_CLUSTER_COUNT = 4;   -- multi-cluster serves concurrency, not speed

ALTER WAREHOUSE analytics SET WAREHOUSE_SIZE = 'LARGE';   -- instant, no data movement
~~~

::: tip Sizing up vs scaling out
A **larger** warehouse makes a single query faster (more nodes on one job). **More clusters** let more queries run at once. Choosing the wrong axis is the most common Snowflake cost mistake.
:::

## Semi-structured data

~~~sql title="VARIANT is a first-class type" engine="snowflake"
CREATE TABLE events (raw VARIANT);
COPY INTO events FROM @stage FILE_FORMAT = (TYPE = JSON);

SELECT raw:user.name::STRING       AS name,
       raw:items[0].sku::STRING    AS first_sku,
       f.value:qty::NUMBER         AS qty
FROM   events, LATERAL FLATTEN(input => raw:items) f;
~~~

## Time travel & cloning

~~~sql title="Two features nothing else matches" engine="snowflake"
SELECT * FROM orders AT (OFFSET => -3600);                    -- one hour ago
SELECT * FROM orders BEFORE (STATEMENT => '01a2b3c4-…');      -- before a bad statement
UNDROP TABLE orders;

CREATE TABLE orders_test CLONE orders;      -- zero-copy: instant, no extra storage
CREATE DATABASE dev CLONE prod;             -- an entire environment in seconds
~~~

## Pipelines

~~~sql title="Streams and tasks" engine="snowflake"
CREATE STREAM orders_stream ON TABLE orders;          -- change data capture
CREATE TASK load_summary
  WAREHOUSE = etl SCHEDULE = '5 MINUTE'
  WHEN SYSTEM$STREAM_HAS_DATA('orders_stream')
AS MERGE INTO summary USING orders_stream …;
CREATE PIPE p AUTO_INGEST = TRUE AS COPY INTO t FROM @stage;  -- Snowpipe
~~~

## Performance & governance

~~~sql title="Where the credits went" engine="snowflake"
SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.QUERY_HISTORY ORDER BY total_elapsed_time DESC LIMIT 20;
SELECT * FROM SNOWFLAKE.ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY;
ALTER TABLE big_table CLUSTER BY (event_date);   -- only worth it on very large tables
ALTER TABLE t ADD SEARCH OPTIMIZATION;           -- point lookups; extra cost
~~~

Snowflake enforces strict RBAC — privileges are granted only to roles, and roles are hierarchical.

## Best practices

- Set \`AUTO_SUSPEND\` to 60 seconds on every warehouse.
- Separate warehouses per workload (ETL / BI / ad-hoc) so one cannot starve another.
- Use \`GRANT … ON FUTURE\` so new objects inherit access.
- Only \`NOT NULL\` is enforced — every other constraint is metadata for the optimizer.
- Clone rather than copy for dev/test environments.
- Query the result cache deliberately: byte-identical SQL on unchanged data is free.
`,
  },

  {
    id: 'bigquery',
    summary: 'Serverless columnar warehouse. No indexes, no servers — partitioning, clustering and bytes scanned are the whole model.',
    body: `
## Overview

BigQuery has no instances to size. You submit SQL; Google allocates slots and runs it against columnar storage. Pricing is per **bytes scanned** (on-demand) or per reserved slot capacity, which makes query shape a direct financial concern.

:::kv
LAUNCHED :: 2011 (GoogleSQL dialect since 2016)
DEPLOYMENT :: Fully serverless on Google Cloud
NAMESPACE :: project → dataset → table
PRICING :: Bytes scanned (on-demand) or slot reservations
BEST FOR :: Very large analytical workloads, event data, ML in SQL (BQML)
:::

## Cost control comes first

::: danger LIMIT does not reduce cost
The scan has already happened by the time \`LIMIT\` applies. What actually reduces bytes scanned:

1. **Name your columns.** Columnar storage means \`SELECT *\` on a 200-column table can cost 50× the query you needed.
2. **Filter on the partition column** so whole partitions are pruned.
3. **Dry-run first**: \`bq query --dry_run\` reports the bytes before you pay for them.
4. **Cached results are free** — for byte-identical query text on unchanged data, for 24 hours.
:::

~~~sql title="Table design replaces indexing" engine="bigquery"
CREATE TABLE analytics.events (
    event_time TIMESTAMP,
    user_id    STRING,
    name       STRING,
    params     ARRAY<STRUCT<key STRING, value STRING>>
)
PARTITION BY DATE(event_time)
CLUSTER BY user_id, name
OPTIONS (partition_expiration_days = 400,
         require_partition_filter = TRUE);   -- rejects queries that would scan everything
~~~

## GoogleSQL specifics

~~~sql title="Syntax worth knowing" engine="bigquery"
SELECT * EXCEPT (password_hash) FROM users;
SELECT * REPLACE (LOWER(email) AS email) FROM users;
SELECT SAFE_CAST(raw AS INT64), SAFE.PARSE_DATE('%Y-%m-%d', raw);   -- NULL instead of error
SELECT * FROM orders QUALIFY ROW_NUMBER() OVER (PARTITION BY cid ORDER BY t DESC) = 1;
SELECT e.event_id, p.key, p.value FROM events e, UNNEST(e.params) AS p;   -- flatten repeated
~~~

Nested \`ARRAY<STRUCT<…>>\` columns are the idiomatic BigQuery model: they store one-to-many relationships inside the row, so \`UNNEST\` costs nothing compared to a shuffle-inducing join.

## Loading & streaming

~~~sql title="Load paths" engine="bigquery"
LOAD DATA INTO analytics.events
  FROM FILES (format = 'PARQUET', uris = ['gs://bucket/events/*.parquet']);

CREATE EXTERNAL TABLE analytics.ext_events
  OPTIONS (format = 'PARQUET', uris = ['gs://bucket/events/*.parquet']);
~~~

Loading from GCS is free; streaming inserts are billed and land in a buffer that DML cannot immediately modify.

## Best practices

- Always partition tables above a few GB, and set \`require_partition_filter\`.
- Cluster on the columns you filter and join on most (up to four, order matters).
- Use \`APPROX_COUNT_DISTINCT\` and \`APPROX_QUANTILES\` — exact versions cost far more compute.
- Model nested and repeated fields instead of joining wide tables.
- Set custom quotas per project so a single runaway query cannot bankrupt a team.
- BigQuery is not an OLTP store — DML has quotas and per-statement latency is seconds, not milliseconds.
`,
  },

  {
    id: 'duckdb',
    summary: '"SQLite for analytics." An in-process vectorized OLAP engine that queries Parquet and CSV directly, with an unusually pleasant SQL dialect.',
    body: `
## Overview

DuckDB is an embedded analytical database: a single library, no server, no configuration — but columnar, vectorized and built for aggregation over millions of rows. It has become the default tool for local data analysis and increasingly for production ELT.

:::kv
FIRST RELEASE :: 2019 (CWI Amsterdam)
LICENSE :: MIT
CURRENT :: 1.4.x
DEPLOYMENT :: In-process library (Python, R, Node, Java, CLI, WASM)
BEST FOR :: Local analytics, Parquet/CSV querying, ELT, notebooks, testing pipelines
:::

## Query files directly

~~~sql title="No load step required" engine="duckdb"
SELECT * FROM 'events/*.parquet' WHERE event_date >= DATE '2026-01-01';
SELECT * FROM read_csv_auto('data.csv');
SELECT * FROM read_json_auto('logs.jsonl');
SELECT * FROM 's3://bucket/events/*.parquet';        -- with the httpfs extension

COPY (SELECT * FROM t) TO 'out.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);
~~~

~~~sql title="Attach other databases and query across them" engine="duckdb"
ATTACH 'postgres://user@host/db' AS pg (TYPE postgres);
ATTACH 'app.sqlite' AS lite (TYPE sqlite);
SELECT * FROM pg.orders o JOIN lite.customers c ON c.id = o.customer_id;
~~~

## Dialect ergonomics

DuckDB deliberately fixes long-standing SQL annoyances:

~~~sql title="Syntax you will wish other engines had" engine="duckdb"
SELECT * EXCLUDE (password_hash) FROM users;
SELECT * REPLACE (lower(email) AS email) FROM users;
SELECT customer_id, sum(total) FROM orders GROUP BY ALL;
SELECT * FROM orders ORDER BY ALL;
SELECT * FROM orders QUALIFY row_number() OVER (PARTITION BY cid ORDER BY t DESC) = 1;
PIVOT sales ON quarter USING sum(revenue) GROUP BY product_id;   -- infers the columns
FROM orders SELECT count(*);        -- FROM-first queries
SELECT * FROM t USING SAMPLE 1%;
~~~

## Performance

Vectorized execution processes batches of ~2048 values at a time, and larger-than-memory queries spill to disk. A single laptop core routinely aggregates hundreds of millions of Parquet rows in seconds.

~~~sql title="Diagnostics" engine="duckdb"
EXPLAIN ANALYZE SELECT …;
PRAGMA database_size;
SET threads = 8;
SET memory_limit = '8GB';
~~~

## Best practices

- Keep data in Parquet and query it in place rather than importing.
- Use DuckDB for the analytical half of a workload that stores data in PostgreSQL — attach and query directly.
- It is single-process: not a concurrent multi-writer database.
- \`duckdb-wasm\` runs the same engine in a browser, which is how in-page SQL playgrounds work.
`,
  },

  {
    id: 'mariadb',
    summary: 'The community fork of MySQL. Compatible where it matters, with sequences, system-versioned tables and extra storage engines.',
    body: `
## Overview

MariaDB was forked from MySQL in 2009 by its original authors after the Oracle acquisition. It remains largely drop-in compatible for applications, but the two have diverged: they are no longer wire- or feature-identical, and replication between them is not supported in both directions.

:::kv
FIRST RELEASE :: 2009
LICENSE :: GPLv2 — fully open source
CURRENT :: 11.8 LTS
DEFAULT PORT :: 3306
BEST FOR :: MySQL workloads wanting an open-source guarantee, plus Galera clustering
:::

## What MariaDB has that MySQL does not

~~~sql title="Features unique to MariaDB" engine="mariadb"
CREATE SEQUENCE order_seq START WITH 1000 INCREMENT BY 1;   -- real sequences
SELECT NEXTVAL(order_seq);

CREATE TABLE employees (id INT PRIMARY KEY, salary DECIMAL(12,2))
  WITH SYSTEM VERSIONING;                                    -- temporal tables
SELECT * FROM employees FOR SYSTEM_TIME AS OF TIMESTAMP '2026-01-01 00:00:00';

INSERT INTO t (a) VALUES (1) RETURNING id;                   -- RETURNING on INSERT/DELETE
SELECT * FROM t ORDER BY x NULLS LAST;                       -- NULLS FIRST/LAST
~~~

Additional storage engines ship in the box: **Aria** (crash-safe MyISAM successor), **ColumnStore** (columnar analytics), **Spider** (sharding), **CONNECT** (federated external data).

## Where it differs from MySQL

| | MySQL 8 | MariaDB 11 |
| --- | --- | --- |
| JSON type | Native binary | Alias for LONGTEXT + a validity CHECK |
| Sequences | No | Yes |
| Temporal tables | No | Yes |
| \`RETURNING\` | No | Yes |
| Invisible columns | No | Yes |
| Clustering | Group Replication / InnoDB Cluster | Galera (synchronous multi-master) |
| Data dictionary | Transactional | File-based |
| Optimizer | Cost model overhaul in 8.0 | Independent lineage |

::: warn Migration is not symmetric
Moving MySQL → MariaDB is usually straightforward. Moving MariaDB → MySQL, or replicating between them, is not supported and breaks on JSON handling, sequences and system-versioned tables.
:::

## Galera clustering

~~~text title="Synchronous multi-master"
Every node holds a full copy; writes are certified across the cluster before commit.
+ No replica lag, any node accepts writes, automatic node rejoin
− Write throughput is bounded by the slowest node; hotspot rows cause certification conflicts
− Requires InnoDB, primary keys on every table, and a quorum (3+ nodes)
~~~

## Best practices

- Treat it as its own database, not "MySQL with a different name", once you use its unique features.
- Use \`utf8mb4\` and check \`sql_mode\` exactly as with MySQL.
- Galera needs a primary key on every table — a table without one will not replicate correctly.
- Everything on the [MySQL page](/databases/mysql/) about InnoDB, indexes and \`sql_mode\` applies here too.
`,
  },

  {
    id: 'clickhouse',
    summary: 'Extremely fast columnar analytics. MergeTree engines, sparse primary indexes and a deliberately non-standard write model.',
    body: `
## Overview

ClickHouse is an open-source columnar OLAP database designed for very high ingest rates and sub-second aggregation over billions of rows. It achieves that partly by giving up things OLTP users expect: there are no real transactions, updates are asynchronous, and uniqueness is not enforced.

:::kv
FIRST RELEASE :: 2016 (Yandex)
LICENSE :: Apache 2.0
DEFAULT PORTS :: 9000 (native), 8123 (HTTP)
BEST FOR :: Observability, event analytics, time series, real-time dashboards
NOT FOR :: OLTP, frequent single-row updates, workloads needing transactions
:::

## MergeTree

The table engine is mandatory and determines everything.

~~~sql title="The standard shape" engine="clickhouse"
CREATE TABLE events (
    event_time DateTime,
    user_id    UInt64,
    name       LowCardinality(String),
    duration   UInt32
)
ENGINE = MergeTree
ORDER BY (user_id, event_time)        -- also the sparse primary index
PARTITION BY toYYYYMM(event_time)
TTL event_time + INTERVAL 90 DAY;     -- automatic expiry
~~~

The \`ORDER BY\` clause is the sorting key **and** the sparse primary index: one index entry per ~8192 rows. Queries that filter on a prefix of it skip whole granules. Queries that do not are full scans — which ClickHouse is still remarkably fast at, but the difference is orders of magnitude.

| Engine | Behaviour |
| --- | --- |
| \`MergeTree\` | The base: sorted, partitioned, background-merged parts |
| \`ReplacingMergeTree(ver)\` | Deduplicates by sorting key during merges — *eventually* |
| \`SummingMergeTree\` | Pre-aggregates numeric columns on merge |
| \`AggregatingMergeTree\` | Stores aggregate function states |
| \`ReplicatedMergeTree\` | Adds replication via ClickHouse Keeper |

::: danger Deduplication is eventual, not immediate
\`ReplacingMergeTree\` removes duplicates when background merges happen — which may be minutes or hours later, or never for parts in different partitions. Queries must use \`FINAL\` (expensive) or aggregate explicitly (\`argMax\`) if they need deduplicated results *now*.
:::

## Writes

~~~sql title="Updates and deletes are not what you expect" engine="clickhouse"
ALTER TABLE events UPDATE duration = 0 WHERE user_id = 42;   -- a "mutation": async, rewrites parts
ALTER TABLE events DELETE WHERE event_time < '2025-01-01';   -- same
DELETE FROM events WHERE user_id = 42;                       -- lightweight delete (23.3+), marks rows

SELECT * FROM system.mutations WHERE is_done = 0;            -- track progress
~~~

Insert in **large batches** (tens of thousands of rows). Many small inserts create many small parts and overwhelm the background merge scheduler — the classic "too many parts" error.

## Dialect

~~~sql title="ClickHouse SQL" engine="clickhouse"
SELECT toStartOfMonth(event_time) AS m, count(), uniqExact(user_id), quantile(0.95)(duration)
FROM events WHERE event_time >= now() - INTERVAL 30 DAY GROUP BY m ORDER BY m;

SELECT * FROM events ORDER BY user_id, event_time DESC LIMIT 1 BY user_id;   -- latest per user
SELECT countIf(status = 'error'), sumIf(duration, status = 'ok') FROM events; -- -If combinators
SELECT name, arrayJoin(tags) AS tag FROM articles;
~~~

## Materialized views are insert triggers

~~~sql title="Not a cached query" engine="clickhouse"
CREATE MATERIALIZED VIEW daily_mv ENGINE = SummingMergeTree ORDER BY day AS
SELECT toDate(event_time) AS day, count() AS events FROM events GROUP BY day;
~~~

It fires on \`INSERT\` into the source table only. It does **not** see pre-existing rows and does not react to deletes.

## Best practices

- Choose \`ORDER BY\` to match your most common filter prefix — it is the single most important decision.
- Use \`LowCardinality(String)\` for columns with a small distinct set; it is a large compression and speed win.
- Batch inserts; never insert row by row.
- Prefer append-only modelling over updates.
- Use \`uniqExact\` only when you need exactness — \`uniq\` (HLL) is far cheaper.
- Monitor \`system.parts\`, \`system.mutations\` and \`system.query_log\`.
`,
  },

  {
    id: 'trino',
    summary: 'A SQL engine with no storage of its own. Federates queries across Hive, Iceberg, PostgreSQL, Kafka and dozens more.',
    body: `
## Overview

Trino (formerly PrestoSQL, forked from Facebook's Presto) is a distributed query engine that stores nothing. Connectors expose external systems as catalogs, and one query can join across them — object storage, a relational database and a message queue in a single statement.

:::kv
ORIGIN :: Presto at Facebook (2012); Trino fork 2020
LICENSE :: Apache 2.0
DEFAULT PORT :: 8080
ARCHITECTURE :: Coordinator + workers, in-memory pipelined execution
BEST FOR :: Data lake and lakehouse querying, federation, interactive analytics over Iceberg/Delta
:::

~~~text title="Namespace"
catalog.schema.table
  └── catalog = a configured connector instance (hive, iceberg, postgresql, kafka…)
~~~

~~~sql title="Federated join across two systems" engine="trino"
SELECT o.id, o.total, c.email
FROM   iceberg.warehouse.orders o
JOIN   postgresql.public.customers c ON c.id = o.customer_id
WHERE  o.order_date >= DATE '2026-01-01';
~~~

## Dialect

Trino follows ANSI SQL closely and is the reference implementation many "modern SQL" features are learned from.

~~~sql title="Trino SQL" engine="trino"
SELECT approx_distinct(user_id), approx_percentile(duration, 0.95) FROM events;
SELECT id, t.tag FROM articles CROSS JOIN UNNEST(tags) AS t(tag);
SELECT TRY(CAST(raw AS INTEGER)) FROM staging;         -- NULL instead of failing
SELECT date_trunc('month', ts) AS m, count(*) FROM events GROUP BY 1;
SELECT filter(scores, x -> x > 5), transform(scores, x -> x * 2) FROM t;   -- lambdas
~~~

## Table maintenance (Iceberg)

~~~sql title="Lakehouse operations" engine="trino"
ALTER TABLE iceberg.warehouse.orders EXECUTE optimize;              -- compact small files
ALTER TABLE iceberg.warehouse.orders EXECUTE expire_snapshots(retention_threshold => '7d');
SELECT * FROM iceberg.warehouse."orders$snapshots";                 -- metadata tables
SELECT * FROM iceberg.warehouse.orders FOR VERSION AS OF 1234567;   -- time travel
~~~

## Performance

Trino is **in-memory and pipelined** — there is no spill-to-disk checkpointing like Spark, so a query that exceeds cluster memory fails rather than degrading. That is a deliberate trade for interactive latency.

- Push filters down to the connector; check with \`EXPLAIN (TYPE DISTRIBUTED)\`.
- Partition and sort the underlying files — Trino's speed depends on skipping them.
- Avoid \`ORDER BY\` on very large results; the final sort happens on one node.
- Small files are the number-one lakehouse performance problem; compact regularly.

## Best practices

- Use it as a query layer, not a storage layer — durability belongs to the connectors.
- Set per-query memory limits so one analyst cannot take out the cluster.
- Prefer Iceberg or Delta over raw Hive tables for reliable schema evolution and snapshot isolation.
- Federation is powerful and easy to misuse: joining a billion-row lake table to a live OLTP database will hammer the OLTP database.
`,
  },

  {
    id: 'databricks',
    summary: 'ANSI-mode Spark SQL over Delta Lake, with Unity Catalog governance and Photon vectorized execution.',
    body: `
## Overview

Databricks SQL is the warehouse-style interface to the Databricks lakehouse: Spark SQL (in ANSI mode) executing over **Delta Lake** tables in object storage, accelerated by the Photon engine and governed by Unity Catalog.

:::kv
FOUNDED :: 2013 (creators of Apache Spark)
STORAGE :: Delta Lake — Parquet + a transaction log
NAMESPACE :: catalog.schema.table (Unity Catalog)
BEST FOR :: Lakehouse architectures, ETL + BI + ML on one copy of the data
:::

## Delta Lake

Delta adds a transaction log over Parquet, which buys ACID transactions, schema enforcement, time travel and efficient upserts on object storage.

~~~sql title="Delta operations" engine="databricks"
CREATE TABLE main.sales.orders (id BIGINT, total DECIMAL(12,2), order_date DATE)
USING DELTA PARTITIONED BY (order_date);

MERGE INTO orders t USING staging s ON t.id = s.id
WHEN MATCHED THEN UPDATE SET *
WHEN NOT MATCHED THEN INSERT *;

SELECT * FROM orders VERSION AS OF 42;
SELECT * FROM orders TIMESTAMP AS OF '2026-08-01';
DESCRIBE HISTORY orders;

OPTIMIZE orders ZORDER BY (customer_id);   -- compact files + colocate related data
VACUUM orders RETAIN 168 HOURS;            -- remove files older than the retention window
~~~

## Dialect

~~~sql title="Spark SQL in ANSI mode" engine="databricks"
SET ansi_mode = true;   -- errors on overflow and invalid casts instead of returning NULL

SELECT explode(items) AS item FROM orders;
SELECT * FROM orders QUALIFY row_number() OVER (PARTITION BY cid ORDER BY d DESC) = 1;
SELECT collect_list(sku), collect_set(sku) FROM order_items GROUP BY order_id;
SELECT try_cast(raw AS INT), try_divide(a, b) FROM staging;
SELECT * FROM read_files('s3://bucket/events/', format => 'parquet');
~~~

::: warn Legacy Spark SQL silently returns NULL
Without ANSI mode, an invalid cast or an arithmetic overflow yields \`NULL\` rather than an error — bad data propagates quietly through a pipeline. Enable ANSI mode on new workloads.
:::

## Governance & pipelines

Unity Catalog provides a three-level namespace with table-, row- and column-level access control, lineage and audit across workspaces. Delta Live Tables declares pipelines as SQL with built-in expectations:

~~~sql title="A declarative pipeline with data quality rules" engine="databricks"
CREATE OR REFRESH STREAMING TABLE clean_orders (
  CONSTRAINT valid_total EXPECT (total > 0) ON VIOLATION DROP ROW
) AS SELECT * FROM STREAM(main.raw.orders);
~~~

## Best practices

- Run \`OPTIMIZE\` with \`ZORDER\` on the columns you filter by; small files are the main performance problem.
- Set a sensible \`VACUUM\` retention — too short breaks time travel and concurrent readers.
- Partition on low-cardinality columns only; over-partitioning creates the small-file problem it was meant to solve.
- Use liquid clustering instead of static partitioning for evolving access patterns.
- Enable ANSI mode so type errors surface immediately.
`,
  },

  {
    id: 'cockroachdb',
    summary: 'Horizontally scalable, geo-partitioned SQL with the PostgreSQL wire protocol and serializable isolation by default.',
    body: `
## Overview

CockroachDB is a distributed SQL database: data is split into ranges, replicated with Raft, and rebalanced automatically across nodes. It speaks the PostgreSQL wire protocol, so most PostgreSQL drivers and tools work unchanged — but the execution model is distributed, and that changes how you design schemas.

:::kv
FIRST RELEASE :: 2015
LICENSE :: CockroachDB Software License (source-available); free tier available
PROTOCOL :: PostgreSQL, port 26257
DEFAULT ISOLATION :: SERIALIZABLE — the only mainstream database that defaults to it
BEST FOR :: Multi-region OLTP, systems needing survivability and strong consistency
:::

## Distribution model

~~~text
Table → ranges (~512 MB each) → 3+ replicas via Raft consensus
Leaseholder serves reads for its range; writes need a quorum.
~~~

::: danger Sequential primary keys create a hotspot
Every insert with a monotonically increasing key targets the same range, so one node does all the work — the opposite of what you deployed a distributed database for. Use \`UUID\` (with \`gen_random_uuid()\`), \`unique_rowid()\`, or hash-sharded indexes:

~~~sql
CREATE TABLE events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), ts TIMESTAMPTZ);
CREATE INDEX ON events (ts) USING HASH WITH (bucket_count = 8);
~~~
:::

## Multi-region

~~~sql title="Data placement as a schema-level decision" engine="cockroachdb"
ALTER DATABASE app SET PRIMARY REGION 'eu-west-1';
ALTER DATABASE app ADD REGION 'us-east-1';

ALTER TABLE users SET LOCALITY REGIONAL BY ROW;     -- each row lives near its user
ALTER TABLE countries SET LOCALITY GLOBAL;          -- fast reads everywhere, slower writes
~~~

This is the feature that distinguishes CockroachDB: data residency and read latency become declarative properties of the table.

## Serializable by default

Because the default isolation is \`SERIALIZABLE\`, transactions can be aborted with a retry error (SQLSTATE \`40001\`) when they conflict. **Applications must implement retry** — this is not optional.

~~~sql title="Transaction retry" engine="cockroachdb"
BEGIN;
  SAVEPOINT cockroach_restart;
  -- work
  RELEASE SAVEPOINT cockroach_restart;
COMMIT;
-- on error 40001: ROLLBACK TO SAVEPOINT cockroach_restart and retry with backoff
~~~

## Differences from PostgreSQL

| | PostgreSQL | CockroachDB |
| --- | --- | --- |
| Isolation default | READ COMMITTED | SERIALIZABLE |
| Retry required | No | Yes |
| Extensions (PostGIS, etc.) | Yes | Spatial built in; no arbitrary extensions |
| Triggers / stored procedures | Full | Limited |
| \`SELECT FOR UPDATE\` | Yes | Yes |
| Foreign keys | Yes | Yes, but cross-range checks cost network round trips |

## Best practices

- Avoid sequential primary keys; use UUIDs or hash-sharded indexes.
- Keep transactions short — distributed contention is far more expensive than single-node contention.
- Implement retry logic before you go to production, not after the first \`40001\`.
- Use \`REGIONAL BY ROW\` for user data and \`GLOBAL\` for small reference tables.
- Batch writes; each statement may involve consensus across regions.
`,
  },

  {
    id: 'db2',
    summary: 'IBM\'s enterprise RDBMS across LUW, z/OS and i. Strong standard coverage and BLU columnar acceleration.',
    body: `
## Overview

Db2 is one of the oldest relational databases still in active development, descended directly from IBM's System R research. It exists in several distinct editions — Db2 LUW (Linux/Unix/Windows), Db2 for z/OS (mainframe) and Db2 for i — which share a dialect but differ in administration.

:::kv
FIRST RELEASE :: 1983
LICENSE :: Commercial; Db2 Community Edition is free
DEFAULT PORT :: 50000
STANDARDS :: Among the most complete SQL standard implementations available
BEST FOR :: Mainframe and large enterprise workloads, mixed OLTP/analytics via BLU
:::

## Dialect

Db2 tracks the SQL standard closely, so most portable SQL runs unchanged.

~~~sql title="Db2 specifics" engine="db2"
SELECT * FROM sysibm.sysdummy1;                      -- the DUAL equivalent
SELECT CURRENT TIMESTAMP FROM sysibm.sysdummy1;      -- note: no parentheses
SELECT * FROM orders ORDER BY id FETCH FIRST 10 ROWS ONLY;
SELECT order_date + 30 DAYS FROM orders;             -- labelled duration arithmetic

SELECT id FROM FINAL TABLE (INSERT INTO orders (total) VALUES (99.00));  -- returning
MERGE INTO t USING (VALUES (1, 'a')) AS s (id, name) ON t.id = s.id
WHEN MATCHED THEN UPDATE SET name = s.name
WHEN NOT MATCHED THEN INSERT (id, name) VALUES (s.id, s.name);
~~~

## BLU Acceleration

Db2 LUW can store tables **column-organized** with in-memory vectorized processing and actionable compression — analytics performance inside the same engine serving OLTP.

~~~sql title="Column-organized tables" engine="db2"
CREATE TABLE fact_sales (…) ORGANIZE BY COLUMN;
~~~

## Administration

~~~bash title="CLI"
db2 connect to sample user db2inst1 using password
db2 "SELECT tabname FROM syscat.tables WHERE tabschema = CURRENT SCHEMA"
db2 "RUNSTATS ON TABLE app.orders WITH DISTRIBUTION AND DETAILED INDEXES ALL"
db2 backup database sample to /backup compress
db2look -d sample -e -o schema.sql        # extract DDL
db2move sample export                     # data movement
~~~

~~~sql title="Catalog and diagnostics" engine="db2"
SELECT * FROM syscat.tables WHERE tabschema = CURRENT SCHEMA;
SELECT * FROM syscat.indexes WHERE tabname = 'ORDERS';
SELECT * FROM TABLE(MON_GET_PKG_CACHE_STMT(NULL, NULL, NULL, -2)) ORDER BY total_cpu_time DESC;
EXPLAIN PLAN FOR SELECT …;   -- then db2exfmt to format
~~~

## Best practices

- Run \`RUNSTATS\` after significant data change — the Db2 optimizer is heavily statistics-driven.
- Use \`REORG\` to reclaim space and restore clustering after large deletes.
- Prefer standard SQL; Db2 supports more of it than most engines, so portable code stays portable.
- Identifiers fold to uppercase, as in Oracle.
`,
  },

  {
    id: 'synapse',
    summary: 'MPP T-SQL warehousing on Azure. Distribution strategy replaces single-node index tuning.',
    body: `
## Overview

Azure Synapse Analytics provides two very different SQL experiences: **dedicated SQL pools** (a provisioned MPP warehouse, formerly Azure SQL Data Warehouse) and **serverless SQL pools** (pay-per-query T-SQL over files in a data lake). Microsoft Fabric Warehouse is the successor product and shares much of the engine.

:::kv
DIALECT :: T-SQL (a subset — not everything from SQL Server is available)
DEDICATED POOL :: Provisioned MPP, billed by DWU, 60 distributions
SERVERLESS POOL :: Query Parquet/CSV/Delta in ADLS, billed per TB scanned
BEST FOR :: Azure-native warehousing, existing T-SQL and Microsoft BI estates
:::

## Distribution is the whole design

A dedicated pool always has **60 distributions**. How rows map to them determines whether a join needs a data movement step.

~~~sql title="The three strategies" engine="synapse"
CREATE TABLE fact_sales (…)
WITH (DISTRIBUTION = HASH(customer_id),        -- co-locate joins on this column
      CLUSTERED COLUMNSTORE INDEX,
      PARTITION (order_date RANGE RIGHT FOR VALUES ('2026-01-01','2026-02-01')));

CREATE TABLE dim_country (…) WITH (DISTRIBUTION = REPLICATE);  -- small dimensions
CREATE TABLE staging_raw (…) WITH (DISTRIBUTION = ROUND_ROBIN, HEAP);  -- landing tables
~~~

| Strategy | Use for |
| --- | --- |
| \`HASH(col)\` | Large fact tables; pick the most common join key |
| \`REPLICATE\` | Dimensions under ~2 GB — a copy on every node removes movement |
| \`ROUND_ROBIN\` | Staging and load tables with no natural key |

::: danger Data movement is the cost
When two joined tables are distributed on different columns, Synapse must shuffle or broadcast — visible as \`SHUFFLE_MOVE\` or \`BROADCAST_MOVE\` in the plan. Aligning the hash column of the tables you join is the single highest-impact tuning action.
:::

## Loading & querying files

~~~sql title="COPY INTO and serverless external queries" engine="synapse"
COPY INTO fact_sales FROM 'https://acct.blob.core.windows.net/data/sales/*.parquet'
WITH (FILE_TYPE = 'PARQUET', CREDENTIAL = (IDENTITY = 'Managed Identity'));

-- serverless pool, no ingestion at all:
SELECT TOP 100 * FROM OPENROWSET(
    BULK 'https://acct.dfs.core.windows.net/data/sales/*.parquet', FORMAT = 'PARQUET') AS r;
~~~

## Diagnostics

~~~sql title="MPP-specific DMVs" engine="synapse"
SELECT * FROM sys.dm_pdw_exec_requests ORDER BY total_elapsed_time DESC;
SELECT * FROM sys.dm_pdw_request_steps WHERE request_id = 'QID12345';   -- look for *_MOVE steps
SELECT * FROM sys.dm_pdw_nodes_db_partition_stats;                       -- skew per distribution
CREATE STATISTICS st_customer ON fact_sales (customer_id);               -- must be created manually
~~~

## Best practices

- Create statistics explicitly — unlike SQL Server, Synapse does not always create them automatically, and the MPP optimizer is helpless without them.
- Use clustered columnstore for large tables; heaps only for staging.
- Avoid \`HASH\` distribution on a column with heavy skew — one distribution ends up doing all the work.
- Pause dedicated pools when idle; they bill while provisioned.
- Serverless pools charge per TB scanned, so partitioned Parquet and column pruning matter exactly as in BigQuery.
- Not all T-SQL is supported: no cross-database queries, limited triggers, no \`MERGE\` in older versions.
`,
  },
];
