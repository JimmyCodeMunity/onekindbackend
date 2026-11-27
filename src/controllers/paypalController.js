import { Donation } from '../models/Donation.js';
import { Campaign } from '../models/Campaign.js';
import { PaymentLog } from '../models/PaymentLog.js';
import { getPaypalAccessToken, PAYPAL_BASE_URL, PAYPAL_CURRENCY } from '../config/paypal.js';

function makeIdempotencyKey(prefix) {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${ts}-${rand}`.replace(/[^A-Za-z0-9._:-]/g, '-');
}

async function paypalRequest(method, path, body = null) {
  const token = await getPaypalAccessToken();
  const res = await fetch(`${PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.error_description || data.message || `PayPal API error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// ── POST /api/donations/paypal/create-order ───────────────────────────────
export const createPaypalOrder = async (req, res, next) => {
  try {
    const { amount, campaignId, donorEmail, donorName } = req.body;

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

    const amountUsd = Number(amount).toFixed(2);

    // Log the payment attempt
    const paymentLog = await PaymentLog.create({
      campaign: campaignId,
      donorName: donorName || 'Kind Supporter',
      donorEmail,
      amount: Number(amount),
      currency: PAYPAL_CURRENCY,
      paymentMethod: 'paypal',
      status: 'pending',
      ip: req.ip || '',
      userAgent: req.headers['user-agent'] || '',
    });

    const orderId = makeIdempotencyKey(`oka-paypal-${paymentLog._id}`);

    const order = await paypalRequest('POST', '/v2/checkout/orders', {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: paymentLog._id.toString(),
          amount: {
            currency_code: PAYPAL_CURRENCY,
            value: amountUsd,
          },
          description: `Donation to ${campaign.title}`,
          custom_id: paymentLog._id.toString(),
        },
      ],
      application_context: {
        brand_name: 'OneKindAct',
        locale: 'en-US',
        landing_page: 'LOGIN',
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY NOW',
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/donation/paypal-success`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/donation/paypal-cancel`,
      },
    });

    await PaymentLog.findByIdAndUpdate(paymentLog._id, {
      paymentId: order.id,
      providerReference: order.id,
    }).catch(() => {});

    const approvalUrl = order.links?.find((l) => l.rel === 'approve')?.href;

    return res.status(201).json({
      success: true,
      orderId: order.id,
      approvalUrl,
      amount: order.purchase_units[0]?.amount?.value || amountUsd,
      currency: order.purchase_units[0]?.amount?.currency_code || PAYPAL_CURRENCY,
      status: order.status,
      paymentLogId: paymentLog._id,
    });
  } catch (error) {
    next(error);
  }
};

// ── POST /api/donations/paypal/capture-order ──────────────────────────────
export const capturePaypalOrder = async (req, res, next) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await paypalRequest('POST', `/v2/checkout/orders/${orderId}/capture`);

    const purchaseUnit = order.purchase_units?.[0];
    const customId = purchaseUnit?.custom_id;
    const payments = order.purchase_units?.[0]?.payments?.captures?.[0];
    const paypalStatus = order.status;

    if (!customId) {
      return res.status(400).json({ success: false, message: 'Missing payment log reference' });
    }

    const paymentLog = await PaymentLog.findById(customId);
    if (!paymentLog) {
      return res.status(404).json({ success: false, message: 'Payment log not found' });
    }

    // Idempotency — don't double-record
    if (paymentLog.status === 'completed') {
      const donation = await Donation.findOne({ paymentId: orderId });
      return res.status(200).json({
        success: true,
        donation,
        alreadyRecorded: true,
        status: paypalStatus,
      });
    }

    if (paypalStatus === 'COMPLETED' && payments?.status === 'COMPLETED') {
      const campaign = await Campaign.findById(paymentLog.campaign);
      if (!campaign) {
        return res.status(404).json({ success: false, message: 'Campaign not found' });
      }

      const donation = await Donation.create({
        campaign: paymentLog.campaign,
        donorName: paymentLog.donorName,
        donorEmail: paymentLog.donorEmail,
        amount: paymentLog.amount,
        currency: paymentLog.currency,
        paymentMethod: 'paypal',
        paymentId: orderId,
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
        providerStatus: paypalStatus,
      }).catch(() => {});

      return res.status(200).json({
        success: true,
        donation,
        campaign: {
          id: campaign._id,
          title: campaign.title,
          raisedAmount: campaign.raisedAmount,
          targetAmount: campaign.targetAmount,
          donorsCount: campaign.donorsCount,
          progressPercent: Math.min(100, Math.round((campaign.raisedAmount / campaign.targetAmount) * 100)),
        },
        status: paypalStatus,
      });
    }

    // Payment not completed
    await PaymentLog.findByIdAndUpdate(paymentLog._id, {
      status: 'failed',
      providerStatus: paypalStatus,
    }).catch(() => {});

    return res.status(400).json({
      success: false,
      message: 'PayPal payment was not completed.',
      status: paypalStatus,
    });
  } catch (error) {
    next(error);
  }
};
