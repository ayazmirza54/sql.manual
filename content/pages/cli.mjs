export default {
  slug: 'cli',
  path: '/cli/',
  title: 'Database CLI reference',
  category: 'CLI',
  difficulty: 'intermediate',
  standard: 'Vendor-specific',
  summary: 'psql, mysql, sqlite3, sqlcmd, sqlplus, bq, snowsql, duckdb and clickhouse-client — connection flags, meta-commands and the flags that actually matter.',
  keywords: 'psql mysql sqlite3 sqlcmd sqlplus bq snowsql duckdb clickhouse-client cli connection string meta command backslash dot command',
  body: `
Every engine ships a terminal client, and each has its own dialect of flags and meta-commands. This page covers the ones you will use daily.

## psql — PostgreSQL

~~~bash title="Connecting"
psql -h localhost -p 5432 -U postgres -d app
psql "postgresql://user:pass@host:5432/app?sslmode=require"
psql "host=localhost dbname=app user=postgres sslmode=require"

# environment variables, so credentials stay out of shell history
export PGHOST=localhost PGUSER=postgres PGDATABASE=app PGPASSWORD=…
psql
~~~

| Flag | Meaning |
| --- | --- |
| \`-h host\` | Server host, or a socket directory |
| \`-p port\` | Port (default 5432) |
| \`-U user\` | Role to connect as |
| \`-d dbname\` | Database name |
| \`-c "SQL"\` | Run one statement and exit |
| \`-f file.sql\` | Run a script file |
| \`-A -t\` | Unaligned output, no headers — for piping to other tools |
| \`-F ','\` | Field separator (with \`-A\`) |
| \`-v ON_ERROR_STOP=1\` | **Abort a script on the first error** — essential in migrations |
| \`-1\` / \`--single-transaction\` | Wrap the whole script in one transaction |
| \`-E\` | Echo the SQL that meta-commands run — a great way to learn the catalog |
| \`-X\` | Ignore \`~/.psqlrc\` (use in scripts for reproducibility) |

~~~text title="Meta-commands"
\\l                 list databases              \\dt              list tables
\\c dbname          connect to another db       \\d table         describe a table
\\dn                list schemas                \\d+ table        describe with sizes and comments
\\du                list roles                  \\di              list indexes
\\dv                list views                  \\df              list functions
\\dp                show privileges             \\sf func         show a function's source
\\x                 toggle expanded output      \\timing          toggle query timing
\\e                 edit the query in $EDITOR   \\watch 5         re-run every 5 seconds
\\i file.sql        run a script                \\copy t FROM 'f.csv' CSV HEADER
\\o out.txt         send output to a file       \\! command       run a shell command
\\set VAR value     set a variable              \\q               quit
\\?                 meta-command help           \\h SELECT        SQL syntax help
~~~

~~~bash title="A ~/.psqlrc worth having"
\\set QUIET 1
\\timing on
\\x auto                                    -- expanded output only when rows are wide
\\set ON_ERROR_ROLLBACK interactive
\\set HISTFILE ~/.psql_history-:DBNAME
\\set PROMPT1 '%[%033[1;32m%]%n@%M:%>/%/%[%033[0m%]%R%# '
\\pset null '¤'                             -- make NULLs visible
\\set QUIET 0
~~~

::: tip Two flags that prevent most migration accidents
\`-v ON_ERROR_STOP=1\` makes psql exit non-zero on the first error instead of ploughing on. \`--single-transaction\` makes the whole script atomic. Together they turn a half-applied migration into a clean rollback.
:::

## mysql — MySQL / MariaDB

~~~bash title="Connecting"
mysql -h 127.0.0.1 -P 3306 -u root -p app
mysql --defaults-file=~/.my.cnf app        # credentials from a file, not the CLI
mysql -e "SELECT COUNT(*) FROM orders" app
~~~

| Flag | Meaning |
| --- | --- |
| \`-h host -P port\` | Note the **uppercase** \`-P\` for port |
| \`-u user -p\` | User; \`-p\` prompts (never put the password after it in a shared shell) |
| \`-e "SQL"\` | Execute and exit |
| \`-B\` / \`--batch\` | Tab-separated, unquoted output for piping |
| \`--table\` | Force table formatting even when not on a TTY |
| \`--vertical\` / \`\\G\` | One column per line |
| \`--safe-updates\` | Refuse UPDATE/DELETE without a key in WHERE |
| \`--ssl-mode=REQUIRED\` | Enforce TLS |

~~~text title="In-session commands"
SHOW DATABASES;              USE app;
SHOW TABLES;                 DESCRIBE orders;   -- or: EXPLAIN orders
SHOW CREATE TABLE orders\\G   SHOW INDEX FROM orders;
SHOW FULL PROCESSLIST;       SHOW ENGINE INNODB STATUS\\G
SHOW VARIABLES LIKE '%timeout%';   SHOW STATUS LIKE 'Threads%';
source script.sql            system ls          -- run a shell command
\\G                           -- end a statement with \\G for vertical output
~~~

::: warn 127.0.0.1 and localhost are not the same to the mysql client
\`localhost\` uses a Unix socket; \`127.0.0.1\` uses TCP. They can resolve to different accounts in the \`mysql.user\` table, and one may work while the other is refused.
:::

## sqlite3 — SQLite

~~~bash title="Opening"
sqlite3 app.db                    # opens (and creates if absent)
sqlite3 :memory:                  # in-memory database
sqlite3 app.db "SELECT COUNT(*) FROM orders;"
sqlite3 -csv -header app.db "SELECT * FROM orders" > orders.csv
~~~

~~~text title="Dot commands"
.tables                list tables            .schema orders     show DDL
.databases             attached databases     .indexes orders    list indexes
.mode box|csv|json|table|markdown             .headers on
.import data.csv t     import a CSV           .once out.txt      next result to a file
.output file.txt       redirect output        .read script.sql   run a script
.dump                  SQL dump of everything .backup backup.db  safe online backup
.timer on              show query timings     .expert            index suggestions
.eqp on                auto EXPLAIN QUERY PLAN  .quit
~~~

~~~sql title="PRAGMAs that matter" engine="sqlite"
PRAGMA foreign_keys = ON;        -- OFF by default, and per connection!
PRAGMA journal_mode = WAL;       -- concurrent readers with one writer
PRAGMA synchronous = NORMAL;     -- safe with WAL, much faster than FULL
PRAGMA busy_timeout = 5000;      -- wait instead of failing with SQLITE_BUSY
PRAGMA integrity_check;
PRAGMA optimize;                 -- run before closing a long-lived connection
~~~

## sqlcmd — SQL Server

~~~bash title="Connecting"
sqlcmd -S localhost,1433 -U sa -P 'password' -d app -C   # -C trusts the server cert
sqlcmd -S localhost -E -d app                            # -E = Windows integrated auth
sqlcmd -S localhost -U sa -P '…' -Q "SELECT @@VERSION"   # -Q runs and exits, -q stays
sqlcmd -S localhost -U sa -P '…' -i script.sql -b        # -b = exit code on error
~~~

| Flag | Meaning |
| --- | --- |
| \`-S server[,port]\` | Comma before the port, not a colon |
| \`-d db\` | Database |
| \`-E\` | Trusted (integrated) connection |
| \`-Q "SQL"\` / \`-q "SQL"\` | Execute and exit / execute and stay |
| \`-i in.sql -o out.txt\` | Input and output files |
| \`-b\` | Return a non-zero exit code on error |
| \`-s "," -W -h -1\` | CSV-ish output: separator, trim, no header rule |

~~~text title="In-session"
GO                     -- batch separator; sqlcmd sends everything above it
:setvar name value     -- define a variable
:r other.sql           -- include a file
EXEC sp_help 'orders'; EXEC sp_helpindex 'orders'; EXEC sp_who2;
SET STATISTICS IO, TIME ON;
:exit
~~~

## sqlplus — Oracle

~~~bash title="Connecting"
sqlplus user/password@//host:1521/servicename
sqlplus / as sysdba
sqlplus -S user/pass@db @script.sql        # -S silent, @ runs a script
~~~

~~~text title="Formatting and commands"
SET PAGESIZE 100 LINESIZE 200 FEEDBACK OFF HEADING ON
SET SERVEROUTPUT ON             -- so DBMS_OUTPUT.PUT_LINE appears
COLUMN name FORMAT A30
DESC orders                     -- describe
SHOW USER / SHOW PARAMETER      -- session info
SPOOL out.txt … SPOOL OFF       -- capture output
/                               -- re-run the last statement (and end PL/SQL blocks)
EXIT
~~~

::: warn A trailing slash is not decoration in SQL*Plus
A semicolon ends a SQL statement; a lone \`/\` on its own line executes the buffer and is **required** to terminate a PL/SQL block. Scripts fail silently without it.
:::

## Cloud and analytical clients

~~~bash title="bq — BigQuery"
bq query --use_legacy_sql=false 'SELECT COUNT(*) FROM \\\`project.dataset.table\\\`'
bq query --dry_run --use_legacy_sql=false 'SELECT …'   # bytes that WOULD be scanned — check cost first
bq ls project:dataset
bq show --schema --format=prettyjson project:dataset.table
bq load --source_format=CSV --autodetect dataset.table gs://bucket/file.csv
bq extract dataset.table gs://bucket/export-*.csv
~~~

~~~bash title="snowsql — Snowflake"
snowsql -a account.region -u user -d db -s schema -w warehouse -r role
snowsql -q "SELECT CURRENT_VERSION()"
snowsql -f script.sql -o output_format=csv
# in session: !set, !source, !exit, !help
~~~

~~~bash title="duckdb"
duckdb                                     # in-memory
duckdb analytics.duckdb                    # persistent file
duckdb -c "SELECT * FROM read_csv_auto('data.csv') LIMIT 5"
duckdb -c "SELECT * FROM 'events/*.parquet' WHERE ts > '2026-01-01'"
duckdb -c "ATTACH 'postgres://user@host/db' AS pg (TYPE postgres); SELECT * FROM pg.orders LIMIT 5"
# dot commands mirror sqlite3: .tables .schema .mode .timer
~~~

~~~bash title="clickhouse-client"
clickhouse-client --host localhost --user default --password
clickhouse-client -q "SELECT count() FROM events" --format PrettyCompact
clickhouse-client -q "SELECT * FROM events LIMIT 10" --format JSONEachRow
clickhouse-local -q "SELECT * FROM file('data.csv', CSV)"   # no server needed
~~~

~~~bash title="psql against Redshift"
psql -h cluster.abc123.eu-west-1.redshift.amazonaws.com -p 5439 -U admin -d dev
aws redshift-data execute-statement --cluster-identifier c --database dev --sql "SELECT 1"
~~~

~~~bash title="Db2 and CockroachDB"
db2 connect to sample user db2inst1 using password
db2 "SELECT * FROM syscat.tables FETCH FIRST 5 ROWS ONLY"
cockroach sql --insecure --host=localhost:26257
~~~

## Cross-engine habits worth forming

::: danger Never put a password in the command line
It lands in shell history, in \`ps\` output visible to every user on the machine, and in process accounting logs. Use \`~/.pgpass\`, \`~/.my.cnf\` (mode 600), environment variables, a secrets manager, or an interactive prompt.
:::

~~~bash title="~/.pgpass — mode 0600, one line per target"
# hostname:port:database:username:password
localhost:5432:app:postgres:secret
*:5432:*:readonly:othersecret
~~~

~~~bash title="~/.my.cnf"
[client]
user = app
password = secret
host = 127.0.0.1
~~~

| Task | psql | mysql | sqlite3 | sqlcmd |
| --- | --- | --- | --- | --- |
| List tables | \`\\dt\` | \`SHOW TABLES;\` | \`.tables\` | \`SELECT name FROM sys.tables\` |
| Describe | \`\\d t\` | \`DESCRIBE t;\` | \`.schema t\` | \`EXEC sp_help 't'\` |
| Run a file | \`\\i f.sql\` | \`source f.sql\` | \`.read f.sql\` | \`:r f.sql\` |
| CSV out | \`\\copy … TO 'f' CSV\` | \`-B\` + redirect | \`.mode csv\` | \`-s"," -W\` |
| Timing | \`\\timing\` | on by default | \`.timer on\` | \`SET STATISTICS TIME ON\` |
| Quit | \`\\q\` | \`\\q\` / \`exit\` | \`.quit\` | \`:exit\` |
`,
  related: [
    { label: 'Administration', href: '/admin/' },
    { label: 'Cheat sheets', href: '/cheatsheets/' },
    { label: 'Database explorer', href: '/databases/' },
    { label: 'Commands', href: '/commands/' },
  ],
};
