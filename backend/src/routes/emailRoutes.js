import express from 'express';
import { testEmailConnection } from '../services/emailService.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Test email configuration
router.get('/test', protect, authorize('Admin'), async (req, res) => {
  try {
    const result = await testEmailConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Email test failed',
      error: error.message
    });
  }
});

export default router;
