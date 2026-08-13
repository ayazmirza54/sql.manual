export default {
  slug: 'admin',
  path: '/admin/',
  title: 'Database administration',
  category: 'Admin',
  difficulty: 'advanced',
  standard: 'Mixed',
  summary: 'Users, roles and privileges, connection management, backup and restore, replication, monitoring, maintenance, partitioning and high availability.',
  keywords: 'dba grant revoke role user permission backup restore pg_dump mysqldump replication monitoring vacuum analyze maintenance partitioning high availability failover disaster recovery',
  body: `
## Users, roles & privileges

SQL's DCL is small: \`GRANT\` and \`REVOKE\`. Everything else is vendor-specific.

~~~sql title="Creating principals" engine="ansi" run
CREATE ROLE analyst;                                    -- a group of privileges
CREATE USER alice WITH PASSWORD '…';                    -- PostgreSQL: a role that can log in
GRANT analyst TO alice;                                 -- role membership
~~~

~~~sql title="Granting" engine="ansi" run
GRANT SELECT                        ON orders            TO analyst;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders           TO app_writer;
GRANT USAGE                         ON SCHEMA analytics  TO analyst;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics           TO analyst;
GRANT EXECUTE ON FUNCTION report(int)                    TO analyst;
GRANT SELECT (id, email)            ON customers         TO support;   -- column-level

REVOKE INSERT ON orders FROM app_writer;
~~~

::: tip Grant future objects too
\`GRANT … ON ALL TABLES\` applies only to tables that exist **now**. A table created tomorrow is not covered:

~~~sql
ALTER DEFAULT PRIVILEGES IN SCHEMA analytics
    GRANT SELECT ON TABLES TO analyst;                   -- PostgreSQL
GRANT SELECT ON FUTURE TABLES IN SCHEMA analytics TO ROLE analyst;   -- Snowflake
~~~
:::

| Engine | Model |
| --- | --- |
| PostgreSQL | Roles only — a "user" is a role with \`LOGIN\`. Roles nest |
| MySQL / MariaDB | Users are \`'name'@'host'\`; roles since 8.0 |
| SQL Server | Server logins → database users → database roles; schema-scoped grants |
| Oracle | Users == schemas; system vs object privileges; roles |
| Snowflake | Strict RBAC — privileges only via roles, roles are hierarchical |
| BigQuery | IAM, not SQL — dataset/table/column-level via Google Cloud IAM |

~~~sql title="A least-privilege application role (PostgreSQL)" engine="postgresql"
REVOKE ALL ON SCHEMA public FROM PUBLIC;      -- lock down the default schema
CREATE ROLE app_rw NOINHERIT;
GRANT CONNECT ON DATABASE app TO app_rw;
GRANT USAGE ON SCHEMA app TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA app TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;

CREATE USER app_service WITH PASSWORD :'pw' IN ROLE app_rw;
-- Note the application does NOT own its tables: it cannot DROP them.
~~~

### Row-level security

~~~sql title="PostgreSQL RLS — tenants cannot see each other's rows" engine="postgresql" run
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;     -- applies to the table owner too

CREATE POLICY tenant_isolation ON documents
    USING       (tenant_id = current_setting('app.tenant_id')::BIGINT)   -- for reads
    WITH CHECK  (tenant_id = current_setting('app.tenant_id')::BIGINT);  -- for writes

-- the application sets this per request, inside the transaction:
SET LOCAL app.tenant_id = '42';
~~~

:::support
postgresql=y sqlserver=y~security_policy oracle=y~VPD/OLS db2=y snowflake=y~row_access_policies databricks=y mysql=n~use_views sqlite=n bigquery=y~row_access_policy redshift=y
:::

## Connection management

Connections are expensive: each one costs a backend process (PostgreSQL) or thread (MySQL) plus memory, and the working set of *idle* connections still competes for cache.

| Engine | Limit setting | Pooler |
| --- | --- | --- |
| PostgreSQL | \`max_connections\` (default 100) | PgBouncer, pgcat, Odyssey — essential above ~200 |
| MySQL | \`max_connections\` (default 151) | ProxySQL, or the driver's pool |
| SQL Server | Effectively unlimited; governed by memory | Built into ADO.NET |
| Oracle | \`processes\` / shared servers | Built-in connection pooling (DRCP) |

~~~sql title="Who is connected, and what are they doing" engine="postgresql"
SELECT pid, usename, application_name, client_addr, state,
       now() - state_change AS state_duration, left(query, 80) AS query
FROM   pg_stat_activity
WHERE  state <> 'idle' OR state_change < now() - interval '5 min'
ORDER  BY state_duration DESC;

SELECT pg_cancel_backend(12345);     -- cancel the running query, politely
SELECT pg_terminate_backend(12345);  -- kill the connection
~~~

~~~sql title="Equivalents" engine="mysql"
SHOW FULL PROCESSLIST;  KILL QUERY 42;  KILL 42;              -- MySQL
EXEC sp_who2;  KILL 53;                                        -- SQL Server
SELECT sid, serial#, status, sql_id FROM v$session;            -- Oracle
ALTER SYSTEM KILL SESSION '123,4567' IMMEDIATE;
~~~

::: warn Idle-in-transaction is the silent killer
A connection sitting in an open transaction holds locks and blocks version cleanup indefinitely. Bound it:

~~~sql
ALTER SYSTEM SET idle_in_transaction_session_timeout = '60s';   -- PostgreSQL
SET GLOBAL wait_timeout = 300;                                  -- MySQL
~~~
:::

## Backup & restore

Two kinds, and you need both:

- **Logical** — a dump of SQL statements or a portable archive. Restores anywhere, slow for large data, no point-in-time recovery on its own.
- **Physical** — a byte-level copy of the data files plus the WAL/redo stream. Fast, exact, enables **point-in-time recovery (PITR)**, but restores only to the same major version and platform.

~~~bash title="PostgreSQL"
# logical — custom format allows parallel, selective restore
pg_dump -Fc -Z6 -f app.dump app
pg_restore -d app_new -j 4 app.dump
pg_restore -d app_new -t orders --data-only app.dump    # one table

# physical base backup + WAL archiving → PITR
pg_basebackup -D /backup/base -Ft -z -P -X stream
# recovery target in postgresql.conf: recovery_target_time = '2026-08-13 09:15:00'
~~~

~~~bash title="MySQL"
mysqldump --single-transaction --routines --triggers --events \\
          --set-gtid-purged=ON app > app.sql          # --single-transaction = non-blocking on InnoDB
mysql app_new < app.sql

mysqlpump --parallel-schemas=4 app > app.sql          # parallel logical dump
xtrabackup --backup --target-dir=/backup/base         # physical, hot backup
~~~

~~~sql title="SQL Server" engine="sqlserver"
BACKUP DATABASE app TO DISK = 'D:\\backup\\app_full.bak' WITH COMPRESSION, CHECKSUM;
BACKUP LOG      app TO DISK = 'D:\\backup\\app_log.trn';
RESTORE DATABASE app FROM DISK = 'D:\\backup\\app_full.bak' WITH NORECOVERY;
RESTORE LOG     app FROM DISK = 'D:\\backup\\app_log.trn'
        WITH STOPAT = '2026-08-13T09:15:00', RECOVERY;
~~~

~~~bash title="SQLite — do not copy the file while it is open"
sqlite3 app.db ".backup 'backup.db'"        # safe online backup
sqlite3 app.db ".dump" > app.sql            # logical
sqlite3 app.db "PRAGMA integrity_check;"
~~~

::: danger An untested backup is not a backup
Restore drills belong on a schedule, not in a runbook nobody has run. Record the actual **RTO** (how long a restore takes) and **RPO** (how much data a failure loses) by measuring them. The three most common discoveries: the backup never included the schema, the restore takes eleven hours, and nobody has the decryption key.
:::

## Replication

| Type | What ships | Engines |
| --- | --- | --- |
| **Physical / streaming** | WAL / redo blocks | PostgreSQL streaming, Oracle Data Guard |
| **Logical** | Row changes, per table | PostgreSQL logical replication, MySQL row-based binlog, Debezium/CDC |
| **Statement-based** | The SQL itself | MySQL (legacy; unsafe with non-deterministic functions) |
| **Synchronous** | Commit waits for a replica | PostgreSQL \`synchronous_standby_names\`, Galera, Always On sync |
| **Asynchronous** | Commit returns immediately | Default nearly everywhere |

~~~sql title="PostgreSQL logical replication" engine="postgresql"
-- publisher
CREATE PUBLICATION app_pub FOR TABLE orders, customers;
-- subscriber
CREATE SUBSCRIPTION app_sub
    CONNECTION 'host=primary dbname=app user=repl'
    PUBLICATION app_pub;

-- monitor lag on the primary:
SELECT client_addr, state, sent_lsn, write_lsn, flush_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes
FROM   pg_stat_replication;
~~~

~~~sql title="MySQL" engine="mysql"
CHANGE REPLICATION SOURCE TO SOURCE_HOST='primary', SOURCE_AUTO_POSITION=1;
START REPLICA;
SHOW REPLICA STATUS\\G      -- Seconds_Behind_Source, Replica_IO_Running, Replica_SQL_Running
~~~

::: warn Read replicas are eventually consistent
A write committed on the primary is not immediately visible on a replica. "Save then redirect to the detail page" reads stale data and looks like a lost write. Route read-after-write to the primary, or wait for the replica's LSN to catch up.
:::

## Monitoring

What to watch, in rough priority order:

1. **Replication lag** — seconds and bytes behind.
2. **Connection count** vs the limit, and how many are idle-in-transaction.
3. **Cache hit ratio** — below ~95% on OLTP means the working set no longer fits.
4. **Longest-running query / transaction age.**
5. **Lock waits and deadlock rate.**
6. **Disk free**, plus WAL/binlog/undo growth (a stuck replication slot fills the disk and stops the primary).
7. **Bloat / fragmentation**, and time since last vacuum/analyze.
8. **Checkpoint frequency** and I/O saturation.

~~~sql title="PostgreSQL health snapshot" engine="postgresql"
SELECT datname, numbackends, xact_commit, xact_rollback,
       ROUND(100.0 * blks_hit / NULLIF(blks_hit + blks_read, 0), 2) AS cache_hit_pct,
       deadlocks, temp_files, pg_size_pretty(temp_bytes) AS temp_written
FROM   pg_stat_database WHERE datname = current_database();

SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained
FROM   pg_replication_slots;    -- an inactive slot retains WAL forever — a classic outage
~~~

## Maintenance

~~~sql title="PostgreSQL" engine="postgresql"
VACUUM (ANALYZE, VERBOSE) orders;   -- reclaim dead tuples, refresh statistics
REINDEX INDEX CONCURRENTLY idx_orders_customer;

SELECT relname, n_dead_tup, n_live_tup,
       ROUND(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1) AS dead_pct,
       last_autovacuum, last_autoanalyze
FROM   pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 20;
~~~

::: danger Transaction ID wraparound
PostgreSQL's 32-bit transaction counter must be frozen by vacuum before it wraps. If autovacuum cannot keep up — usually because of a long transaction, a stuck replication slot or an abandoned prepared transaction — the database eventually refuses all writes to protect itself. Monitor it:

~~~sql
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
-- act well before 200 million; the hard stop is around 2 billion
~~~
:::

~~~sql title="Other engines" engine="ansi"
OPTIMIZE TABLE orders;                             -- MySQL: rebuild, defragment
ANALYZE TABLE orders;                              -- MySQL: refresh index statistics
ALTER INDEX ALL ON dbo.orders REBUILD;             -- SQL Server
EXEC DBMS_STATS.GATHER_SCHEMA_STATS('APP');        -- Oracle
VACUUM; ANALYZE;                                   -- SQLite
VACUUM FULL SORT ONLY orders;                      -- Redshift: restore sort order
~~~

## Partitioning

Split one logical table into physical pieces so the engine reads only the relevant ones and maintenance operates per piece.

~~~sql title="PostgreSQL declarative partitioning" engine="postgresql" run
CREATE TABLE events (
    id BIGINT, created_at TIMESTAMPTZ NOT NULL, payload JSONB
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE INDEX ON events_2026_08 (created_at);

-- Retention becomes instant:
ALTER TABLE events DETACH PARTITION events_2025_08;
DROP TABLE events_2025_08;
~~~

| Scheme | Split by | Good for |
| --- | --- | --- |
| Range | Ordered value, usually a date | Time-series, retention policies |
| List | Enumerated value | Tenant, region, status |
| Hash | Hash of a key | Even distribution when there is no natural range |
| Composite | Range then hash/list | Large multi-tenant time-series |

::: warn Partitioning is not a general speedup
It helps only when queries **filter on the partition key** so the planner can prune. Add a partition key most queries do not use and every query fans out across every partition, which is slower than the unpartitioned table. Its real wins are cheap retention (drop a partition instead of a mass \`DELETE\`) and per-partition maintenance.
:::

## High availability & disaster recovery

| Concept | Question it answers |
| --- | --- |
| **RTO** | How long until service resumes? |
| **RPO** | How much data may be lost? |
| **Failover** | Promote a replica — automatic or manual? |
| **Split brain** | What stops two nodes both believing they are primary? |
| **Quorum / fencing** | How is that decision made safely? |

| Engine | Typical HA |
| --- | --- |
| PostgreSQL | Streaming replicas + Patroni/repmgr, or a managed service |
| MySQL | Group Replication / InnoDB Cluster, Galera, or async replicas + Orchestrator |
| SQL Server | Always On availability groups, failover cluster instances |
| Oracle | RAC (shared storage, active-active) + Data Guard (standby) |
| Cloud warehouses | Handled by the provider; your job is backups and access control |

::: tip HA is not backup
A replica faithfully replicates \`DROP TABLE orders\` in milliseconds. Replication protects against hardware failure; backups protect against mistakes and corruption. You need both, and the backups must live somewhere the primary's credentials cannot reach.
:::
`,
  related: [
    { label: 'Transactions & locking', href: '/transactions/' },
    { label: 'CLI reference', href: '/cli/' },
    { label: 'Performance', href: '/performance/' },
    { label: 'Database explorer', href: '/databases/' },
  ],
};
