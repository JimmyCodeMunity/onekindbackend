import express from 'express';
import { getAdminAnalytics, getPublicImpact } from '../controllers/analyticsController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/public-impact', getPublicImpact);
router.get('/dashboard', protect, authorize('admin'), getAdminAnalytics);

export default router;
