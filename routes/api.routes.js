import { Router } from "express";
import { proxyFetch, proxyFetchForm, crewLookup } from "../controllers/api.controller.js";

const router = Router();

// existing
router.get("/proxy", proxyFetch);    // returns raw text/plain (useful for API tests)

// new — SSRF via form POST, renders an HTML page with results
router.post("/proxy", proxyFetchForm);

router.get("/crew", crewLookup);
export default router;
