import express from 'express';
import { testEmailConnection } from '../services/emailService.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Test email configuration
router.get('/test', protect, authorize('Admin'), async (req, res) => {
  try {
    const result = await testEmailConnection();

    // transport and delivered tell the operator which mode was actually used, so a
    // dry-run "success" is never mistaken for real delivery. Provider error text is
    // logged, not echoed.
    if (result.skipped === true) {
      console.warn('Email connection test skipped:', result.reason);
    } else if (!result.success) {
      console.error('Email connection test failed:', result.error);
    }

    res.json({
      success: result.success,
      delivered: result.delivered === true,
      skipped: result.skipped === true,
      transport: result.transport ?? null,
      message:
        result.message ||
        (result.success
          ? 'Mail transport accepted the test'
          : result.skipped
            ? 'Mail is not configured in this environment, so no SMTP connection was attempted'
            : 'Mail transport reported a failure. Check the server log.'),
    });
  } catch (error) {
    console.error('Email connection test error:', error);
    res.status(500).json({
      success: false,
      message: 'Email test failed'
    });
  }
});

export default router;
