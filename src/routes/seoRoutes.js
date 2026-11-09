import express from 'express';
import {
  getSeoSettings,
  updateSeoSettings,
  getSitemapXml,
  getSeoAudit,
} from '../controllers/seoController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/settings', getSeoSettings);
router.get('/sitemap.xml', getSitemapXml);

// Admin only
router.put('/settings', protect, authorize('admin'), updateSeoSettings);
router.get('/audit',    protect, authorize('admin'), getSeoAudit);

export default router;
