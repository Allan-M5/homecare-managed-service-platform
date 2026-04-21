import { Router } from "express";
import {
  updateMyClientProfile,
  updateMyWorkerProfile,
  adminOverrideClientProfile,
  adminOverrideWorkerProfile
} from "../controllers/profileManagementController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.use(protect);

router.patch("/client/me", updateMyClientProfile);
router.patch("/worker/me", updateMyWorkerProfile);
router.patch("/admin/client/:userId", adminOverrideClientProfile);
router.patch("/admin/worker/:userId", adminOverrideWorkerProfile);

export default router;
