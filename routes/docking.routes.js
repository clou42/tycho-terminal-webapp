import { Router } from "express";
import { getDocking } from "../controllers/docking.controller.js";
const router = Router();
router.get("/", getDocking);
export default router;
