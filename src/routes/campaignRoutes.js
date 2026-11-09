import express from 'express';
import {
  getCampaigns,
  getCampaignBySlug,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  addCampaignUpdate,
} from '../controllers/campaignController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

router.get('/', getCampaigns);
router.get('/slug/:slug', getCampaignBySlug);
router.get('/:id', getCampaignById);

// Protected routes (Admin only)
router.post('/', protect, authorize('admin'), createCampaign);
router.put('/:id', protect, authorize('admin'), updateCampaign);
router.delete('/:id', protect, authorize('admin'), deleteCampaign);
router.post('/:id/updates', protect, authorize('admin'), addCampaignUpdate);

export default router;
