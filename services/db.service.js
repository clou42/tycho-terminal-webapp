// db.service.js
import path from "path";
import fs from "fs";

function bool(v, dflt) {
  if (v == null) return dflt;
  const s = String(v).trim().toLowerCase();
  return ["1","true","yes","y","on"].includes(s) ? true
       : ["0","false","no","n","off"].includes(s) ? false
       : dflt;
}

// --- Which engine?
const PROVIDER_HINT = (process.env.DB_PROVIDER || process.env.DB_CLIENT || "").toLowerCase();
const AUTH_TYPE = (process.env.DB_AUTH_TYPE || process.env.AZURE_SQL_AUTHENTICATIONTYPE || "").toLowerCase();
const HAS_SQLSERVER_CS =
  !!process.env.SQLSERVER_CONNECTION_STRING || !!process.env.AZURE_SQL_CONNECTIONSTRING;

let ENGINE = "sqlite";
if (PROVIDER_HINT === "mssql" || HAS_SQLSERVER_CS || AUTH_TYPE.startsWith("azure-active-directory")) {
  ENGINE = "mssql";
}

// ---------------------- SQLite (dev) ----------------------
let sqliteDb;
async function initSqlite() {
  const { default: sqlite3 } = await import("sqlite3");
  const sqlite = sqlite3.verbose();
  const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "expanse.db");
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  sqliteDb = new sqlite.Database(DB_PATH);
  await execSqlite(`
    CREATE TABLE IF NOT EXISTS ships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      registry TEXT NOT NULL,
      faction TEXT NOT NULL,
      tonnage INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS docking_jobs (
      id TEXT PRIMARY KEY,
      ship TEXT NOT NULL,
      target_vm TEXT NOT NULL,
      probe_target TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      result TEXT
    );
  `);
}
function execSqlite(sql) {
  return new Promise((resolve, reject) => sqliteDb.exec(sql, e => e ? reject(e) : resolve()));
}
function queryAllSqlite(sql, params = []) {
  return new Promise((resolve, reject) =>
    sqliteDb.all(sql, params, (e, rows) => (e ? reject(e) : resolve(rows)))
  );
}
function runSqlite(sql, params = []) {
  return new Promise((resolve, reject) =>
    sqliteDb.run(sql, params, function (e) { e ? reject(e) : resolve(this.changes); })
  );
}



// ---------------------- MSSQL (Azure SQL) ----------------------
let sql, sqlPool;

// Transient and networky failures worth retrying
const TRANSIENT_CODES = new Set([
  "ESOCKET", "ETIMEOUT", "ELOGIN", "ECONNRESET", "ENOTOPEN", "ECONNCLOSED"
]);
// Backoff settings
const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 30_000;

let nextBackoffMs = MIN_BACKOFF_MS;
let connecting = null;
let unhealthy = false;

function baseSqlConfig() {
  const server = process.env.DB_HOST || process.env.AZURE_SQL_SERVER;
  const database = process.env.DB_NAME || process.env.AZURE_SQL_DATABASE;
  const port = Number(process.env.DB_PORT || process.env.AZURE_SQL_PORT || 1433);
  const encrypt = bool(process.env.DB_ENCRYPT, true);
  const trust = bool(process.env.DB_TRUST_SERVER_CERTIFICATE, false);
  return {
    server,
    port,
    database,
    options: { encrypt, trustServerCertificate: trust },
  };
}

function wantManagedIdentity() {
  const PROVIDER_HINT = (process.env.DB_PROVIDER || process.env.DB_CLIENT || "").toLowerCase();
  const AUTH_TYPE = (process.env.DB_AUTH_TYPE || process.env.AZURE_SQL_AUTHENTICATIONTYPE || "").toLowerCase();
  const HAS_SQLSERVER_CS =
    !!process.env.SQLSERVER_CONNECTION_STRING || !!process.env.AZURE_SQL_CONNECTIONSTRING;

  return (
    PROVIDER_HINT === "mssql" &&
    (
      AUTH_TYPE === "azure-active-directory-default" ||
      AUTH_TYPE === "azure-active-directory-msi-app-service" ||
      (!!process.env.WEBSITE_SITE_NAME && !!process.env.IDENTITY_ENDPOINT && !HAS_SQLSERVER_CS)
    )
  );
}

function buildMssqlConfig() {
  const AUTH_TYPE = (process.env.DB_AUTH_TYPE || process.env.AZURE_SQL_AUTHENTICATIONTYPE || "").toLowerCase();
  const HAS_SQLSERVER_CS =
    !!process.env.SQLSERVER_CONNECTION_STRING || !!process.env.AZURE_SQL_CONNECTIONSTRING;

  if (wantManagedIdentity()) {
    return {
      ...baseSqlConfig(),
      authentication: {
        // Tedious handles token acquisition/refresh via AAD types.
        type: AUTH_TYPE || "azure-active-directory-default",
      },
    };
  }
  if (HAS_SQLSERVER_CS) {
    return process.env.SQLSERVER_CONNECTION_STRING || process.env.AZURE_SQL_CONNECTIONSTRING;
  }
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (user && password) {
    return { ...baseSqlConfig(), user, password };
  }
  throw new Error("No valid MSSQL configuration found.");
}

