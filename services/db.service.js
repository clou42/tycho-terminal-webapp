import sqlite3 from "sqlite3";
import path from "path";
import fs from "fs";

sqlite3.verbose();
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data", "expanse.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
export const db = new sqlite3.Database(DB_PATH);

export async function ensureSchema(reset = false) {
  const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (e) => (e ? reject(e) : resolve())));
  if (reset) await exec("DROP TABLE IF EXISTS ships;");
  await exec(`
    CREATE TABLE IF NOT EXISTS ships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      registry TEXT NOT NULL,
      faction TEXT NOT NULL,
      tonnage INTEGER DEFAULT 0
    );
  `);
}

export const safeQueryAll = (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (e, rows) => e ? reject(e) : resolve(rows)));
export const unsafeExec = (sql) => new Promise((resolve, reject) => db.all(sql, (e, rows) => e ? reject(e) : resolve(rows)));