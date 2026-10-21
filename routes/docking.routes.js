import { Router } from "express";
import { getDocking, postDocking } from "../controllers/docking.controller.js";
const router = Router();
router.get("/", getDocking);
router.post("/", postDocking);
export default router;
