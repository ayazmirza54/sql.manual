export default {
  slug: 'transactions',
  path: '/transactions/',
  title: 'Transactions, isolation & locking',
  category: 'Transactions',
  difficulty: 'advanced',
  standard: 'SQL-92',
  summary: 'ACID, the four isolation levels and the anomalies they permit, MVCC vs locking, deadlocks, and the concurrency patterns that actually work.',
  keywords: 'transaction begin commit rollback savepoint acid isolation level read committed repeatable read serializable dirty read phantom deadlock mvcc lock select for update optimistic pessimistic',
  body: `
A transaction is a unit of work that either happens completely or not at all.

~~~sql title="The statements" engine="ansi" run
BEGIN;                                   -- or START TRANSACTION
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;                                  -- or ROLLBACK to undo everything
~~~

~~~sql title="Savepoints — partial rollback" engine="ansi" run
BEGIN;
    INSERT INTO orders (id, total) VALUES (1, 100);
    SAVEPOINT after_order;
    INSERT INTO order_items (order_id, sku) VALUES (1, 'BAD-SKU');
    ROLLBACK TO SAVEPOINT after_order;   -- undo the item, keep the order
    INSERT INTO order_items (order_id, sku) VALUES (1, 'GOOD-SKU');
    RELEASE SAVEPOINT after_order;
COMMIT;
~~~

| Engine | Start | Savepoints | Autocommit default |
| --- | --- | --- | --- |
| PostgreSQL | \`BEGIN\` / \`START TRANSACTION\` | Yes | On |
| MySQL / MariaDB | \`START TRANSACTION\` / \`BEGIN\` | Yes | On (\`autocommit=1\`) |
| SQL Server | \`BEGIN TRANSACTION\` | Yes | On (implicit transactions optional) |
| Oracle | Implicit — a transaction starts at the first DML | Yes | **Off** — you must \`COMMIT\` |
| SQLite | \`BEGIN\` / \`BEGIN IMMEDIATE\` | Yes | On |
| BigQuery | \`BEGIN TRANSACTION\` | No | On |
| Snowflake | \`BEGIN\` | No | On |

::: warn DDL and transactions
PostgreSQL, SQL Server, SQLite, Db2 and CockroachDB support **transactional DDL** — a \`CREATE TABLE\` inside a transaction rolls back. MySQL and Oracle issue an implicit \`COMMIT\` before and after every DDL statement, so a migration that fails halfway leaves the schema partially changed.
:::

## ACID

| Property | Guarantee | Mechanism |
| --- | --- | --- |
| **Atomicity** | All or nothing | Undo log / rollback segment |
| **Consistency** | Constraints hold before and after | Constraint checking |
| **Isolation** | Concurrent transactions do not corrupt each other | MVCC or locking |
| **Durability** | A committed transaction survives a crash | Write-ahead log + \`fsync\` |

::: note Durability is a setting, not an absolute
\`synchronous_commit = off\` (PostgreSQL), \`innodb_flush_log_at_trx_commit = 2\` (MySQL), \`PRAGMA synchronous = NORMAL\` (SQLite) all trade durability for throughput. They are legitimate choices for some workloads — provided everyone knows a crash can lose the last fraction of a second of committed transactions.
:::

## Isolation levels

The standard defines four levels by which anomalies they permit.

| Level | Dirty read | Non-repeatable read | Phantom read | Lost update / write skew |
| --- | --- | --- | --- | --- |
| \`READ UNCOMMITTED\` | Possible | Possible | Possible | Possible |
| \`READ COMMITTED\` | — | Possible | Possible | Possible |
| \`REPEATABLE READ\` | — | — | Possible* | Write skew possible |
| \`SERIALIZABLE\` | — | — | — | — |

\\* PostgreSQL's \`REPEATABLE READ\` (snapshot isolation) prevents phantom reads too — stricter than the standard requires.

### The anomalies

**Dirty read** — reading data another transaction has written but not committed. If that transaction rolls back, you acted on data that never existed.

**Non-repeatable read** — reading the same row twice in one transaction and getting different values, because another transaction committed a change in between.

~~~sql title="Non-repeatable read" engine="ansi"
-- T1                                     -- T2
BEGIN;
SELECT balance FROM accounts WHERE id=1;  -- 100
                                          BEGIN;
                                          UPDATE accounts SET balance=50 WHERE id=1;
                                          COMMIT;
SELECT balance FROM accounts WHERE id=1;  -- 50 under READ COMMITTED, 100 under REPEATABLE READ
COMMIT;
~~~

**Phantom read** — re-running the same *query* returns new rows another transaction inserted.

**Lost update** — two transactions read a value, both compute a new one, and the second overwrites the first.

~~~sql title="Lost update — the classic read-modify-write bug" engine="ansi"
-- T1                                        -- T2
SELECT stock FROM items WHERE id=1;  -- 10
                                             SELECT stock FROM items WHERE id=1;  -- 10
UPDATE items SET stock = 9 WHERE id=1;
                                             UPDATE items SET stock = 9 WHERE id=1;
-- Two units sold, stock decremented once.
~~~

~~~sql title="Three correct fixes" engine="ansi" run
-- 1. Atomic write — no read-modify-write at all. Best when possible.
UPDATE items SET stock = stock - 1 WHERE id = 1 AND stock > 0;

-- 2. Pessimistic lock — serialise the readers
BEGIN;
  SELECT stock FROM items WHERE id = 1 FOR UPDATE;
  UPDATE items SET stock = 9 WHERE id = 1;
COMMIT;

-- 3. Optimistic concurrency — detect the conflict, retry
UPDATE items SET stock = 9, version = version + 1 WHERE id = 1 AND version = 4;
-- 0 rows affected means someone else won; re-read and retry.
~~~

**Write skew** — two transactions each read an overlapping set, each check an invariant that still holds, and each write a disjoint row; together they break the invariant. Snapshot isolation permits it; only \`SERIALIZABLE\` prevents it.

::: note The classic write-skew example
Two doctors are on call; the rule is "at least one must remain". Both transactions read "2 on call", both conclude it is safe to sign off, both update *different* rows. Nobody is on call. \`REPEATABLE READ\` will not stop this — you need \`SERIALIZABLE\`, or an explicit lock on a shared row.
:::

### Defaults differ, and it matters

| Engine | Default isolation | Implementation |
| --- | --- | --- |
| PostgreSQL | \`READ COMMITTED\` | MVCC; \`SERIALIZABLE\` uses SSI (predicate tracking, no locks) |
| MySQL / InnoDB | **\`REPEATABLE READ\`** | MVCC + gap locks (which is how it blocks phantoms) |
| SQL Server | \`READ COMMITTED\` (locking) | Locks by default; \`READ_COMMITTED_SNAPSHOT ON\` switches to MVCC |
| Oracle | \`READ COMMITTED\` | MVCC; has no \`REPEATABLE READ\` — only \`READ COMMITTED\` and \`SERIALIZABLE\` |
| SQLite | \`SERIALIZABLE\` | One writer at a time; WAL mode allows concurrent readers |
| CockroachDB | \`SERIALIZABLE\` | Distributed SSI |
| Snowflake / BigQuery | \`READ COMMITTED\` | Snapshot per statement |

~~~sql title="Setting the level" engine="ansi"
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;                  -- next transaction (ANSI)
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;             -- PostgreSQL, inline
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;        -- MySQL, session
ALTER DATABASE app SET READ_COMMITTED_SNAPSHOT ON;             -- SQL Server, database-wide
~~~

::: danger MySQL and SQL Server defaults surprise people moving between them
MySQL defaults to \`REPEATABLE READ\`, so a long-running transaction keeps reading a stale snapshot — reports "miss" recent data. SQL Server defaults to lock-based \`READ COMMITTED\`, so readers **block** writers and vice versa; enabling \`READ_COMMITTED_SNAPSHOT\` usually eliminates a whole class of timeouts at the cost of tempdb version-store space.
:::

## MVCC

Multi-Version Concurrency Control keeps multiple versions of each row so readers never block writers and writers never block readers.

| Engine | Old versions live in | Cleanup |
| --- | --- | --- |
| PostgreSQL | The table itself (dead tuples) | \`VACUUM\` / autovacuum |
| MySQL/InnoDB | Undo tablespace | Purge threads |
| Oracle | Undo tablespace | Automatic; \`ORA-01555 snapshot too old\` if undo is recycled too soon |
| SQL Server (RCSI) | \`tempdb\` version store | Automatic |

::: warn A long-running transaction blocks cleanup everywhere
Old versions cannot be removed while any transaction might still need to see them. An idle-in-transaction session held open for hours causes PostgreSQL table bloat, InnoDB undo growth, Oracle ORA-01555 errors and SQL Server tempdb growth. Set \`idle_in_transaction_session_timeout\` and never leave a transaction open across a user interaction.
:::

## Locking

~~~sql title="Explicit row locks" engine="ansi" run
SELECT * FROM accounts WHERE id = 1 FOR UPDATE;          -- exclusive; blocks other lockers
SELECT * FROM accounts WHERE id = 1 FOR SHARE;           -- shared; blocks writers only
SELECT * FROM jobs WHERE status='queued' LIMIT 1 FOR UPDATE SKIP LOCKED;  -- queue pattern
SELECT * FROM accounts WHERE id = 1 FOR UPDATE NOWAIT;   -- fail immediately instead of waiting
~~~

:::support
postgresql=y~9.5+_SKIP_LOCKED mysql=y~8.0+_SKIP_LOCKED oracle=y~SKIP_LOCKED db2=y sqlserver=w~READPAST_hint mariadb=y~10.6+ cockroachdb=y sqlite=n~whole_db_lock bigquery=n snowflake=n redshift=n
:::

~~~sql title="SKIP LOCKED makes a reliable job queue" engine="postgresql" run
BEGIN;
  SELECT id, payload FROM jobs
   WHERE status = 'queued'
   ORDER BY priority DESC, created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;         -- each worker gets a different row, no contention

  UPDATE jobs SET status = 'running', started_at = now() WHERE id = :id;
COMMIT;
~~~

### Lock granularity

Row → page → table → database. Engines **escalate** when too many fine locks accumulate: SQL Server converts to a table lock past ~5,000 row locks, which turns a large batch update into a blocking operation for everyone. Batch your writes to stay under the threshold.

## Deadlocks

Two transactions each hold a lock the other needs. The engine detects the cycle and kills one.

~~~sql title="How to create one" engine="ansi"
-- T1                                     -- T2
BEGIN;                                    BEGIN;
UPDATE accounts SET … WHERE id = 1;       UPDATE accounts SET … WHERE id = 2;
UPDATE accounts SET … WHERE id = 2;  ←→   UPDATE accounts SET … WHERE id = 1;
-- one of them is aborted with a deadlock error
~~~

**Prevention:**

1. **Always acquire locks in the same order** — e.g. sort ids ascending before updating a batch. This alone eliminates most deadlocks.
2. Keep transactions short; never wait on network or user input inside one.
3. Use a single atomic statement instead of read-then-write where possible.
4. Lower the isolation level if the workload permits it.
5. **Retry.** Deadlocks are a normal condition in a busy system, not a bug — application code should catch the error (SQLSTATE \`40P01\` PostgreSQL, \`40001\` serialization failure, error 1213 MySQL, 1205 SQL Server) and retry with backoff.

~~~sql title="Inspecting deadlocks" engine="ansi"
SHOW ENGINE INNODB STATUS;                        -- MySQL: LATEST DETECTED DEADLOCK section
SELECT * FROM pg_locks JOIN pg_stat_activity USING (pid) WHERE NOT granted;  -- PostgreSQL
-- PostgreSQL logs them when log_lock_waits = on and deadlock_timeout is reached
EXEC sp_who2; SELECT * FROM sys.dm_tran_locks;    -- SQL Server
~~~

~~~sql title="PostgreSQL — who is blocking whom" engine="postgresql"
SELECT blocked.pid AS blocked_pid, blocked.query AS blocked_query,
       blocking.pid AS blocking_pid, blocking.query AS blocking_query,
       now() - blocked.query_start AS waiting_for
FROM   pg_stat_activity blocked
JOIN   pg_stat_activity blocking ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE  cardinality(pg_blocking_pids(blocked.pid)) > 0;
~~~

## Serializable and retries

\`SERIALIZABLE\` in PostgreSQL and CockroachDB does not lock — it detects conflicts at commit time and aborts one transaction with a serialization failure. **Every application using it must implement retry.**

~~~text title="The required pattern"
for attempt in 1..N:
    try:
        BEGIN ISOLATION LEVEL SERIALIZABLE
        … work …
        COMMIT
        break
    except SerializationFailure (SQLSTATE 40001):
        ROLLBACK
        sleep(backoff * 2^attempt + jitter)
~~~

::: tip Choosing a level
Start at the engine's default. Move to \`SERIALIZABLE\` for the specific transactions that enforce a cross-row invariant (booking a seat, enforcing a balance floor, allocating a unique slot) and implement retry there. Blanket \`SERIALIZABLE\` across a whole application usually costs more throughput than the correctness is worth — and blanket \`READ UNCOMMITTED\` is almost never the right answer.
:::
`,
  related: [
    { label: 'MERGE & upsert concurrency', href: '/sql/merge/' },
    { label: 'Performance', href: '/performance/' },
    { label: 'Administration', href: '/admin/' },
    { label: 'Database explorer', href: '/databases/' },
  ],
};
