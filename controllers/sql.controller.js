import { ensureSchema, unsafeExec, safeQueryAll } from "../services/db.service.js";

export async function listShips(req, res, next) {
  try {
    await ensureSchema();
    const ships = await safeQueryAll("SELECT id, name, registry, faction, tonnage FROM ships ORDER BY id DESC");
    res.render("pages/sql", { title: "Ship Register (Vulnerable)", ships });
  } catch (err) { next(err); }
}

// ❌ Intentionally vulnerable INSERT — string concatenation of user inputs
export async function insecureInsert(req, res, next) {
  try {
    const { name = "", registry = "", faction = "", tonnage = "" } = req.body;
    const sql = `INSERT INTO ships(name, registry, faction, tonnage) VALUES ('${name}','${registry}','${faction}', ${tonnage || 0});`;
    await unsafeExec(sql);
    res.redirect("/sql");
  } catch (err) { next(err); }
}

// ❌ Intentionally vulnerable search (WHERE clause concatenation)
export async function insecureSearch(req, res, next) {
  try {
    const { q = "" } = req.query;
    const sql = `SELECT id, name, registry, faction, tonnage FROM ships WHERE name LIKE '%${q}%' OR registry LIKE '%${q}%' ORDER BY id DESC;`;
    const rows = await unsafeExec(sql);
    res.json(rows);
  } catch (err) { next(err); }
}

export async function resetShips(req, res, next) {
  try {
    await ensureSchema(true);
    res.redirect("/sql");
  } catch (err) { next(err); }
}