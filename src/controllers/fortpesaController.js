import crypto from 'crypto';
import { Donation } from '../models/Donation.js';
import { Campaign } from '../models/Campaign.js';
import { PaymentLog } from '../models/PaymentLog.js';
import { fortpesa, FortpesaService } from '../services/fortpesaService.js';

/**
 * Normalise a Kenyan phone number to Fortpesa format: 254XXXXXXXXX (12 digits).
 * Accepts: 0712345678, +254712345678, 254712345678.
 * Returns null if invalid.
 */
function normalizeFortpesaPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  return null;
}

function makeIdempotencyKey(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${ts}-${rand}`.replace(/[^A-Za-z0-9._:-]/g, '-');
}

// ── POST /api/donations/fortpesa/initialize ───────────────────────────────
export const initFortpesaDonation = async (req, res, next) => {
  try {
    const { amount, campaignId, donorEmail, donorName, phone } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'Minimum donation amount is 1' });
    }
    if (!campaignId) {
      return res.status(400).json({ success: false, message: 'Campaign ID is required' });
    }
    if (!donorEmail) {
      return res.status(400).json({ success: false, message: 'Donor email is required' });
    }
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Phone number is required for M-Pesa' });
    }

    const normalizedPhone = normalizeFortpesaPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number. Use format 254712345678 or 0712345678.',
      });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // Fortpesa uses whole KES integers
    const amountKes = Math.round(amount);
    if (amountKes <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    // Account reference ≤ 12 chars, description ≤ 13 chars
    const accountReference = `OKA${Date.now().toString(36).toUpperCase().slice(0, 6)}`.slice(0, 12);
    const description = 'Donation'.slice(0, 13);

    // Log the payment attempt
    const paymentLog = await PaymentLog.create({
      campaign: campaignId,
      donorName: donorName || 'Kind Supporter',
      donorEmail,
      amount: amountKes,
      currency: 'KES',
      paymentMethod: 'fortpesa',
      phone: normalizedPhone,
      status: 'pending',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    });

    const idempotencyKey = makeIdempotencyKey(`oka-${paymentLog._id}`);

    // Early wallet check — catch insufficient credit before prompting the customer's phone
    try {
      const wallet = await fortpesa.getWalletBalance();
      const balance = typeof wallet?.balance === 'number' ? wallet.balance : parseFloat(wallet?.balance);
      if (!isNaN(balance) && balance < 10) {
        await PaymentLog.findByIdAndUpdate(paymentLog._id, { status: 'abandoned' }).catch(() => {});
        return res.status(402).json({
          success: false,
          message: 'Service temporarily unavailable — please try again shortly.',
          code: 'INSUFFICIENT_CREDIT',
        });
      }
    } catch (walletErr) {
      console.warn('[Fortpesa] Wallet balance check failed:', walletErr.message);
      // Non-fatal — STK will surface 402 if needed
    }

    // Initiate STK Push
    let stkData;
    try {
      stkData = await fortpesa.createStkPush({
        amount: amountKes,
        phone: normalizedPhone,
        channelId: fortpesa.channelId,
        accountReference,
        description,
        idempotencyKey,
      });
    } catch (stkErr) {
      await PaymentLog.findByIdAndUpdate(paymentLog._id, { status: 'abandoned' }).catch(() => {});
      const msg = stkErr.response?.data?.error?.message || stkErr.message;
      return res.status(502).json({ success: false, message: `Fortpesa STK failed: ${msg}` });
    }

    // Save the Fortpesa uuid to the payment log
    await PaymentLog.findByIdAndUpdate(paymentLog._id, {
      providerReference: stkData.uuid,
      providerStatus: stkData.status,
      platformFee: stkData.platform_fee ?? null,
    });

    return res.status(201).json({
      success: true,
      uuid: stkData.uuid,
      status: stkData.status,
      amount: stkData.amount,
      platformFee: stkData.platform_fee,
      phone: stkData.phone,
      accountReference: stkData.account_reference,
      providerTransactionId: stkData.provider_transaction_id,
      amountDisplay: `KES ${stkData.amount}`,
      paymentLogId: paymentLog._id,
    });
  } catch (error) {
    next(error);
  }
};

// ── GET /api/donations/fortpesa/transactions/:uuid ────────────────────────
export const verifyFortpesaDonation = async (req, res, next) => {
  try {
    const { uuid } = req.params;
    if (!uuid) {
      return res.status(400).json({ success: false, message: 'Transaction uuid is required' });
    }

    const tx = await fortpesa.getTransaction(uuid);
    const status = FortpesaService.normalizeStatus(tx.status);

    // If terminal and successful, record donation + update campaign stats
    if (status === 'success') {
      const paymentLog = await PaymentLog.findOne({ providerReference: uuid });
      if (paymentLog && paymentLog.status !== 'completed') {
        // "Verifying…" delay parity with oddshub
        await new Promise((r) => setTimeout(r, 3000));

        const campaign = await Campaign.findById(paymentLog.campaign);
        if (!campaign) {
          return res.status(404).json({ success: false, message: 'Campaign not found' });
        }

        // Check for duplicate (idempotency)
        const exists = await Donation.findOne({ paymentId: uuid });
        if (exists) {
          return res.status(200).json({ success: true, donation: exists, alreadyRecorded: true });
        }

        const donation = await Donation.create({
          campaign: paymentLog.campaign,
          donorName: paymentLog.donorName,
          donorEmail: paymentLog.donorEmail,
          amount: paymentLog.amount,
          currency: paymentLog.currency,
          paymentMethod: 'fortpesa',
          paymentId: uuid,
          status: 'completed',
          isAnonymous: paymentLog.isAnonymous,
          message: paymentLog.message,
        });

        campaign.raisedAmount = (campaign.raisedAmount || 0) + paymentLog.amount;
        campaign.donorsCount = (campaign.donorsCount || 0) + 1;
        if (campaign.raisedAmount >= campaign.targetAmount && campaign.status === 'active') {
          campaign.status = 'completed';
        }
        await campaign.save();

        await PaymentLog.findByIdAndUpdate(paymentLog._id, {
          status: 'completed',
          providerStatus: 'success',
          paidAt: new Date(),
        }).catch(() => {});

        return res.status(200).json({
          success: true,
          status: 'success',
          uuid,
          amount: tx.amount,
          currency: 'KES',
          donation,
          campaign: {
            id: campaign._id,
            title: campaign.title,
            raisedAmount: campaign.raisedAmount,
            targetAmount: campaign.targetAmount,
            donorsCount: campaign.donorsCount,
            progressPercent: Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100)),
          },
        });
      }
      if (paymentLog && paymentLog.status === 'completed') {
        // Already completed — return cached info
        const campaign = await Campaign.findById(paymentLog.campaign);
        return res.status(200).json({
          success: true,
          status: 'success',
          uuid,
          amount: tx.amount,
          currency: 'KES',
          paidAt: paymentLog.paidAt ? new Date(paymentLog.paidAt).toISOString() : new Date().toISOString(),
        });
      }
    }

    // Terminal but not successful
    if (FortpesaService.isTerminal(status)) {
      await PaymentLog.findOneAndUpdate(
        { providerReference: uuid },
        {
          providerStatus: status,
          status: status === 'cancelled' || status === 'expired' ? 'abandoned' : 'failed',
        },
      ).catch(() => {});
      return res.status(200).json({
        success: false,
        status,
        uuid,
        amount: tx.amount,
        currency: 'KES',
        message: status === 'failed' ? 'Payment failed. Please try again.' : `Payment ${status}.`,
      });
    }

    // Still pending — client should keep polling
    return res.status(200).json({
      success: true,
      status: 'pending',
      uuid,
      amount: tx.amount,
      currency: 'KES',
    });
  } catch (error) {
    if (error.status === 404 || error.message === 'TRANSACTION_NOT_FOUND') {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    next(error);
  }
};

// ── POST /api/donations/fortpesa/webhook ──────────────────────────────────
export const fortpesaWebhook = async (req, res, next) => {
  try {
    const signature = req.headers['x-fortpesa-signature'];
    const timestamp = req.headers['x-fortpesa-timestamp'];
    const rawBody = req.body; // Buffer (express.raw)

    if (!fortpesa.verifyWebhookSignature(rawBody, signature, timestamp)) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid JSON body' });
    }

    const { event, data } = payload || {};
    const uuid = data?.uuid;
    const status = FortpesaService.normalizeStatus(data?.status);

    if (!uuid) {
      return res.status(400).json({ success: false, message: 'Missing uuid in webhook payload' });
    }

    // Re-fetch transaction — trust only the GET result
    let tx;
    try {
      tx = await fortpesa.getTransaction(uuid);
    } catch (fetchErr) {
      console.error('[Fortpesa Webhook] Re-fetch failed:', fetchErr.message);
      // Return 2xx so Fortpesa stops retrying
      return res.status(200).json({ received: true });
    }

    const confirmedStatus = FortpesaService.normalizeStatus(tx.status);

    // Update payment log
    const paymentLog = await PaymentLog.findOne({ providerReference: uuid });
    if (paymentLog) {
      const update = { providerStatus: confirmedStatus };
      if (confirmedStatus === 'success') {
        update.status = 'completed';
      } else if (confirmedStatus === 'failed' || confirmedStatus === 'cancelled' || confirmedStatus === 'expired') {
        update.status = 'abandoned';
      }
      await PaymentLog.findByIdAndUpdate(paymentLog._id, update).catch(() => {});
    }

    // Respond quickly — heavy fulfilment should be a background job
    return res.status(200).json({ received: true, uuid, status: confirmedStatus });
  } catch (error) {
    console.error('[Fortpesa Webhook Error]', error.message);
    // Always 2xx to avoid unnecessary retries
    return res.status(200).json({ received: true });
  }
};
