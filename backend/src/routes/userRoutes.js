import express from "express";
import { protect, authorize } from "../middleware/auth.js";
import {
  createUser,
  getAllUsers,
  getUserById,
  deleteUser,
} from "../controllers/userController.js";
import { User } from "../models/userModel.js";
import { EmployeeProfile } from "../models/profileModel.js";

const router = express.Router();

// Create new user (Admin only)
router.post("/create", protect, authorize("Admin"), createUser);

// Get all users with profiles (All authenticated users can view)
router.get("/", protect, getAllUsers);

// Get user by ID
router.get("/:id", protect, getUserById);

// Delete user (Admin only)
router.delete("/:id", protect, authorize("Admin"), deleteUser);

// Get user profile
router.get("/profile/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user can access this profile
    if (
      req.user.userId !== parseInt(userId) &&
      !["Admin", "HR Officer"].includes(req.user.roleName)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this profile",
      });
    }

    const user = await User.findById(userId);
    const profile = await EmployeeProfile.findByUserId(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user,
        profile,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching profile",
      error: error.message,
    });
  }
});

// Update user profile
router.put("/profile/:userId", protect, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if user can update this profile
    if (
      req.user.userId !== parseInt(userId) &&
      !["Admin", "HR Officer"].includes(req.user.roleName)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this profile",
      });
    }

    await EmployeeProfile.update(userId, req.body);

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
});

// Update user status (Admin only)
router.put("/:userId/status", protect, authorize("Admin"), async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    await User.updateStatus(userId, is_active);

    res.status(200).json({
      success: true,
      message: "User status updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating user status",
      error: error.message,
    });
  }
});

export default router;
