import { adminResetWorkerPassword, adminSuspendClientAccount, adminResetClientPassword } from "../controllers/profileManagementController.js";
import { Router } from "express";
import {
  listAdminAccounts,
  createAdminOperator,
  resetAdminOperatorPassword,
  deactivateAdminOperator,
  reactivateAdminOperator
} from "../controllers/adminAccountController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.use(protect, authorize(USER_ROLES.ADMIN));

router.get("/", listAdminAccounts);
router.post("/", createAdminOperator);
router.patch("/:id/reset-password", resetAdminOperatorPassword);
router.patch("/:id/deactivate", deactivateAdminOperator);
router.patch("/:id/reactivate", reactivateAdminOperator);

router.post("/reset-worker-password/:workerId", adminResetWorkerPassword);
router.post("/suspend-client/:clientId", adminSuspendClientAccount);
router.post("/reset-client-password/:clientId", adminResetClientPassword);

export default router;

