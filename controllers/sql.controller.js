import { ensureSchema, unsafeExec, safeQueryAll, unsafeQueryAll, dbInfo } from "../services/db.service.js";

 export async function listShips(req, res, next) {
   try {
     await ensureSchema();
     const { engine } = dbInfo(); // "sqlite" | "mssql"
     const base = "SELECT name, registry, faction, tonnage FROM ships ORDER BY id DESC";
     const sql  = engine === "mssql"
       ? base + " OFFSET 0 ROWS FETCH NEXT 3 ROWS ONLY" // T-SQL
       : base + " LIMIT 3";                              // SQLite
     const ships = await safeQueryAll(sql);
     res.render("pages/sql", { title: "Ship Register", ships });
   } catch (err) { next(err); }
 }

// ❌ Intentionally vulnerable INSERT — string concatenation of user inputs
export async function insecureInsert(req, res, next) {
  try {
    const { name = "", registry = "", faction = "", tonnage = "" } = req.body;
    const sql = `INSERT INTO ships(name, registry, faction, tonnage) VALUES ('${name}','${registry}','${faction}', ${tonnage || 0});`;
    console.log("unsafeExec with:" + sql);
    const rows = await unsafeExec(sql);
    console.log("unsafeExec result", rows);
    res.redirect("/sql");
  } catch (err) { next(err); }
}

// ❌ Intentionally vulnerable search (WHERE clause concatenation)
export async function insecureSearch(req, res, next) {
  try {
    const { q = "" } = req.query;
    const sql = `SELECT id, name, registry, faction, tonnage FROM ships WHERE name LIKE '%${q}%' OR registry LIKE '%${q}%' ORDER BY id DESC;`;
    console.log("unsafeQueryAll with:" + sql);
    const rows = await unsafeQueryAll(sql);
    console.log("unsafeQueryAll result", rows);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function resetShips(req, res, next) {
  try {
    await ensureSchema(true);
    res.redirect("/sql");
  } catch (err) { next(err); }
}