function installPoolMonitors(pool) {
  pool.on("error", (err) => {
    // Mark unhealthy and trigger reconnect on next query.
    unhealthy = true;
    // Optional: log once
    console.error("[mssql] pool error:", err?.code || err?.name || err?.message);
  });
}

async function connectPool(force = false) {
  if (!force && sqlPool?.connected && !unhealthy) return sqlPool;

  if (connecting) return connecting; // dedupe concurrent callers

  connecting = (async () => {
    // Close old pool if present
    try { if (sqlPool) await sqlPool.close(); } catch { /* ignore */ }

    // Recreate pool
    const cfg = buildMssqlConfig();
    const pool = new sql.ConnectionPool(cfg);
    installPoolMonitors(pool);

    // Exponential backoff until connect succeeds
    for (;;) {
      try {
        await pool.connect();
        sqlPool = pool;
        unhealthy = false;
        nextBackoffMs = MIN_BACKOFF_MS;
        return sqlPool;
      } catch (err) {
        // Back off then try again
        await new Promise(r => setTimeout(r, nextBackoffMs));
        nextBackoffMs = Math.min(nextBackoffMs * 2, MAX_BACKOFF_MS);
      }
    }
  })();

  try {
    const p = await connecting;
    return p;
  } finally {
    connecting = null;
  }
}

function isTransient(err) {
  const code = err?.code || err?.name;
  return TRANSIENT_CODES.has(code) || /ConnectionError|Timeout|Login failed/i.test(String(code || err?.message));
}

async function withSqlRequest(run) {
  // Ensure we have a healthy pool
  await connectPool();

  try {
    return await run(sqlPool.request());
  } catch (err) {
    if (!isTransient(err)) throw err;

    // Force rebuild, then single retry
    await connectPool(true);
    return run(sqlPool.request());
  }
}

async function initMssql() {
  const { default: mssql } = await import("mssql");
  sql = mssql;
  await connectPool();
}

// parameter helper unchanged
function paramize(sqlStr, params) {
  let i = 0;
  return {
    text: sqlStr.replace(/\?/g, () => `@p${++i}`),
    names: params.map((_, ix) => `p${ix + 1}`),
  };
}

async function queryAllMssql(q, params = []) {
  const { text, names } = paramize(q, params);
  return withSqlRequest(async (req) => {
    params.forEach((v, i) => req.input(names[i], v));
    const res = await req.query(text);
    return res.recordset || [];
  });
}

async function execMssql(q, params = []) {
  const { text, names } = paramize(q, params);
  return withSqlRequest(async (req) => {
    params.forEach((v, i) => req.input(names[i], v));
    await req.query(text);
  });
}

// ---------------------- Public API ----------------------
let ready;
async function ensureReady() {
  if (!ready) {
    ready = ENGINE === "mssql" ? initMssql() : initSqlite();
    await ready;
  }
}
export async function ensureSchema() { await ensureReady(); }
export async function safeQueryAll(q, params = []) {
  await ensureReady();
  return ENGINE === "mssql" ? queryAllMssql(q, params) : queryAllSqlite(q, params);
}
export async function safeExec(q, params = []) {
  await ensureReady();
  return ENGINE === "mssql" ? execMssql(q, params) : runSqlite(q, params);
}
// Return rows for a raw SELECT (intentionally unsafe / injectable)
export async function unsafeQueryAll(sqlStr) {
  await ensureReady();
  if (ENGINE === "mssql") {
    return withSqlRequest(async (req) => {
      const res = await req.query(sqlStr);
      console.log("unsafeQueryAll result using mssql");
      return res.recordset || [];
    });
  }
  const res = queryAllSqlite(sqlStr);
  console.log("unsafeQueryAll result using sqlite:");
  return res;
}
export async function unsafeExec(q, params = []) {
  await ensureReady();
  console.log("unsafeExec using:", ENGINE === "mssql" ? "mssql" : "sqlite"); // fixed precedence
  return ENGINE === "mssql" ? execMssql(q, params) : execSqlite(q);
}
export function dbInfo() {
  return ENGINE === "mssql"
    ? { engine: "mssql", host: process.env.DB_HOST || process.env.AZURE_SQL_SERVER, db: process.env.DB_NAME || process.env.AZURE_SQL_DATABASE, auth: (process.env.DB_AUTH_TYPE || process.env.AZURE_SQL_AUTHENTICATIONTYPE || "").toLowerCase() || ((!!process.env.SQLSERVER_CONNECTION_STRING || !!process.env.AZURE_SQL_CONNECTIONSTRING) ? "connection-string" : "mi") }
    : { engine: "sqlite", path: sqliteDb?.filename };
}
