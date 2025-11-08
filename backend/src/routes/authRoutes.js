import express from "express";
import {
  register,
  login,
  getMe,
  logout,
  changePassword,
  resetUserPassword,
  requestPasswordResetCode,
  resetPasswordWithCode,
} from "../controllers/authController.js";
import { protect, authorize } from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.post("/logout", protect, logout);
router.post("/change-password", protect, changePassword);
router.post("/request-reset-code", protect, requestPasswordResetCode);
router.post("/reset-password-with-code", protect, resetPasswordWithCode);
router.post(
  "/reset-user-password",
  protect,
  authorize("Admin"),
  resetUserPassword
);

export default router;
