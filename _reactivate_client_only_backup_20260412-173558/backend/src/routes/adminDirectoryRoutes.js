import { Router } from "express";
import {
  listClientDirectory,
  listWorkerDirectory,
  suspendWorkerAccount,
  reactivateWorkerAccount,
  deleteWorkerAccount,
  deleteClientAccount
} from "../controllers/adminDirectoryController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { USER_ROLES } from "../constants/roles.js";

const router = Router();

router.use(protect, authorize(USER_ROLES.ADMIN));

router.get("/clients", listClientDirectory);
router.get("/workers", listWorkerDirectory);
router.patch("/workers/:id/suspend", suspendWorkerAccount);
router.patch("/workers/:id/reactivate", reactivateWorkerAccount);
router.delete("/workers/:id", deleteWorkerAccount);
router.delete("/clients/:id", deleteClientAccount);
router.patch("/clients/:id/delete", deleteClientAccount);

export default router;
