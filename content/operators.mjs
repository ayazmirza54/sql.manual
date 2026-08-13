/** SQL operator reference. cat = category slug. */
export const categories = [
  { id: 'arithmetic', label: 'Arithmetic' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'logical', label: 'Logical' },
  { id: 'string', label: 'String' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'null', label: 'NULL' },
  { id: 'set', label: 'Set & subquery' },
  { id: 'bitwise', label: 'Bitwise' },
  { id: 'json', label: 'JSON' },
  { id: 'array', label: 'Array & range' },
  { id: 'cast', label: 'Cast & other' },
];

export default [
  // ---------- arithmetic ----------
  { op: '+', cat: 'arithmetic', desc: 'Addition; also date + interval arithmetic.', ex: 'SELECT 2 + 3;  -- 5', engines: 'all' },
  { op: '-', cat: 'arithmetic', desc: 'Subtraction; date difference in some engines.', ex: 'SELECT 5 - 2;  -- 3', engines: 'all' },
  { op: '*', cat: 'arithmetic', desc: 'Multiplication.', ex: 'SELECT 4 * 2;  -- 8', engines: 'all' },
  {
    op: '/',
    cat: 'arithmetic',
    desc: 'Division. Integer / integer truncates in PostgreSQL, SQL Server, Oracle (no) and Db2; MySQL and SQLite return a float.',
    ex: 'SELECT 7 / 2;   -- 3 in PostgreSQL, 3.5 in MySQL\nSELECT 7 / 2.0; -- 3.5 everywhere',
    engines: 'all',
    note: 'Division by zero raises an error in PostgreSQL, SQL Server and Oracle; MySQL returns NULL.',
  },
  { op: '%', cat: 'arithmetic', desc: 'Modulo (remainder). Oracle uses MOD(a,b) instead.', ex: 'SELECT 7 % 3;  -- 1', engines: 'pg, mysql, mssql, sqlite, snowflake, bigquery' },
  { op: '^', cat: 'arithmetic', desc: 'Exponentiation in PostgreSQL; bitwise XOR in MySQL and Oracle. Prefer POWER().', ex: 'SELECT 2 ^ 3;  -- 8 (PostgreSQL)', engines: 'pg, duckdb' },
  { op: '||/  |/', cat: 'arithmetic', desc: 'Cube root and square root (PostgreSQL).', ex: 'SELECT |/ 25;  -- 5', engines: 'pg' },
  { op: '@', cat: 'arithmetic', desc: 'Absolute value (PostgreSQL).', ex: 'SELECT @ -5;  -- 5', engines: 'pg' },

  // ---------- comparison ----------
  { op: '=', cat: 'comparison', desc: 'Equality. NULL = NULL is UNKNOWN, not TRUE.', ex: "WHERE status = 'paid'", engines: 'all' },
  { op: '<> / !=', cat: 'comparison', desc: 'Not equal. <> is the ANSI spelling; != is accepted everywhere.', ex: "WHERE status <> 'paid'", engines: 'all' },
  { op: '< <= > >=', cat: 'comparison', desc: 'Ordering comparison. Text uses the column collation.', ex: 'WHERE total >= 100', engines: 'all' },
  { op: 'BETWEEN', cat: 'comparison', desc: 'Inclusive range: a BETWEEN x AND y is a >= x AND a <= y.', ex: 'WHERE total BETWEEN 100 AND 500', engines: 'all', note: 'Inclusive on both ends — a trap with timestamps.' },
  { op: 'NOT BETWEEN', cat: 'comparison', desc: 'Negated inclusive range.', ex: 'WHERE total NOT BETWEEN 100 AND 500', engines: 'all' },
  { op: 'IS DISTINCT FROM', cat: 'comparison', desc: 'NULL-safe inequality: TRUE when exactly one side is NULL.', ex: 'WHERE a IS DISTINCT FROM b', engines: 'pg, db2, duckdb, trino, cockroach, sqlite 3.39+' },
  { op: '<=>', cat: 'comparison', desc: 'NULL-safe equality (MySQL, MariaDB, SQLite, Databricks).', ex: 'WHERE a <=> b', engines: 'mysql, mariadb, sqlite, databricks' },
  { op: 'IS [NOT] TRUE/FALSE/UNKNOWN', cat: 'comparison', desc: 'Three-valued boolean test that never returns UNKNOWN itself.', ex: 'WHERE is_active IS NOT TRUE', engines: 'pg, mysql, db2, sqlite' },
  { op: 'ROW(a,b) = ROW(c,d)', cat: 'comparison', desc: 'Row constructor comparison; compares tuples lexicographically.', ex: 'WHERE (created_at, id) < (?, ?)', engines: 'pg, mysql, sqlite, db2, duckdb' },

  // ---------- logical ----------
  { op: 'AND', cat: 'logical', desc: 'Conjunction. Binds tighter than OR.', ex: "WHERE a = 1 AND b = 2", engines: 'all' },
  { op: 'OR', cat: 'logical', desc: 'Disjunction. Parenthesise when mixed with AND.', ex: "WHERE a = 1 OR b = 2", engines: 'all' },
  { op: 'NOT', cat: 'logical', desc: 'Negation. NOT UNKNOWN is UNKNOWN.', ex: 'WHERE NOT is_deleted', engines: 'all' },

  // ---------- string ----------
  { op: '||', cat: 'string', desc: 'String concatenation (ANSI). NULL || x is NULL except in Oracle, where NULL behaves as an empty string.', ex: "SELECT first_name || ' ' || last_name", engines: 'pg, oracle, sqlite, db2, snowflake, duckdb, trino' },
  { op: 'CONCAT()', cat: 'string', desc: 'Portable concatenation. MySQL CONCAT returns NULL if any argument is NULL; CONCAT_WS skips NULLs.', ex: "SELECT CONCAT(first_name, ' ', last_name)", engines: 'all' },
  { op: '+', cat: 'string', desc: 'String concatenation in SQL Server and Sybase. NULL + x is NULL unless CONCAT_NULL_YIELDS_NULL is off.', ex: "SELECT first_name + ' ' + last_name", engines: 'mssql, synapse' },
  { op: 'COLLATE', cat: 'string', desc: 'Override the collation for a comparison or sort.', ex: 'ORDER BY name COLLATE "de-DE-x-icu"', engines: 'pg, mysql, mssql, sqlite, snowflake' },

  // ---------- pattern ----------
  { op: 'LIKE', cat: 'pattern', desc: 'Pattern match. % matches any sequence, _ matches one character.', ex: "WHERE email LIKE 'a%@example.com'", engines: 'all' },
  { op: 'NOT LIKE', cat: 'pattern', desc: 'Negated pattern match.', ex: "WHERE email NOT LIKE '%@test.com'", engines: 'all' },
  { op: 'ILIKE', cat: 'pattern', desc: 'Case-insensitive LIKE.', ex: "WHERE email ILIKE 'A%'", engines: 'pg, snowflake, cockroach, duckdb' },
  { op: 'SIMILAR TO', cat: 'pattern', desc: 'SQL-standard regular expression, halfway between LIKE and POSIX regex.', ex: "WHERE code SIMILAR TO '[A-Z]{3}-[0-9]+'", engines: 'pg, db2' },
  { op: '~  ~*  !~  !~*', cat: 'pattern', desc: 'POSIX regex match: case-sensitive, case-insensitive, and their negations.', ex: "WHERE phone ~ '^[0-9]{10}$'", engines: 'pg, cockroach, duckdb' },
  { op: 'REGEXP / RLIKE', cat: 'pattern', desc: 'Regex match.', ex: "WHERE phone REGEXP '^[0-9]{10}$'", engines: 'mysql, mariadb, sqlite (if compiled), databricks, clickhouse' },
  { op: 'REGEXP_LIKE()', cat: 'pattern', desc: 'Function form of regex matching.', ex: "WHERE REGEXP_LIKE(phone, '^[0-9]{10}$')", engines: 'oracle, mysql 8, db2, snowflake' },
  { op: 'ESCAPE', cat: 'pattern', desc: 'Define an escape character so % and _ can be matched literally.', ex: "WHERE path LIKE '100\\%%' ESCAPE '\\'", engines: 'all' },
  { op: 'MATCH … AGAINST', cat: 'pattern', desc: 'Full-text search against a FULLTEXT index.', ex: "WHERE MATCH(body) AGAINST ('sql' IN BOOLEAN MODE)", engines: 'mysql, mariadb' },
  { op: '@@', cat: 'pattern', desc: 'Full-text match between a tsvector and a tsquery.', ex: "WHERE search @@ websearch_to_tsquery('sql')", engines: 'pg' },

  // ---------- null ----------
  { op: 'IS NULL', cat: 'null', desc: 'The only correct test for NULL.', ex: 'WHERE deleted_at IS NULL', engines: 'all' },
  { op: 'IS NOT NULL', cat: 'null', desc: 'Presence test.', ex: 'WHERE phone IS NOT NULL', engines: 'all' },
  { op: 'COALESCE()', cat: 'null', desc: 'First non-NULL argument. Short-circuits.', ex: "SELECT COALESCE(nickname, name, 'anon')", engines: 'all' },
  { op: 'NULLIF()', cat: 'null', desc: 'NULL when the two arguments are equal — the standard divide-by-zero guard.', ex: 'SELECT total / NULLIF(count, 0)', engines: 'all' },
  { op: 'IFNULL() / NVL() / ISNULL()', cat: 'null', desc: 'Two-argument COALESCE. IFNULL: MySQL/SQLite/BigQuery. NVL: Oracle/Redshift/Db2. ISNULL: SQL Server.', ex: 'SELECT NVL(bonus, 0)', engines: 'varies' },

  // ---------- set ----------
  { op: 'IN', cat: 'set', desc: 'Set membership against a list or subquery.', ex: "WHERE country IN ('DE','FR')", engines: 'all' },
  { op: 'NOT IN', cat: 'set', desc: 'Negated membership. Returns no rows if the set contains NULL — prefer NOT EXISTS.', ex: 'WHERE id NOT IN (SELECT parent_id FROM t WHERE parent_id IS NOT NULL)', engines: 'all', note: 'The single most common NULL bug in SQL.' },
  { op: 'EXISTS', cat: 'set', desc: 'TRUE if the subquery returns at least one row. Semi-join; NULL-safe.', ex: 'WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)', engines: 'all' },
  { op: 'NOT EXISTS', cat: 'set', desc: 'Anti-join. The correct way to express "has no matching row".', ex: 'WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)', engines: 'all' },
  { op: 'ANY / SOME', cat: 'set', desc: 'Quantified comparison — TRUE if it holds for at least one row. Over an empty set: FALSE.', ex: 'WHERE price > ANY (SELECT price FROM budget)', engines: 'pg, mysql, mssql, oracle, db2, snowflake' },
  { op: 'ALL', cat: 'set', desc: 'TRUE if the comparison holds for every row. Over an empty set: TRUE.', ex: 'WHERE price > ALL (SELECT price FROM budget)', engines: 'pg, mysql, mssql, oracle, db2, snowflake' },
  { op: 'UNION [ALL]', cat: 'set', desc: 'Combine result sets. UNION deduplicates; UNION ALL does not and is much faster.', ex: 'SELECT a FROM t1 UNION ALL SELECT a FROM t2', engines: 'all' },
  { op: 'INTERSECT', cat: 'set', desc: 'Rows present in both result sets.', ex: 'SELECT a FROM t1 INTERSECT SELECT a FROM t2', engines: 'pg, mysql 8.0.31+, sqlite, mssql, oracle, snowflake, bigquery' },
  { op: 'EXCEPT / MINUS', cat: 'set', desc: 'Rows in the first set but not the second. Oracle spells it MINUS.', ex: 'SELECT a FROM t1 EXCEPT SELECT a FROM t2', engines: 'pg, sqlite, mssql, oracle (MINUS), snowflake, bigquery' },

  // ---------- bitwise ----------
  { op: '&', cat: 'bitwise', desc: 'Bitwise AND.', ex: 'SELECT 12 & 10;  -- 8', engines: 'pg, mysql, mssql, sqlite, oracle (BITAND)' },
  { op: '|', cat: 'bitwise', desc: 'Bitwise OR.', ex: 'SELECT 12 | 10;  -- 14', engines: 'pg, mysql, mssql, sqlite' },
  { op: '#', cat: 'bitwise', desc: 'Bitwise XOR in PostgreSQL. MySQL and Oracle use ^; SQL Server uses ^.', ex: 'SELECT 12 # 10;  -- 6', engines: 'pg' },
  { op: '~', cat: 'bitwise', desc: 'Bitwise NOT (also POSIX regex match in PostgreSQL — context decides).', ex: 'SELECT ~5;  -- -6', engines: 'pg, mysql, mssql, sqlite' },
  { op: '<<  >>', cat: 'bitwise', desc: 'Left and right bit shift.', ex: 'SELECT 1 << 4;  -- 16', engines: 'pg, mysql, sqlite' },

  // ---------- json ----------
  { op: '->', cat: 'json', desc: 'Extract a JSON object field or array element, returning JSON.', ex: "SELECT data -> 'user' -> 'name'", engines: 'pg, mysql, sqlite 3.38+' },
  { op: '->>', cat: 'json', desc: 'Extract as text/scalar rather than JSON.', ex: "SELECT data ->> 'name'", engines: 'pg, mysql, sqlite 3.38+' },
  { op: '#>  #>>', cat: 'json', desc: 'Extract by path array, as JSON or as text.', ex: "SELECT data #>> '{user,name}'", engines: 'pg' },
  { op: '@>  <@', cat: 'json', desc: 'JSONB containment — index-usable with GIN.', ex: 'WHERE data @> \'{"status":"active"}\'', engines: 'pg' },
  { op: '?  ?|  ?&', cat: 'json', desc: 'Key exists / any key exists / all keys exist.', ex: "WHERE data ? 'email'", engines: 'pg' },
  { op: '@?  @@', cat: 'json', desc: 'JSONPath exists / JSONPath predicate match.', ex: "WHERE data @? '$.tags[*] ? (@ == \"admin\")'", engines: 'pg 12+' },
  { op: ':', cat: 'json', desc: 'Snowflake VARIANT path access.', ex: 'SELECT data:user.name::STRING', engines: 'snowflake' },

  // ---------- array ----------
  { op: '= ANY(array)', cat: 'array', desc: 'Element membership in an array.', ex: "WHERE 'admin' = ANY (tags)", engines: 'pg' },
  { op: '@>  <@  &&', cat: 'array', desc: 'Array contains / contained by / overlaps. GIN-indexable.', ex: "WHERE tags @> ARRAY['sql']", engines: 'pg' },
  { op: '||', cat: 'array', desc: 'Array concatenation.', ex: "SELECT tags || ARRAY['new']", engines: 'pg' },
  { op: 'arr[1:3]', cat: 'array', desc: 'Array slice. PostgreSQL arrays are 1-based.', ex: 'SELECT scores[1:3]', engines: 'pg, bigquery (OFFSET/ORDINAL)' },
  { op: '@>  &&  -|-', cat: 'array', desc: 'Range containment, overlap and adjacency (PostgreSQL range types).', ex: "WHERE period && tstzrange(now(), now() + interval '1h')", engines: 'pg' },
  { op: '<->', cat: 'array', desc: 'Distance operator — KNN ordering with GiST/vector indexes.', ex: 'ORDER BY location <-> point(0,0) LIMIT 10', engines: 'pg (PostGIS, pgvector)' },

  // ---------- cast ----------
  { op: 'CAST(x AS type)', cat: 'cast', desc: 'ANSI type conversion. Raises on failure.', ex: "SELECT CAST('42' AS INTEGER)", engines: 'all' },
  { op: '::', cat: 'cast', desc: 'PostgreSQL cast shorthand.', ex: "SELECT '42'::INTEGER", engines: 'pg, redshift, cockroach, duckdb, clickhouse' },
  { op: 'TRY_CAST / SAFE_CAST', cat: 'cast', desc: 'Cast returning NULL instead of raising on failure.', ex: "SELECT TRY_CAST('abc' AS INT)  -- NULL", engines: 'mssql, snowflake, bigquery (SAFE_CAST), databricks, duckdb' },
  { op: 'CONVERT()', cat: 'cast', desc: 'Vendor conversion with style codes (SQL Server) or charset (MySQL).', ex: 'SELECT CONVERT(VARCHAR, GETDATE(), 120)', engines: 'mssql, mysql' },
  { op: 'CASE WHEN', cat: 'cast', desc: 'Conditional expression. The portable ternary, usable anywhere an expression is.', ex: "CASE WHEN total > 500 THEN 'big' ELSE 'small' END", engines: 'all' },
  { op: 'AT TIME ZONE', cat: 'cast', desc: 'Convert a timestamp between time zones.', ex: "SELECT ts AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin'", engines: 'pg, mssql 2016+, oracle, snowflake' },
  { op: 'OVERLAPS', cat: 'cast', desc: 'Do two time periods overlap?', ex: "SELECT (DATE '2026-01-01', DATE '2026-06-01') OVERLAPS (DATE '2026-03-01', DATE '2026-09-01')", engines: 'pg, oracle, db2' },
  { op: 'DEFAULT', cat: 'cast', desc: 'Use the column default in an INSERT or UPDATE.', ex: 'INSERT INTO t (a, b) VALUES (1, DEFAULT)', engines: 'all' },
];
