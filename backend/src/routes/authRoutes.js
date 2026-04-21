import { Router } from "express";
import {
  registerClient,
  registerAdmin,
  loginUser,
  forgotPasswordByEmail,
  recoverAdminAccess,
  getCurrentUser,
  changeMyPassword,
  deleteMyAccount,
  listDeletedUsersForAdmin
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register-client", registerClient);
router.post("/register-admin", registerAdmin);
router.post("/login", loginUser);
router.post("/forgot-password", forgotPasswordByEmail);
router.post("/recover-admin-access", recoverAdminAccess);

router.get("/me", protect, getCurrentUser);
router.patch("/change-password", protect, changeMyPassword);
router.post("/delete-account", protect, deleteMyAccount);
router.get("/admin/users", protect, listDeletedUsersForAdmin);

export default router;
