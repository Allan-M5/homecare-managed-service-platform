import { Router } from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";
import {
  getAvailableWorkers,
  getWorkerDashboard,
  updateWorkerAvailability,
  updateWorkerCurrentLocation,
  workerHeartbeat
} from "../controllers/workerController.js";

const router = Router();

router.get("/available", protect, authorize(USER_ROLES.ADMIN), getAvailableWorkers);

router.use(protect, authorize(USER_ROLES.WORKER));

router.post("/heartbeat", workerHeartbeat);
router.get("/dashboard", getWorkerDashboard);
router.patch("/availability", updateWorkerAvailability);
router.patch("/location", updateWorkerCurrentLocation);

export default router;
