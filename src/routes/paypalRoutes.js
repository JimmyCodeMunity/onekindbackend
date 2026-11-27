import express from 'express';
import {
  createPaypalOrder,
  capturePaypalOrder,
} from '../controllers/paypalController.js';

const router = express.Router();

// ── PayPal donation routes ────────────────────────────────────────────────

// Create a PayPal order (client calls this to get orderId + approvalUrl)
router.post('/paypal/create-order', createPaypalOrder);

// Capture a PayPal order after client-side approval
router.post('/paypal/capture-order', capturePaypalOrder);

export default router;
