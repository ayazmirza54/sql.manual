export default {
  id: 'mysql',
  summary: 'The web\'s default database. InnoDB clustered storage, wide hosting support, and a set of defaults worth auditing.',
  body: `
## Overview

MySQL is the most widely deployed open-source RDBMS, and the default in most shared hosting and PHP/Rails/WordPress stacks. Modern MySQL 8 is a substantially different product from the 5.x versions many teams remember: it has window functions, CTEs, real \`CHECK\` constraints, atomic DDL and a proper data dictionary.

:::kv
FIRST RELEASE :: 1995
LICENSE :: GPLv2 or commercial (Oracle Corporation)
CURRENT :: 8.4 LTS / 9.x innovation releases
WIRE PROTOCOL :: MySQL client/server protocol, port 3306
STORAGE ENGINE :: InnoDB (default; MyISAM is legacy and not crash-safe)
DEFAULT ISOLATION :: REPEATABLE READ — unusual, and worth knowing
BEST FOR :: Web applications, read-heavy OLTP, wide ecosystem support
:::

## Architecture

MySQL is **thread-per-connection**, so connections are much cheaper than PostgreSQL's processes — thousands are workable. The server splits into a SQL layer (parser, optimizer, cache) and a pluggable storage engine layer.

~~~text title="InnoDB storage"
Table = clustered B-tree keyed by the PRIMARY KEY
  └── the PK IS the table; rows live in its leaf pages
Secondary index = B-tree of (index columns → PRIMARY KEY value)
  └── a secondary lookup traverses TWO trees unless the index covers the query
~~~

::: warn Three consequences of clustered storage
1. **Keep the primary key narrow.** Every secondary index stores a copy of it.
2. **Insert in key order where you can.** Random UUID keys scatter writes across every page, causing splits and write amplification. Use an ordered id or UUIDv7.
3. **Covering indexes matter more here**, because the alternative is a second B-tree traversal per row.
:::

## Installation

~~~bash title="Install"
sudo apt install mysql-server                     # Debian/Ubuntu
brew install mysql && brew services start mysql   # macOS
docker run -d --name mysql -e MYSQL_ROOT_PASSWORD=secret -p 3306:3306 mysql:8.4
sudo mysql_secure_installation                    # always run this on a new server
~~~

## CLI & connection

~~~bash title="mysql client"
mysql -h 127.0.0.1 -P 3306 -u root -p app     # note: uppercase -P for port
mysql --defaults-file=~/.my.cnf app           # credentials from a 0600 file
mysql -e "SELECT VERSION()" -B                # batch output for pipes
~~~

::: warn localhost is not 127.0.0.1
The client treats \`localhost\` as a Unix socket and \`127.0.0.1\` as TCP. MySQL grants are per \`'user'@'host'\`, so one can work while the other is refused with "Access denied".
:::

## Data types

| Category | Types | Notes |
| --- | --- | --- |
| Integer | \`TINYINT\` \`SMALLINT\` \`MEDIUMINT\` \`INT\` \`BIGINT\` \`[UNSIGNED]\` | \`UNSIGNED\` doubles the positive range |
| Decimal | \`DECIMAL(p,s)\` \`FLOAT\` \`DOUBLE\` | \`DECIMAL\` for money, always |
| String | \`CHAR\` \`VARCHAR\` \`TEXT\` \`MEDIUMTEXT\` \`LONGTEXT\` | \`TEXT\` is off-page; only a prefix can be indexed |
| Date/time | \`DATE\` \`DATETIME\` \`TIMESTAMP\` \`TIME\` \`YEAR\` | \`TIMESTAMP\` is UTC-normalised but only spans 1970–2038 |
| Binary | \`BINARY\` \`VARBINARY\` \`BLOB\` | \`BINARY(16)\` is the efficient UUID storage |
| Other | \`JSON\` \`ENUM\` \`SET\` \`GEOMETRY\` \`VECTOR\` (9.0+) | |

::: danger utf8 is not UTF-8
MySQL's historical \`utf8\` charset stores at most 3 bytes per character and cannot represent emoji or many CJK characters. The real thing is **\`utf8mb4\`**, the default since 8.0. Check inherited schemas:

~~~sql
SELECT table_name, table_collation FROM information_schema.tables
WHERE table_schema = DATABASE() AND table_collation NOT LIKE 'utf8mb4%';
~~~
:::

## Indexes

~~~sql title="Index syntax" engine="mysql"
CREATE INDEX idx_customer ON orders (customer_id);
CREATE UNIQUE INDEX uq_email ON users (email);
CREATE INDEX idx_prefix ON articles (title(50));           -- prefix index for long text
CREATE FULLTEXT INDEX ft_body ON articles (title, body);
CREATE INDEX idx_lower ON users ((LOWER(email)));          -- functional index (8.0.13+)
ALTER TABLE t ADD INDEX idx (c), ALGORITHM=INPLACE, LOCK=NONE;   -- online
~~~

MySQL has **no partial indexes** and **no covering \`INCLUDE\`** — put the extra columns in the key instead. It also creates an index on every foreign key column automatically, unlike PostgreSQL.

## Writes

~~~sql title="MySQL-specific write syntax" engine="mysql"
INSERT INTO t (a, b) VALUES (1, 2) AS new
ON DUPLICATE KEY UPDATE b = new.b;             -- upsert (8.0.20+ alias form)

UPDATE orders o JOIN customers c ON c.id = o.customer_id
SET o.country = c.country;                     -- join in the UPDATE clause

DELETE oi FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.cancelled;

UPDATE t SET x = 1 WHERE cond ORDER BY id LIMIT 5000;   -- batched
~~~

::: danger Two statements to avoid
**\`INSERT IGNORE\`** downgrades *every* error to a warning — truncated strings, invalid dates, failed foreign keys — not just duplicates.

**\`REPLACE INTO\`** is a \`DELETE\` followed by an \`INSERT\`. It wipes columns you did not supply, fires delete triggers, and cascades to child rows. Use \`ON DUPLICATE KEY UPDATE\`.
:::

## Transactions

Default isolation is **\`REPEATABLE READ\`**, which is stricter than most engines' default and is implemented with **gap locks** — locks on the ranges between index entries — to prevent phantoms. Gap locks are a common source of deadlocks in write-heavy workloads; many high-throughput shops switch to \`READ COMMITTED\`.

~~~sql title="Transaction control" engine="mysql"
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
  SELECT * FROM accounts WHERE id = 1 FOR UPDATE;
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

SELECT * FROM jobs WHERE state='queued' LIMIT 1 FOR UPDATE SKIP LOCKED;   -- 8.0+
SHOW ENGINE INNODB STATUS\\G   -- LATEST DETECTED DEADLOCK section
~~~

::: warn No transactional DDL
Every DDL statement performs an implicit commit before and after. A migration that fails halfway leaves the schema partly changed — write each MySQL migration step to be independently re-runnable.
:::

## JSON

~~~sql title="JSON access and indexing" engine="mysql"
SELECT data ->> '$.user.email' AS email FROM events;      -- unquoted text
SELECT JSON_EXTRACT(data, '$.items[0].sku') FROM orders;
SELECT * FROM events, JSON_TABLE(data, '$.items[*]'
       COLUMNS (sku VARCHAR(32) PATH '$.sku')) AS t;

-- JSON cannot be indexed directly; index a generated column:
ALTER TABLE events
  ADD COLUMN event_name VARCHAR(64) GENERATED ALWAYS AS (data ->> '$.event') STORED,
  ADD INDEX idx_event_name (event_name);

-- multi-valued index for arrays (8.0.17+):
ALTER TABLE docs ADD INDEX idx_tags ((CAST(data -> '$.tags' AS CHAR(40) ARRAY)));
~~~

## Replication & backup

~~~sql title="Replication" engine="mysql"
CHANGE REPLICATION SOURCE TO SOURCE_HOST='primary', SOURCE_AUTO_POSITION=1;
START REPLICA;
SHOW REPLICA STATUS\\G     -- Seconds_Behind_Source, Replica_IO_Running, Replica_SQL_Running
~~~

~~~bash title="Backup"
mysqldump --single-transaction --routines --triggers --events \\
          --set-gtid-purged=ON app > app.sql      # --single-transaction = non-blocking on InnoDB
mysqlpump --parallel-schemas=4 app > app.sql
xtrabackup --backup --target-dir=/backup/base     # physical hot backup
~~~

Use **GTID-based replication** (\`gtid_mode=ON\`) — it makes failover and replica rebuilds far simpler than binlog file/position tracking.

## Performance & monitoring

~~~sql title="Diagnostics" engine="mysql"
EXPLAIN ANALYZE SELECT …;                       -- 8.0.18+, actual timings
SHOW FULL PROCESSLIST;
SELECT * FROM sys.schema_unused_indexes;
SELECT * FROM sys.statements_with_full_table_scans LIMIT 20;
SELECT digest_text, count_star, ROUND(avg_timer_wait/1e9,2) AS avg_ms
FROM performance_schema.events_statements_summary_by_digest ORDER BY sum_timer_wait DESC LIMIT 20;
~~~

| Setting | Guidance |
| --- | --- |
| \`innodb_buffer_pool_size\` | 50–70% of RAM — the single most important setting |
| \`innodb_flush_log_at_trx_commit\` | \`1\` for full durability; \`2\` trades ~1 s of commits for speed |
| \`innodb_log_file_size\` | 25% of the buffer pool |
| \`innodb_flush_method\` | \`O_DIRECT\` on Linux |
| \`max_connections\` | 200–500; use ProxySQL beyond that |
| \`slow_query_log\` + \`long_query_time=1\` | Turn on before you need it |

::: note The query cache is gone
MySQL 8 removed the query cache entirely — it was a global mutex and a scalability bottleneck. Cache in your application instead.
:::

## Security

~~~sql title="Users, roles and grants" engine="mysql"
CREATE USER 'app'@'10.0.%' IDENTIFIED BY '…' REQUIRE SSL;
CREATE ROLE 'app_rw';
GRANT SELECT, INSERT, UPDATE, DELETE ON app.* TO 'app_rw';
GRANT 'app_rw' TO 'app'@'10.0.%';
SET DEFAULT ROLE ALL TO 'app'@'10.0.%';   -- roles are inactive until activated!
SHOW GRANTS FOR 'app'@'10.0.%';
~~~

## Best practices

- Verify \`sql_mode\` includes \`STRICT_TRANS_TABLES\` and \`ONLY_FULL_GROUP_BY\` — without them MySQL silently truncates data and returns arbitrary values from groups.
- Use \`utf8mb4\`, not \`utf8\`.
- Keep the primary key narrow, monotonically increasing, and never a random UUID.
- Raise \`group_concat_max_len\` — it truncates at 1024 bytes silently.
- Specify \`ALGORITHM=INSTANT\` on \`ALTER TABLE\` so a surprise table rebuild errors instead of locking for an hour.
- Prefer \`ON DUPLICATE KEY UPDATE\` over \`INSERT IGNORE\` and \`REPLACE INTO\`.
- Enable GTIDs before you need to fail over.
- Remember MySQL has no \`FULL OUTER JOIN\`, no \`EXCEPT\` before 8.0.31, and no deferrable constraints.
`,
};
