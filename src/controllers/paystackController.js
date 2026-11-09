import axios from 'axios';
import crypto from 'crypto';
import { Donation } from '../models/Donation.js';
import { Campaign } from '../models/Campaign.js';
import { PAYSTACK_SECRET, isPaystackConfigured } from '../config/paystack.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

// Helper: call Paystack API
async function paystackRequest(method, path, data = {}) {
  const res = await axios({
    method,
    url: `${PAYSTACK_BASE}${path}`,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json',
    },
    data,
  });
  return res.data;
}

// @desc    Initialize a Paystack transaction
// @route   POST /api/donations/initiate-paystack
// @access  Public
export const initiatePaystack = async (req, res, next) => {
  try {
    const { amount, campaignId, donorEmail, donorName, currency = 'NGN' } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ success: false, message: 'Minimum donation amount is 1' });
    }
    if (!campaignId) {
      return res.status(400).json({ success: false, message: 'Campaign ID is required' });
    }
    if (!donorEmail) {
      return res.status(400).json({ success: false, message: 'Donor email is required' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    // Paystack amounts are in the smallest currency unit (kobo for NGN, pesewas for GHS, cents for USD)
    const amountInSmallest = Math.round(amount * 100);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const callbackUrl = `${frontendUrl}/donation/paystack-callback`;

    if (isPaystackConfigured) {
      const response = await paystackRequest('POST', '/transaction/initialize', {
        email:        donorEmail,
        amount:       amountInSmallest,
        currency:     currency.toUpperCase(),
        callback_url: callbackUrl,
        metadata: {
          campaignId:    campaignId.toString(),
          campaignTitle: campaign.title,
          donorName:     donorName || '',
          donorEmail,
        },
      });

      return res.status(200).json({
        success:          true,
        authorizationUrl: response.data.authorization_url,
        reference:        response.data.reference,
        accessCode:       response.data.access_code,
        isLive:           true,
      });
    }

    // Sandbox fallback — skip real Paystack
    const mockReference = `psk_mock_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    return res.status(200).json({
      success:          true,
      authorizationUrl: null,
      reference:        mockReference,
      isSandbox:        true,
      message:          'Paystack not configured — using sandbox mode.',
    });
  } catch (error) {
    // Surface Paystack API error clearly
    const msg = error.response?.data?.message || error.message;
    return res.status(502).json({ success: false, message: `Paystack error: ${msg}` });
  }
};

// @desc    Verify a Paystack transaction after callback redirect
// @route   GET /api/donations/verify-paystack/:reference
// @access  Public
export const verifyPaystack = async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { campaignId, donorName, donorEmail, amount, isAnonymous, message: donorMessage } = req.query;

    if (!reference) {
      return res.status(400).json({ success: false, message: 'Reference is required' });
    }

    let paymentSucceeded = false;
    let verifiedAmount   = amount ? Number(amount) : 0;

    if (isPaystackConfigured && !reference.startsWith('psk_mock_')) {
      const response = await paystackRequest('GET', `/transaction/verify/${reference}`);
      const txn = response.data;

      if (txn.status !== 'success') {
        return res.status(400).json({
          success: false,
          message: `Payment not successful (status: ${txn.status})`,
        });
      }
      paymentSucceeded = true;
      verifiedAmount   = txn.amount / 100; // convert back from kobo/pesewas
    } else {
      // sandbox — accept as-is
      paymentSucceeded = true;
    }

    if (!paymentSucceeded || !campaignId || !donorEmail || !verifiedAmount) {
      return res.status(400).json({ success: false, message: 'Missing required fields to record donation' });
    }

    // Check for duplicate (idempotency)
    const exists = await Donation.findOne({ paymentId: reference });
    if (exists) {
      return res.status(200).json({ success: true, donation: exists, alreadyRecorded: true });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const donation = await Donation.create({
      campaign:      campaignId,
      donorName:     isAnonymous === 'true' ? 'Kind Supporter' : donorName || 'Kind Supporter',
      donorEmail,
      amount:        verifiedAmount,
      currency:      'NGN',
      paymentMethod: 'paystack',
      paymentId:     reference,
      status:        'completed',
      isAnonymous:   isAnonymous === 'true',
      message:       donorMessage ? donorMessage.trim() : '',
    });

    campaign.raisedAmount = (campaign.raisedAmount || 0) + verifiedAmount;
    campaign.donorsCount  = (campaign.donorsCount  || 0) + 1;
    if (campaign.raisedAmount >= campaign.targetAmount && campaign.status === 'active') {
      campaign.status = 'completed';
    }
    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Paystack donation recorded successfully.',
      donation,
      campaign: {
        id:              campaign._id,
        title:           campaign.title,
        raisedAmount:    campaign.raisedAmount,
        targetAmount:    campaign.targetAmount,
        donorsCount:     campaign.donorsCount,
        progressPercent: Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Paystack webhook (server-side event push)
// @route   POST /api/donations/paystack-webhook
// @access  Public (verified by signature)
export const paystackWebhook = async (req, res, next) => {
  try {
    // Verify the webhook signature
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
    }

    const event = req.body;

    if (event.event === 'charge.success') {
      const { reference, amount, metadata } = event.data;
      const { campaignId, donorName, donorEmail } = metadata || {};

      if (campaignId && donorEmail) {
        const exists = await Donation.findOne({ paymentId: reference });
        if (!exists) {
          const realAmount = amount / 100;
          const campaign = await Campaign.findById(campaignId);

          if (campaign) {
            await Donation.create({
              campaign:      campaignId,
              donorName:     donorName || 'Kind Supporter',
              donorEmail,
              amount:        realAmount,
              currency:      'NGN',
              paymentMethod: 'paystack',
              paymentId:     reference,
              status:        'completed',
            });

            campaign.raisedAmount = (campaign.raisedAmount || 0) + realAmount;
            campaign.donorsCount  = (campaign.donorsCount  || 0) + 1;
            if (campaign.raisedAmount >= campaign.targetAmount && campaign.status === 'active') {
              campaign.status = 'completed';
            }
            await campaign.save();
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    next(error);
  }
};
