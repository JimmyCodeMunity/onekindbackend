import express from 'express';
import {
  initFortpesaDonation,
  verifyFortpesaDonation,
  fortpesaWebhook,
} from '../controllers/fortpesaController.js';

const router = express.Router();

// ── Fortpesa (M-Pesa STK Push) donation routes ────────────────────────────

// Initialize an M-Pesa STK Push donation
router.post('/fortpesa/initialize', initFortpesaDonation);

// Poll/verify a Fortpesa transaction by UUID
router.get('/fortpesa/transactions/:uuid', verifyFortpesaDonation);

// Webhook — uses raw body, registered separately in server.js for signature verification
// router.post('/fortpesa/webhook', fortpesaWebhook); // see server.js

export default router;
