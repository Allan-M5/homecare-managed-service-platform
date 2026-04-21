import { Router } from "express";
import {
  listWorkerApplications,
  reviewWorkerApplication
} from "../controllers/adminWorkerApplicationController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.use(protect, authorize(USER_ROLES.ADMIN));

router.get("/", listWorkerApplications);
router.patch("/:id/review", reviewWorkerApplication);

export default router;