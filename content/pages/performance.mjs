export default {
  slug: 'performance',
  path: '/performance/',
  title: 'Query performance & execution plans',
  category: 'Performance',
  difficulty: 'advanced',
  standard: 'Vendor-specific',
  summary: 'Reading EXPLAIN output, the operators that matter, statistics and cardinality, and a repeatable method for making a slow query fast.',
  keywords: 'explain analyze execution plan query optimization cost estimate cardinality statistics seq scan index scan nested loop hash join spill parallel query cache',
  body: `
Performance work is a loop: **measure → read the plan → find the largest wrong estimate or most expensive operator → change one thing → measure again.** Guessing costs more time than measuring.

## Getting a plan

| Engine | Estimated plan | Actual plan (executes the query) |
| --- | --- | --- |
| PostgreSQL | \`EXPLAIN q\` | \`EXPLAIN (ANALYZE, BUFFERS, VERBOSE) q\` |
| MySQL / MariaDB | \`EXPLAIN q\` | \`EXPLAIN ANALYZE q\` (8.0.18+) |
| SQL Server | \`SET SHOWPLAN_ALL ON\` | Include Actual Execution Plan, or \`SET STATISTICS IO, TIME ON\` |
| Oracle | \`EXPLAIN PLAN FOR q\` + \`DBMS_XPLAN.DISPLAY\` | \`DBMS_XPLAN.DISPLAY_CURSOR(format=>'ALLSTATS LAST')\` |
| SQLite | \`EXPLAIN QUERY PLAN q\` | — |
| BigQuery | Dry run / query plan tab | Execution details in the console or \`INFORMATION_SCHEMA.JOBS\` |
| Snowflake | \`EXPLAIN q\` | Query Profile in the UI |
| ClickHouse | \`EXPLAIN q\` | \`EXPLAIN PIPELINE\`, \`system.query_log\` |

~~~sql title="The one to use in PostgreSQL" engine="postgresql" run
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS, FORMAT TEXT)
SELECT c.country, COUNT(*)
FROM   orders o JOIN customers c ON c.id = o.customer_id
WHERE  o.created_at >= DATE '2026-01-01'
GROUP  BY c.country;
~~~

::: danger EXPLAIN ANALYZE actually runs the statement
On an \`UPDATE\` or \`DELETE\` it performs the write. Wrap it:

~~~sql
BEGIN; EXPLAIN (ANALYZE) DELETE FROM orders WHERE …; ROLLBACK;
~~~
:::

## Reading a plan

~~~text title="PostgreSQL, annotated"
HashAggregate  (cost=18234.55..18240.55 rows=200 width=40)
               (actual time=412.331..412.402 rows=14 loops=1)
  Group Key: c.country
  ->  Hash Join  (cost=1284.00..17984.55 rows=50000 width=32)
                 (actual time=18.114..389.201 rows=48213 loops=1)
        Hash Cond: (o.customer_id = c.id)
        ->  Seq Scan on orders o  (cost=0.00..15234.00 rows=50000 width=8)
                                  (actual time=0.019..301.442 rows=48213 loops=1)
              Filter: (created_at >= '2026-01-01'::date)
              Rows Removed by Filter: 451787          ← 90% of the scan was wasted
        ->  Hash  (actual time=17.980..17.981 rows=20000 loops=1)
              Buckets: 32768  Batches: 1  Memory Usage: 1132kB
              ->  Seq Scan on customers c  (…)
Planning Time: 0.284 ms
Execution Time: 412.556 ms
~~~

Read it **innermost first, bottom to top**. Four things to look at, in order:

1. **\`rows\` estimated vs \`rows\` actual.** An order-of-magnitude gap is the root cause of most bad plans — everything above it was chosen on bad information.
2. **\`loops\`.** \`actual time\` is *per loop*. A node showing \`0.5ms … loops=48213\` cost 24 seconds, not 0.5 ms.
3. **\`Rows Removed by Filter\`.** Rows read then thrown away — the signature of a missing index.
4. **Memory / spills.** \`Batches: 1\` is good; more means the hash spilled to disk. \`Sort Method: external merge\` means the sort spilled.

## The operators

| Operator | Meaning | Concerning when |
| --- | --- | --- |
| **Seq Scan / Table Scan** | Read every row | The table is large and the filter is selective |
| **Index Scan / Seek** | Walk the index, fetch matching rows | Rarely — this is usually the goal |
| **Index Only Scan** | Answered from the index alone | Ideal; check \`Heap Fetches\` is low |
| **Bitmap Heap Scan** | Collect matches in a bitmap, then read pages in order | Normal for medium selectivity |
| **Nested Loop** | For each outer row, probe the inner | The inner side has no index, or outer rows are numerous |
| **Hash Join** | Build a hash, probe it | \`Batches > 1\` (spilled to disk) |
| **Merge Join** | Walk two sorted inputs | Only if the sorts it needs are expensive |
| **Sort** | Order rows | \`external merge Disk:\` — spilled |
| **Materialize / Memoize** | Cache an inner result | Usually helpful |
| **Gather / Parallel** | Multi-worker execution | Worker count lower than expected |

## Cardinality and statistics

The planner picks a plan from estimated row counts. Wrong estimates produce wrong plans, and no amount of index-adding fixes that.

~~~sql title="Refreshing statistics" engine="ansi"
ANALYZE orders;                                    -- PostgreSQL
ANALYZE TABLE orders;                              -- MySQL, MariaDB, ClickHouse
UPDATE STATISTICS dbo.orders WITH FULLSCAN;        -- SQL Server
EXEC DBMS_STATS.GATHER_TABLE_STATS('APP','ORDERS');-- Oracle
ANALYZE;                                           -- SQLite (writes sqlite_stat1)
~~~

**Correlated columns** are the classic failure. The planner assumes predicates are independent, so \`WHERE city = 'Paris' AND country = 'FR'\` gets estimated as the product of two selectivities — perhaps 10,000× too low, even though every Paris row is in France.

~~~sql title="Teaching PostgreSQL about correlation" engine="postgresql"
CREATE STATISTICS stat_city_country (dependencies, ndistinct)
    ON city, country FROM customers;
ANALYZE customers;
~~~

~~~sql title="Raising the sample size for a skewed column" engine="postgresql"
ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;   -- default 100
ANALYZE orders;
~~~

::: warn Bind-variable peeking / parameter sniffing
The engine compiles a plan for the *first* parameter value and reuses it. If \`status = 'failed'\` (0.9% of rows) compiles an index seek and the plan is then reused for \`status = 'completed'\` (96%), every subsequent execution does millions of random lookups.

Fixes: \`OPTION (RECOMPILE)\` or \`OPTIMIZE FOR UNKNOWN\` (SQL Server), \`plan_cache_mode = force_custom_plan\` (PostgreSQL), \`/*+ BIND_AWARE */\` and adaptive cursor sharing (Oracle).
:::

## A worked example

~~~sql title="The query" engine="postgresql" run
SELECT * FROM orders WHERE customer_id = 12345;
~~~

~~~text title="Before — no index"
Seq Scan on orders  (cost=0.00..18334.00 rows=12 width=64)
                    (actual time=0.021..142.883 rows=14 loops=1)
  Filter: (customer_id = 12345)
  Rows Removed by Filter: 999986
  Buffers: shared hit=8334
Execution Time: 142.9 ms
~~~

~~~sql title="The fix"
CREATE INDEX idx_orders_customer_id ON orders (customer_id);
ANALYZE orders;
~~~

~~~text title="After — index scan"
Index Scan using idx_orders_customer_id on orders
      (cost=0.42..38.21 rows=12 width=64) (actual time=0.028..0.041 rows=14 loops=1)
  Index Cond: (customer_id = 12345)
  Buffers: shared hit=5
Execution Time: 0.06 ms
~~~

**2,380× faster, and 1,667× fewer buffers touched.** The buffer count matters more than the timing: it is stable across cache states and machine load.

## The usual suspects

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Seq scan on a big table with a selective filter | Missing index, or a non-sargable predicate | Add the index; unwrap the column |
| Nested loop with huge \`loops\` | Bad cardinality estimate | \`ANALYZE\`; extended statistics; rewrite |
| Sort spilling to disk | \`work_mem\` too small, or sorting more than needed | Raise memory; index the sort key; filter earlier |
| Hash join with \`Batches > 1\` | Build side larger than memory | Raise memory; reduce columns; filter first |
| Fast alone, slow in the app | Parameter sniffing, or N+1 queries | Recompile hints; batch the queries |
| Gradually slower over weeks | Table/index bloat, stale statistics | Vacuum/rebuild; re-analyze |
| Fast on a replica, slow on the primary | Lock contention, not the plan | Look at waits, not the plan |

## Things to try before adding hardware

1. **Return less.** Name your columns, push \`LIMIT\` down, and aggregate in the database rather than the client.
2. **Filter earlier.** Predicates in \`WHERE\` beat filtering after a join; filtering in a subquery beats filtering after aggregation.
3. **Index the join and filter keys** — including foreign keys, which most schemas leave unindexed.
4. **Replace correlated subqueries** with joins or window functions.
5. **Batch writes.** One statement with 1,000 rows beats 1,000 statements by a wide margin.
6. **Cache the unchanging.** A materialized view or summary table beats recomputing a daily aggregate per request.
7. **Only then** consider partitioning, sharding or a bigger instance.

## Engine-specific measurement

~~~sql title="PostgreSQL — the slowest statements overall" engine="postgresql"
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT calls, ROUND(total_exec_time::numeric, 1) AS total_ms,
       ROUND(mean_exec_time::numeric, 2) AS mean_ms, rows, query
FROM   pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
~~~

~~~sql title="MySQL" engine="mysql"
SELECT digest_text, count_star, ROUND(avg_timer_wait/1e9, 2) AS avg_ms,
       ROUND(sum_timer_wait/1e12, 2) AS total_s
FROM   performance_schema.events_statements_summary_by_digest
ORDER  BY sum_timer_wait DESC LIMIT 20;

SELECT * FROM sys.statements_with_full_table_scans LIMIT 20;
~~~

~~~sql title="SQL Server" engine="sqlserver"
SELECT TOP 20 qs.execution_count,
       qs.total_worker_time / 1000 AS cpu_ms,
       qs.total_elapsed_time / qs.execution_count / 1000 AS avg_ms,
       SUBSTRING(st.text, (qs.statement_start_offset/2) + 1, 200) AS stmt
FROM   sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) st
ORDER  BY qs.total_worker_time DESC;
~~~

::: tip Optimize total time, not worst case
A 5-second query run once an hour costs 5 seconds. A 40 ms query run 200 times per second costs 8 seconds of database time every second. \`pg_stat_statements\` sorted by *total* time — not mean — points at the queries that actually matter.
:::

## Caching

| Engine | Query result cache |
| --- | --- |
| PostgreSQL | None. The buffer cache and OS page cache serve pages, not results |
| MySQL | Query cache **removed** in 8.0 (it was a contention point) |
| Oracle | Result cache: \`/*+ RESULT_CACHE */\` |
| SQL Server | Plan cache only, not results |
| Snowflake | Result cache (24 h) + local disk cache; identical query text and unchanged data |
| BigQuery | Cached results for 24 h; cache hits are free |
| ClickHouse | Query cache, opt-in per query |

::: warn Application-level caching outperforms all of them
Database result caches invalidate on any change to the underlying tables, so a busy OLTP table effectively never gets a hit. Cache in your application where you control the key and the TTL.
:::
`,
  related: [
    { label: 'Indexes', href: '/indexes/' },
    { label: 'Joins & join algorithms', href: '/joins/#join-algorithms' },
    { label: 'Transactions & locking', href: '/transactions/' },
    { label: 'Administration', href: '/admin/' },
  ],
};
