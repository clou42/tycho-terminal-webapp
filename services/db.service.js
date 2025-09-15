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



// ---------------------- MSSQL (Azure SQL) ----------------------
let sql, sqlPool;

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

async function initMssql() {
  const { default: mssql } = await import("mssql");
  sql = mssql;

  const wantMI =
    AUTH_TYPE === "azure-active-directory-default" ||
    AUTH_TYPE === "azure-active-directory-msi-app-service" ||
    // sensible default on App Service with identity turned on:
    (!!process.env.WEBSITE_SITE_NAME && !!process.env.IDENTITY_ENDPOINT && !HAS_SQLSERVER_CS);

  // 1) Managed Identity (recommended)
  if (wantMI) {
    const cfg = {
      ...baseSqlConfig(),
      authentication: {
        // Works with DefaultAzureCredential under the hood via Tedious
        // and supports token refresh transparently.
        type: AUTH_TYPE || "azure-active-directory-default",
      },
    };
    sqlPool = await new sql.ConnectionPool(cfg).connect();
    return;
  }

  // 2) Single connection string (SQL auth)
  if (HAS_SQLSERVER_CS) {
    const cs = process.env.SQLSERVER_CONNECTION_STRING || process.env.AZURE_SQL_CONNECTIONSTRING;
    sqlPool = await new sql.ConnectionPool(cs).connect();
    return;
  }

  // 3) Username/password (discouraged in prod; kept for completeness)
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (user && password) {
    const cfg = { ...baseSqlConfig(), user, password };
    sqlPool = await new sql.ConnectionPool(cfg).connect();
    return;
  }

  throw new Error("No valid MSSQL configuration found.");
}

function paramize(sqlStr, params) {
  let i = 0;
  return {
    text: sqlStr.replace(/\?/g, () => `@p${++i}`),
    names: params.map((_, ix) => `p${ix + 1}`),
  };
}
async function queryAllMssql(q, params = []) {
  const { text, names } = paramize(q, params);
  const req = sqlPool.request();
  params.forEach((v, i) => req.input(names[i], v));
  const res = await req.query(text);
  return res.recordset || [];
}
async function execMssql(q, params = []) {
  const { text, names } = paramize(q, params);
  const req = sqlPool.request();
  params.forEach((v, i) => req.input(names[i], v));
  await req.query(text);
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
// Return rows for a raw SELECT (intentionally unsafe / injectable)
export async function unsafeQueryAll(sql) {
  await ensureReady();
  if (ENGINE === "mssql") {
    const res = await sqlPool.request().query(sql);
    console.log("unsafeQueryAll result using mssql");
    return res.recordset || [];
  }
  // SQLite (dev)
  const res = queryAllSqlite(sql); // no params => still raw/injectable
  console.log("unsafeQueryAll result using sqlite:");
  return res;
}
export async function unsafeExec(q, params = []) {
  await ensureReady();
  console.log("unsafeExec using: " + ENGINE === "mssql" ? "mssql" : "sqlite");
  return ENGINE === "mssql" ? execMssql(q, params) : execSqlite(q);
}
export function dbInfo() {
  return ENGINE === "mssql"
    ? { engine: "mssql", host: process.env.DB_HOST || process.env.AZURE_SQL_SERVER, db: process.env.DB_NAME || process.env.AZURE_SQL_DATABASE, auth: AUTH_TYPE || (HAS_SQLSERVER_CS ? "connection-string" : "mi") }
    : { engine: "sqlite", path: sqliteDb?.filename };
}
