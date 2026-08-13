/**
 * Data type explorer.
 * `map` keys are engine ids; values are the concrete type in that engine
 * ('—' means no native equivalent).
 */

export const categories = [
  { id: 'numeric', label: 'Numeric' },
  { id: 'character', label: 'Character' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'binary', label: 'Binary' },
  { id: 'json', label: 'JSON' },
  { id: 'array', label: 'Array & nested' },
  { id: 'uuid', label: 'UUID' },
  { id: 'spatial', label: 'Spatial' },
  { id: 'specialized', label: 'Specialized' },
];

export const engineOrder = [
  'postgresql', 'mysql', 'sqlite', 'sqlserver', 'oracle',
  'redshift', 'snowflake', 'bigquery', 'duckdb', 'clickhouse',
];

export default [
  /* --------------------------- numeric --------------------------- */
  {
    name: 'SMALLINT', cat: 'numeric', ansi: true,
    desc: '2-byte signed integer, −32,768 to 32,767.',
    notes: 'Rarely worth the saving over INTEGER on row-based engines because of alignment padding; genuinely useful in columnar stores where compression is per-column.',
    map: { postgresql: 'SMALLINT / INT2', mysql: 'SMALLINT', sqlite: 'INTEGER', sqlserver: 'SMALLINT', oracle: 'NUMBER(5)', redshift: 'SMALLINT', snowflake: 'NUMBER(38,0)', bigquery: 'INT64', duckdb: 'SMALLINT', clickhouse: 'Int16' },
  },
  {
    name: 'INTEGER', cat: 'numeric', ansi: true,
    desc: '4-byte signed integer, −2,147,483,648 to 2,147,483,647.',
    notes: 'The default choice for counts and small keys. A surrogate key on a high-volume table should be BIGINT — exhausting a 2.1-billion INT primary key in production is a genuinely bad day.',
    map: { postgresql: 'INTEGER / INT4', mysql: 'INT [UNSIGNED]', sqlite: 'INTEGER', sqlserver: 'INT', oracle: 'NUMBER(10)', redshift: 'INTEGER', snowflake: 'NUMBER(38,0)', bigquery: 'INT64', duckdb: 'INTEGER', clickhouse: 'Int32 / UInt32' },
  },
  {
    name: 'BIGINT', cat: 'numeric', ansi: true,
    desc: '8-byte signed integer, roughly ±9.2 × 10^18.',
    notes: 'Default for surrogate primary keys. Note that JavaScript numbers lose precision above 2^53 — APIs returning BIGINT ids to a browser should serialise them as strings.',
    map: { postgresql: 'BIGINT / INT8', mysql: 'BIGINT [UNSIGNED]', sqlite: 'INTEGER', sqlserver: 'BIGINT', oracle: 'NUMBER(19)', redshift: 'BIGINT', snowflake: 'NUMBER(38,0)', bigquery: 'INT64', duckdb: 'BIGINT', clickhouse: 'Int64 / UInt64' },
  },
  {
    name: 'DECIMAL / NUMERIC', cat: 'numeric', ansi: true,
    desc: 'Exact fixed-point decimal with declared precision and scale: NUMERIC(12,2) holds up to 10 digits before the point and 2 after.',
    notes: 'The only correct type for money. Arithmetic is exact — no binary rounding — at the cost of slower computation than integers or floats.',
    map: { postgresql: 'NUMERIC(p,s) / DECIMAL', mysql: 'DECIMAL(p,s)', sqlite: 'NUMERIC (advisory)', sqlserver: 'DECIMAL(p,s) / NUMERIC', oracle: 'NUMBER(p,s)', redshift: 'DECIMAL(p,s)', snowflake: 'NUMBER(p,s)', bigquery: 'NUMERIC / BIGNUMERIC', duckdb: 'DECIMAL(p,s)', clickhouse: 'Decimal(P,S)' },
  },
  {
    name: 'REAL / DOUBLE PRECISION', cat: 'numeric', ansi: true,
    desc: '4- and 8-byte IEEE 754 binary floating point.',
    notes: 'Never use for money. 0.1 + 0.2 <> 0.3, sums are not associative (so parallel plans give different answers), and equality comparison is unreliable. Correct for measurements, ratios and scientific data.',
    map: { postgresql: 'REAL / DOUBLE PRECISION', mysql: 'FLOAT / DOUBLE', sqlite: 'REAL', sqlserver: 'REAL / FLOAT', oracle: 'BINARY_FLOAT / BINARY_DOUBLE', redshift: 'REAL / DOUBLE PRECISION', snowflake: 'FLOAT', bigquery: 'FLOAT64', duckdb: 'FLOAT / DOUBLE', clickhouse: 'Float32 / Float64' },
  },
  {
    name: 'SERIAL / IDENTITY', cat: 'numeric', ansi: false,
    desc: 'Auto-incrementing integer key. The ANSI form is GENERATED ALWAYS AS IDENTITY.',
    notes: 'PostgreSQL SERIAL is not a type — it expands to an integer column plus a sequence plus a default. Prefer the standard identity syntax in new schemas.',
    map: { postgresql: 'BIGINT GENERATED ALWAYS AS IDENTITY / BIGSERIAL', mysql: 'BIGINT AUTO_INCREMENT', sqlite: 'INTEGER PRIMARY KEY', sqlserver: 'BIGINT IDENTITY(1,1)', oracle: 'GENERATED ALWAYS AS IDENTITY', redshift: 'BIGINT IDENTITY(1,1)', snowflake: 'NUMBER AUTOINCREMENT', bigquery: '— (generate in ELT)', duckdb: 'BIGINT DEFAULT nextval(…)', clickhouse: '— (use generateUUIDv4)' },
  },

  /* -------------------------- character -------------------------- */
  {
    name: 'CHAR(n)', cat: 'character', ansi: true,
    desc: 'Fixed-length, blank-padded character string.',
    notes: 'Padding is significant in comparisons in some engines and stripped in others. Use only for genuinely fixed-width codes (ISO country codes, currency codes); otherwise VARCHAR.',
    map: { postgresql: 'CHAR(n) / BPCHAR', mysql: 'CHAR(n)', sqlite: 'TEXT', sqlserver: 'CHAR(n) / NCHAR(n)', oracle: 'CHAR(n)', redshift: 'CHAR(n)', snowflake: 'VARCHAR(n)', bigquery: 'STRING', duckdb: 'VARCHAR', clickhouse: 'FixedString(n)' },
  },
  {
    name: 'VARCHAR(n)', cat: 'character', ansi: true,
    desc: 'Variable-length string with a maximum length.',
    notes: 'In PostgreSQL, VARCHAR(n) and TEXT have identical performance — the length is a constraint, not a storage decision. In MySQL and SQL Server the declared length affects index key size and temp-table allocation, so it does matter.',
    map: { postgresql: 'VARCHAR(n) / TEXT', mysql: 'VARCHAR(n)', sqlite: 'TEXT', sqlserver: 'VARCHAR(n) / NVARCHAR(n)', oracle: 'VARCHAR2(n)', redshift: 'VARCHAR(n) — max 65535 bytes', snowflake: 'VARCHAR(n) — max 16 MB', bigquery: 'STRING', duckdb: 'VARCHAR', clickhouse: 'String' },
  },
  {
    name: 'TEXT / CLOB', cat: 'character', ansi: true,
    desc: 'Unbounded (or very large) character data.',
    notes: 'PostgreSQL TEXT is a first-class type with no penalty. MySQL TEXT is stored off-page and cannot be fully indexed (only a prefix). SQL Server TEXT is deprecated — use NVARCHAR(MAX).',
    map: { postgresql: 'TEXT', mysql: 'TEXT / MEDIUMTEXT / LONGTEXT', sqlite: 'TEXT', sqlserver: 'NVARCHAR(MAX)', oracle: 'CLOB / NCLOB', redshift: 'VARCHAR(65535)', snowflake: 'VARCHAR', bigquery: 'STRING', duckdb: 'VARCHAR', clickhouse: 'String' },
  },

  /* --------------------------- boolean --------------------------- */
  {
    name: 'BOOLEAN', cat: 'boolean', ansi: true,
    desc: 'TRUE, FALSE or NULL.',
    notes: 'SQL Server and Oracle (before 23ai) have no boolean SQL type — the convention is BIT or NUMBER(1) with a CHECK constraint. MySQL BOOLEAN is an alias for TINYINT(1), so it accepts any integer.',
    map: { postgresql: 'BOOLEAN', mysql: 'BOOLEAN → TINYINT(1)', sqlite: 'INTEGER 0/1', sqlserver: 'BIT', oracle: 'BOOLEAN (23ai) / NUMBER(1)', redshift: 'BOOLEAN', snowflake: 'BOOLEAN', bigquery: 'BOOL', duckdb: 'BOOLEAN', clickhouse: 'Bool / UInt8' },
  },

  /* -------------------------- datetime --------------------------- */
  {
    name: 'DATE', cat: 'datetime', ansi: true,
    desc: 'Calendar date with no time component.',
    notes: 'Oracle DATE is the exception — it always carries a time component to second precision, which surprises everyone porting to or from Oracle.',
    map: { postgresql: 'DATE', mysql: 'DATE', sqlite: 'TEXT / NUMERIC (no native type)', sqlserver: 'DATE', oracle: 'DATE (includes time!)', redshift: 'DATE', snowflake: 'DATE', bigquery: 'DATE', duckdb: 'DATE', clickhouse: 'Date / Date32' },
  },
  {
    name: 'TIMESTAMP', cat: 'datetime', ansi: true,
    desc: 'Date and time without time zone — a wall-clock reading with no offset.',
    notes: 'Ambiguous by design: the same value means different instants in different zones. Use only when you genuinely mean local wall time (a shop opening at 09:00 local).',
    map: { postgresql: 'TIMESTAMP', mysql: 'DATETIME', sqlite: 'TEXT ISO-8601', sqlserver: 'DATETIME2(n)', oracle: 'TIMESTAMP', redshift: 'TIMESTAMP', snowflake: 'TIMESTAMP_NTZ', bigquery: 'DATETIME', duckdb: 'TIMESTAMP', clickhouse: 'DateTime64' },
  },
  {
    name: 'TIMESTAMP WITH TIME ZONE', cat: 'datetime', ansi: true,
    desc: 'An absolute point in time. PostgreSQL stores UTC and converts on input/output using the session TimeZone.',
    notes: 'The right default for "when did this happen". PostgreSQL timestamptz does NOT store the original zone — only the instant. MySQL TIMESTAMP is UTC-normalised but limited to 1970–2038; DATETIME has a wider range but no zone handling.',
    map: { postgresql: 'TIMESTAMPTZ', mysql: 'TIMESTAMP (1970–2038, UTC)', sqlite: 'TEXT ISO-8601 with offset', sqlserver: 'DATETIMEOFFSET', oracle: 'TIMESTAMP WITH TIME ZONE', redshift: 'TIMESTAMPTZ', snowflake: 'TIMESTAMP_TZ / TIMESTAMP_LTZ', bigquery: 'TIMESTAMP', duckdb: 'TIMESTAMPTZ', clickhouse: "DateTime('UTC')" },
  },
  {
    name: 'TIME', cat: 'datetime', ansi: true,
    desc: 'Time of day without a date.',
    notes: 'MySQL TIME ranges from −838:59:59 to 838:59:59 because it doubles as a duration type.',
    map: { postgresql: 'TIME / TIMETZ', mysql: 'TIME', sqlite: 'TEXT', sqlserver: 'TIME(n)', oracle: '— (use INTERVAL)', redshift: 'TIME', snowflake: 'TIME', bigquery: 'TIME', duckdb: 'TIME', clickhouse: '—' },
  },
  {
    name: 'INTERVAL', cat: 'datetime', ansi: true,
    desc: 'A span of time — years/months, or days/hours/minutes/seconds.',
    notes: 'Month arithmetic is not exact: an interval of 1 month added to 31 January clamps to the end of February. PostgreSQL keeps months, days and microseconds as separate fields for exactly this reason.',
    map: { postgresql: 'INTERVAL', mysql: '— (INTERVAL is an expression keyword only)', sqlite: '—', sqlserver: '—', oracle: 'INTERVAL YEAR TO MONTH / DAY TO SECOND', redshift: 'INTERVAL', snowflake: '— (expression only)', bigquery: 'INTERVAL', duckdb: 'INTERVAL', clickhouse: 'Interval' },
  },

  /* --------------------------- binary ---------------------------- */
  {
    name: 'BINARY / VARBINARY / BLOB', cat: 'binary', ansi: true,
    desc: 'Raw byte strings.',
    notes: 'Storing large files in the database costs backup time, replication bandwidth and buffer cache. Object storage plus a URL column is usually the better design above a few hundred kilobytes.',
    map: { postgresql: 'BYTEA', mysql: 'BINARY / VARBINARY / BLOB', sqlite: 'BLOB', sqlserver: 'VARBINARY(MAX)', oracle: 'RAW / BLOB', redshift: 'VARBYTE', snowflake: 'BINARY', bigquery: 'BYTES', duckdb: 'BLOB', clickhouse: 'String' },
  },

  /* ---------------------------- json ----------------------------- */
  {
    name: 'JSON', cat: 'json', ansi: true,
    desc: 'A JSON document stored as text, revalidated on access.',
    notes: 'PostgreSQL json preserves whitespace, key order and duplicate keys exactly; jsonb does not, but is indexable and far faster to query. Prefer jsonb unless byte-exact reproduction matters.',
    map: { postgresql: 'JSON', mysql: 'JSON (binary internally)', sqlite: 'TEXT + JSON1 functions', sqlserver: 'NVARCHAR + ISJSON (native json in 2025)', oracle: 'JSON (21c+)', redshift: 'SUPER', snowflake: 'VARIANT', bigquery: 'JSON', duckdb: 'JSON', clickhouse: 'JSON (25.x)' },
  },
  {
    name: 'JSONB', cat: 'json', ansi: false,
    desc: 'Decomposed binary JSON supporting containment operators and GIN indexing.',
    notes: 'PostgreSQL-specific name; the equivalent capability elsewhere is MySQL JSON, Snowflake VARIANT, Redshift SUPER and BigQuery JSON.',
    map: { postgresql: 'JSONB', mysql: 'JSON', sqlite: 'JSONB (3.45+, internal)', sqlserver: 'json (2025)', oracle: 'JSON (OSON binary)', redshift: 'SUPER', snowflake: 'VARIANT', bigquery: 'JSON', duckdb: 'JSON', clickhouse: 'JSON' },
  },

  /* ---------------------------- array ---------------------------- */
  {
    name: 'ARRAY', cat: 'array', ansi: true,
    desc: 'An ordered collection of same-typed values in one column.',
    notes: 'Indexing is 1-based in PostgreSQL, Oracle and Trino; BigQuery makes you choose with OFFSET (0-based) or ORDINAL (1-based). Use for small read-whole lists; use a child table for anything you filter or join on.',
    map: { postgresql: 'type[]', mysql: '— (use JSON)', sqlite: '— (use JSON)', sqlserver: '— (use JSON)', oracle: 'VARRAY / nested table', redshift: 'SUPER', snowflake: 'ARRAY', bigquery: 'ARRAY<T>', duckdb: 'T[]', clickhouse: 'Array(T)' },
  },
  {
    name: 'STRUCT / composite', cat: 'array', ansi: true,
    desc: 'A named tuple of typed fields stored in one column.',
    notes: 'Combined with ARRAY, this is how warehouses model one-to-many relationships without joins — the standard BigQuery event-schema shape.',
    map: { postgresql: 'CREATE TYPE … AS (…)', mysql: '—', sqlite: '—', sqlserver: '—', oracle: 'Object type', redshift: 'SUPER', snowflake: 'OBJECT', bigquery: 'STRUCT<…>', duckdb: 'STRUCT(…)', clickhouse: 'Tuple / Nested' },
  },

  /* ---------------------------- uuid ----------------------------- */
  {
    name: 'UUID', cat: 'uuid', ansi: false,
    desc: '128-bit identifier, usually rendered as 36 hex characters with dashes.',
    notes: 'Where there is no native type, BINARY(16) halves the storage of CHAR(36) and indexes better — at the cost of readability in ad-hoc queries. Prefer time-ordered UUIDv7/ULID over random v4 for any column that will be a clustered key.',
    map: { postgresql: 'UUID', mysql: 'CHAR(36) or BINARY(16)', sqlite: 'TEXT or BLOB', sqlserver: 'UNIQUEIDENTIFIER', oracle: 'RAW(16)', redshift: 'VARCHAR(36)', snowflake: 'VARCHAR(36)', bigquery: 'STRING', duckdb: 'UUID', clickhouse: 'UUID' },
  },

  /* --------------------------- spatial --------------------------- */
  {
    name: 'GEOMETRY', cat: 'spatial', ansi: true,
    desc: 'Planar geometry — points, lines, polygons in a Cartesian plane with an SRID.',
    notes: 'Distance is measured in the SRID units. On SRID 4326 that means degrees, which is not a usable distance — use GEOGRAPHY, or project to a metric SRID first.',
    map: { postgresql: 'GEOMETRY (PostGIS)', mysql: 'GEOMETRY', sqlite: 'SpatiaLite GEOMETRY', sqlserver: 'geometry', oracle: 'SDO_GEOMETRY', redshift: 'GEOMETRY', snowflake: 'GEOMETRY', bigquery: '— (GEOGRAPHY only)', duckdb: 'GEOMETRY (spatial ext)', clickhouse: 'Point / Polygon' },
  },
  {
    name: 'GEOGRAPHY', cat: 'spatial', ansi: false,
    desc: 'Geodetic geometry on a spheroid; distances come back in metres.',
    notes: 'The right type for real-world lat/lon. Slightly slower than planar geometry, and some operations are unavailable, but the results are correct without projection.',
    map: { postgresql: 'GEOGRAPHY (PostGIS)', mysql: '— (SRID-aware GEOMETRY)', sqlite: '—', sqlserver: 'geography', oracle: 'SDO_GEOMETRY (geodetic)', redshift: 'GEOGRAPHY', snowflake: 'GEOGRAPHY', bigquery: 'GEOGRAPHY', duckdb: '— (via spatial ext)', clickhouse: '—' },
  },

  /* ------------------------- specialized ------------------------- */
  {
    name: 'ENUM', cat: 'specialized', ansi: false,
    desc: 'A column restricted to a fixed list of labels.',
    notes: 'PostgreSQL enums sort in declaration order and can only have values appended (removal requires a type rebuild). MySQL enums are stored as integers, and reordering the list silently changes the meaning of existing data. A lookup table plus a foreign key is more flexible than either.',
    map: { postgresql: 'CREATE TYPE … AS ENUM', mysql: "ENUM('a','b')", sqlite: 'TEXT + CHECK', sqlserver: '— (use CHECK)', oracle: '— (use CHECK)', redshift: '— (use CHECK)', snowflake: '— (use CHECK)', bigquery: '— (use STRING)', duckdb: 'ENUM', clickhouse: 'Enum8 / Enum16' },
  },
  {
    name: 'INET / CIDR / MACADDR', cat: 'specialized', ansi: false,
    desc: 'Network address types with subnet-aware operators.',
    notes: 'PostgreSQL validates the address, stores it compactly, and supports containment operators (<<=) with GiST indexing — far better than a VARCHAR.',
    map: { postgresql: 'INET / CIDR / MACADDR', mysql: '— (INT UNSIGNED + INET_ATON)', sqlite: '—', sqlserver: '—', oracle: '—', redshift: '—', snowflake: '—', bigquery: '— (NET.* functions)', duckdb: 'INET', clickhouse: 'IPv4 / IPv6' },
  },
  {
    name: 'RANGE types', cat: 'specialized', ansi: false,
    desc: 'A range of values with inclusive/exclusive bounds: int4range, tstzrange, daterange.',
    notes: 'Combined with an EXCLUDE constraint this enforces "no overlapping bookings" declaratively — something almost no other engine can express without application logic.',
    map: { postgresql: 'INT4RANGE / TSTZRANGE / DATERANGE', mysql: '—', sqlite: '—', sqlserver: '—', oracle: '—', redshift: '—', snowflake: '—', bigquery: 'RANGE<T>', duckdb: '—', clickhouse: '—' },
  },
  {
    name: 'XML', cat: 'specialized', ansi: true,
    desc: 'XML documents with XPath/XQuery support.',
    notes: 'Largely legacy; JSON has replaced it in new systems. SQL Server\'s XML support (typed columns, XML indexes, .nodes()/.value()) remains the most complete.',
    map: { postgresql: 'XML', mysql: '— (ExtractValue on text)', sqlite: '—', sqlserver: 'XML (with XML indexes)', oracle: 'XMLTYPE', redshift: '—', snowflake: '— (parse_xml → VARIANT)', bigquery: '—', duckdb: '—', clickhouse: '—' },
  },
  {
    name: 'MONEY', cat: 'specialized', ansi: false,
    desc: 'A currency type with fixed fractional precision.',
    notes: 'Avoid it. PostgreSQL money depends on the session lc_monetary setting and carries no currency code; SQL Server money has only 4 decimal places and rounds badly in intermediate calculations. Use NUMERIC(19,4) plus a separate currency column.',
    map: { postgresql: 'MONEY (avoid)', mysql: '— (use DECIMAL)', sqlite: '—', sqlserver: 'MONEY / SMALLMONEY (avoid)', oracle: '— (use NUMBER)', redshift: '—', snowflake: '—', bigquery: '— (use NUMERIC)', duckdb: '—', clickhouse: '—' },
  },
  {
    name: 'VECTOR', cat: 'specialized', ansi: false,
    desc: 'Fixed-dimension float vector for similarity search over embeddings.',
    notes: 'Nearest-neighbour search needs an approximate index (HNSW or IVFFlat) to be fast; without one, every query scans every row.',
    map: { postgresql: 'VECTOR (pgvector)', mysql: 'VECTOR (9.0+)', sqlite: '— (sqlite-vec extension)', sqlserver: 'VECTOR (2025)', oracle: 'VECTOR (23ai)', redshift: '—', snowflake: 'VECTOR', bigquery: 'ARRAY<FLOAT64> + VECTOR_SEARCH', duckdb: 'FLOAT[n] + VSS ext', clickhouse: 'Array(Float32)' },
  },
];
