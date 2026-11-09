import express from 'express';
import {
  createPaymentIntent,
  confirmDonation,
  getDonations,
  getDonationReceipt,
} from '../controllers/donationController.js';
import {
  initiatePaystack,
  verifyPaystack,
  paystackWebhook,
} from '../controllers/paystackController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// ── Stripe ──────────────────────────────────────────────────────────────────
router.post('/create-payment-intent', createPaymentIntent);
router.post('/confirm',               confirmDonation);
router.get( '/receipt/:receiptNumber', getDonationReceipt);

// ── Paystack ────────────────────────────────────────────────────────────────
router.post('/initiate-paystack',          initiatePaystack);
router.get( '/verify-paystack/:reference', verifyPaystack);
// Webhook uses raw body — registered separately in server.js

// ── Admin ────────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('admin'), getDonations);

export default router;
