import { Router } from "express";
import { getServices } from "../controllers/services.controller.js";
const router = Router();
router.get("/", getServices);
export default router;
