import { Router } from "express";
import homeRoutes from "./home.routes.js";
import apiRoutes from "./api.routes.js";
import sqlRoutes from "./sql.routes.js";
import dockingRoutes from "./docking.routes.js";
import servicesRoutes from "./services.routes.js";

const router = Router();
router.use("/", homeRoutes);
router.use("/api", apiRoutes);
router.use("/sql", sqlRoutes);
router.use("/docking", dockingRoutes);
router.use("/services", servicesRoutes);
export default router;
