import { Router } from "express";
import { insecureInsert, insecureSearch, listShips, resetShips } from "../controllers/sql.controller.js";

const router = Router();
router.get("/", listShips);
router.post("/insecure-insert", insecureInsert); // vulnerable INSERT
router.get("/insecure-search", insecureSearch); // vulnerable WHERE
router.post("/reset", resetShips); // lab reset helper
export default router;