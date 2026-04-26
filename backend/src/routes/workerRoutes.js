import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  getWorkerDashboard,
  updateWorkerAvailability,
  updateWorkerCurrentLocation,
  getAvailableWorkers
} from "../controllers/workerController.js";

const router = Router();

router.post("/heartbeat", protect, workerHeartbeat);

router.get("/available", protect, authorize(USER_ROLES.ADMIN), getAvailableWorkers);

router.use(protect, authorize(USER_ROLES.WORKER));

router.post("/heartbeat", protect, workerHeartbeat);

router.get("/dashboard", getWorkerDashboard);
router.patch("/availability", updateWorkerAvailability);
router.patch("/location", updateWorkerCurrentLocation);

export default router;