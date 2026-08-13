export default {
  id: 'postgresql',
  summary: 'The most standards-compliant open-source RDBMS: extensible types, MVCC, and the richest indexing of any engine.',
  body: `
## Overview

PostgreSQL is an object-relational database with an unusually strong commitment to correctness and extensibility. It has the most complete SQL standard coverage of any open-source engine, a genuine extension system (PostGIS, pgvector, TimescaleDB, pg_trgm), and index types no other engine offers.

:::kv
FIRST RELEASE :: 1996 (as PostgreSQL; POSTGRES from 1986)
LICENSE :: PostgreSQL License — permissive, BSD-like
CURRENT MAJOR :: 18 (annual major releases each autumn, 5 years of support)
WIRE PROTOCOL :: PostgreSQL frontend/backend protocol, port 5432
DEFAULT ISOLATION :: READ COMMITTED
CONCURRENCY :: MVCC — readers never block writers
BEST FOR :: OLTP, mixed workloads, geospatial, JSON documents, anything needing correctness
:::

## Architecture

PostgreSQL uses a **process-per-connection** model: the postmaster forks a backend process for each client. That makes connections comparatively expensive — a few hundred is a practical ceiling without a pooler.

~~~text title="Process model"
postmaster (supervisor)
├── backend process        one per client connection
├── background writer      flushes dirty shared buffers
├── checkpointer           writes a consistent checkpoint to disk
├── WAL writer             flushes the write-ahead log
├── autovacuum launcher    → autovacuum workers (reclaim dead tuples, refresh stats)
├── stats collector        cumulative statistics
└── walsender / walreceiver  streaming replication
~~~

Storage is a **heap**: rows are stored unordered in 8 KB pages, with indexes as separate structures pointing at physical tuple ids (\`ctid\`). This differs fundamentally from MySQL and SQL Server, where the primary key clusters the table — which is why "keep the primary key narrow" is MySQL advice, not PostgreSQL advice.

::: note MVCC and why VACUUM exists
An \`UPDATE\` writes a **new row version** and marks the old one dead; a \`DELETE\` only marks. Old versions stay in the table until \`VACUUM\` reclaims them, which is what keeps readers from blocking writers. The cost is that a heavily-updated table grows ("bloat") unless autovacuum keeps up — and autovacuum cannot reclaim rows any open transaction might still need to see.
:::

## Installation

~~~bash title="Install"
# Debian / Ubuntu
sudo apt install postgresql-18 postgresql-client-18

# macOS
brew install postgresql@18 && brew services start postgresql@18

# Docker — the fastest way to get a throwaway instance
docker run -d --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:18

# initialise a fresh data directory manually
initdb -D /var/lib/postgresql/data --data-checksums   # enable checksums; you cannot add them later cheaply
pg_ctl -D /var/lib/postgresql/data -l logfile start
~~~

## CLI & connection

~~~bash title="psql"
psql -h localhost -p 5432 -U postgres -d app
psql "postgresql://user:pass@host:5432/app?sslmode=require"
psql -c "SELECT version()"
psql -f migration.sql -v ON_ERROR_STOP=1 --single-transaction
~~~

Full meta-command reference on the [CLI page](/cli/#psql-postgresql) and the [psql cheat sheet](/cheatsheets/postgresql-cli/).

## Data types

PostgreSQL's type system is its distinguishing feature.

| Category | Types |
| --- | --- |
| Numeric | \`SMALLINT\` \`INTEGER\` \`BIGINT\` \`NUMERIC(p,s)\` \`REAL\` \`DOUBLE PRECISION\` |
| Character | \`TEXT\` \`VARCHAR(n)\` \`CHAR(n)\` — **\`TEXT\` has no performance penalty** |
| Date/time | \`DATE\` \`TIME\` \`TIMESTAMP\` \`TIMESTAMPTZ\` \`INTERVAL\` |
| Boolean | \`BOOLEAN\` — a real three-valued type |
| JSON | \`JSON\` (text) \`JSONB\` (binary, indexable) |
| Arrays | Any type followed by \`[]\`, 1-indexed |
| Ranges | \`INT4RANGE\` \`NUMRANGE\` \`TSTZRANGE\` \`DATERANGE\` + multiranges |
| Network | \`INET\` \`CIDR\` \`MACADDR\` |
| Geometric | \`POINT\` \`LINE\` \`POLYGON\` (and PostGIS for real spatial work) |
| Other | \`UUID\` \`XML\` \`BYTEA\` \`TSVECTOR\` \`ENUM\` \`COMPOSITE\` \`DOMAIN\` |

~~~sql title="Types no other mainstream engine has" engine="postgresql" run
CREATE TABLE reservations (
    room_id  INT NOT NULL,
    period   TSTZRANGE NOT NULL,
    guests   TEXT[] NOT NULL DEFAULT '{}',
    details  JSONB,
    -- declaratively impossible to double-book a room:
    EXCLUDE USING GIST (room_id WITH =, period WITH &&)
);
~~~

## Indexes

| Type | Use for |
| --- | --- |
| **B-tree** | Default. \`=\`, ranges, \`ORDER BY\`, \`MIN\`/\`MAX\`, prefix \`LIKE 'a%'\` |
| **GIN** | JSONB containment, array membership, full-text, trigram |
| **GiST** | Geometry, ranges, exclusion constraints, nearest-neighbour |
| **SP-GiST** | Quadtrees, tries, IP prefix lookups |
| **BRIN** | Very large naturally-ordered tables — a tiny index over block ranges |
| **Hash** | Equality only; WAL-logged and crash-safe since 10 |

~~~sql title="The index toolkit" engine="postgresql"
CREATE INDEX CONCURRENTLY idx_a ON t (col);              -- non-blocking build
CREATE INDEX idx_b ON t (a, b DESC) INCLUDE (c);         -- composite + covering
CREATE INDEX idx_c ON t (lower(email));                  -- functional
CREATE INDEX idx_d ON t (created_at) WHERE status='open';-- partial
CREATE INDEX idx_e ON docs USING GIN (data jsonb_path_ops);
CREATE INDEX idx_f ON logs USING BRIN (created_at);      -- ~0.1% the size of a B-tree
~~~

## Transactions

Default \`READ COMMITTED\`. \`REPEATABLE READ\` gives true snapshot isolation (stricter than the standard — it also prevents phantoms). \`SERIALIZABLE\` uses **SSI**: it takes no extra locks, but may abort a transaction at commit with SQLSTATE \`40001\`, so applications must retry.

~~~sql title="Locking patterns" engine="postgresql" run
SELECT * FROM jobs WHERE status='queued' ORDER BY id LIMIT 1
FOR UPDATE SKIP LOCKED;      -- the canonical job-queue query

SELECT pg_advisory_xact_lock(hashtext('nightly-job'));   -- app-level mutex, auto-released at commit
~~~

## JSON

~~~sql title="JSONB in practice" engine="postgresql" run
CREATE INDEX idx_events_data ON events USING GIN (data jsonb_path_ops);

SELECT data ->> 'event'                     AS name,
       data -> 'user' ->> 'email'           AS email,
       (data #>> '{meta,duration_ms}')::int AS ms
FROM   events
WHERE  data @> '{"event":"purchase"}'       -- uses the GIN index
ORDER  BY id DESC LIMIT 100;
~~~

## Full-text search

~~~sql title="Ranked search with a stored vector" engine="postgresql" run
ALTER TABLE articles ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))) STORED;
CREATE INDEX ON articles USING GIN (search);

SELECT id, title, ts_rank(search, q) AS rank
FROM   articles, websearch_to_tsquery('english', 'index performance -mysql') q
WHERE  search @@ q ORDER BY rank DESC LIMIT 20;
~~~

## Partitioning

~~~sql title="Declarative partitioning (10+)" engine="postgresql" run
CREATE TABLE events (id BIGINT, created_at TIMESTAMPTZ NOT NULL, payload JSONB)
PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_08 PARTITION OF events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

ALTER TABLE events DETACH PARTITION events_2025_08;   -- retention in O(1)
~~~

## Replication & backup

| Mechanism | Use |
| --- | --- |
| Streaming (physical) | Read replicas, HA, exact byte-level copy |
| Logical replication | Per-table replication, major-version upgrades, CDC to other systems |
| \`pg_dump -Fc\` | Logical backup — portable, selective restore |
| \`pg_basebackup\` + WAL archive | Physical backup with point-in-time recovery |

~~~sql title="Monitoring replication" engine="postgresql"
SELECT client_addr, state, pg_wal_lsn_diff(sent_lsn, replay_lsn) AS lag_bytes
FROM   pg_stat_replication;

-- an inactive slot retains WAL forever and will fill the disk:
SELECT slot_name, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn))
FROM   pg_replication_slots;
~~~

## Performance & monitoring

~~~sql title="The queries to know" engine="postgresql"
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT …;

CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT calls, round(total_exec_time::numeric,1) AS total_ms, round(mean_exec_time::numeric,2) AS mean_ms, query
FROM   pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;

SELECT relname, n_dead_tup, last_autovacuum FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 10;
SELECT relname, seq_scan, idx_scan FROM pg_stat_user_tables WHERE seq_scan > idx_scan;
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM   pg_stat_user_indexes WHERE idx_scan = 0;
~~~

| Setting | Starting point |
| --- | --- |
| \`shared_buffers\` | 25% of RAM |
| \`effective_cache_size\` | 50–75% of RAM (an estimate, not an allocation) |
| \`work_mem\` | 4–64 MB — **per sort node, per connection**; raise carefully |
| \`maintenance_work_mem\` | 512 MB–2 GB (vacuum, index builds) |
| \`max_connections\` | 100–200, with PgBouncer in front |
| \`random_page_cost\` | 1.1 on SSD (the default 4.0 assumes spinning disks) |
| \`wal_compression\` | \`on\` |

## Security

~~~sql title="Least privilege, and row-level security" engine="postgresql"
REVOKE ALL ON SCHEMA public FROM PUBLIC;
CREATE ROLE app_rw;
GRANT USAGE ON SCHEMA app TO app_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO app_rw;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON documents USING (tenant_id = current_setting('app.tenant_id')::bigint);
~~~

Authentication is configured in \`pg_hba.conf\`, evaluated top to bottom: use \`scram-sha-256\` (never \`md5\` or \`trust\`) and require TLS for anything crossing a network.

## Extensions worth knowing

| Extension | Purpose |
| --- | --- |
| \`pg_stat_statements\` | Query performance history — install it on every server |
| \`PostGIS\` | The most complete spatial implementation in any database |
| \`pgvector\` | Vector similarity search with HNSW/IVFFlat indexes |
| \`pg_trgm\` | Trigram indexes making \`LIKE '%x%'\` and fuzzy matching fast |
| \`TimescaleDB\` | Time-series hypertables, compression, continuous aggregates |
| \`pg_partman\` | Automated partition creation and retention |
| \`pgcrypto\` | Hashing and encryption functions |
| \`postgres_fdw\` | Query another PostgreSQL server as if it were local |

## Best practices

- Use \`TIMESTAMPTZ\`, never bare \`TIMESTAMP\`, for anything that records when something happened.
- Use \`TEXT\` unless a length limit is a genuine business rule.
- Prefer \`JSONB\` over \`JSON\`; promote fields you filter on to real columns.
- Lowercase \`snake_case\` identifiers — never \`"CamelCase"\`.
- Index every foreign key column; PostgreSQL does not do it for you.
- Set \`lock_timeout\` and \`statement_timeout\` before running DDL.
- Set \`idle_in_transaction_session_timeout\` — long transactions block vacuum.
- Put a connection pooler in front before you reach ~200 connections.
- Monitor transaction ID age; wraparound protection stops writes entirely.
- Install \`pg_stat_statements\` on day one, not during the incident.
`,
};
