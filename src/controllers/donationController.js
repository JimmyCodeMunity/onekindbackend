import { stripeInstance, isStripeConfigured } from '../config/stripe.js';
import { Donation } from '../models/Donation.js';
import { Campaign } from '../models/Campaign.js';

// @desc    Create Stripe Payment Intent (or return mock token if Stripe unconfigured)
// @route   POST /api/donations/create-payment-intent
// @access  Public
export const createPaymentIntent = async (req, res, next) => {
  try {
    const { amount, campaignId, donorEmail, currency = 'usd' } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: 'A donation amount of at least $1.00 is required',
      });
    }

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required',
      });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    // Convert amount to cents for Stripe
    const amountInCents = Math.round(amount * 100);

    if (isStripeConfigured && stripeInstance) {
      const paymentIntent = await stripeInstance.paymentIntents.create({
        amount: amountInCents,
        currency: currency.toLowerCase(),
        receipt_email: donorEmail,
        metadata: {
          campaignId: campaignId.toString(),
          campaignTitle: campaign.title,
          donorEmail: donorEmail || '',
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      return res.status(200).json({
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        isLiveStripe: true,
      });
    }

    // Sandbox / Test Mode fallback
    const mockPaymentIntentId = `pi_mock_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const mockClientSecret = `${mockPaymentIntentId}_secret_${Math.random().toString(36).substring(2, 9)}`;

    res.status(200).json({
      success: true,
      clientSecret: mockClientSecret,
      paymentIntentId: mockPaymentIntentId,
      isLiveStripe: false,
      isSandbox: true,
      message: 'Running in sandbox payment mode. Donations will be processed instantly for testing.',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Record confirmed donation and update campaign stats
// @route   POST /api/donations/confirm
// @access  Public
export const confirmDonation = async (req, res, next) => {
  try {
    const {
      campaignId,
      donorName,
      donorEmail,
      amount,
      currency = 'USD',
      paymentMethod = 'card',
      paymentId = '',
      isAnonymous = false,
      message = '',
    } = req.body;

    if (!campaignId || !amount || !donorEmail) {
      return res.status(400).json({
        success: false,
        message: 'Please provide campaignId, donation amount, and donor email',
      });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const donationAmount = Number(amount);

    // Create donation record
    const donation = await Donation.create({
      campaign: campaignId,
      donorName: isAnonymous ? 'Kind Supporter' : donorName || 'Kind Supporter',
      donorEmail,
      amount: donationAmount,
      currency: currency.toUpperCase(),
      paymentMethod,
      paymentId: paymentId || `txn_${Date.now()}`,
      status: 'completed',
      isAnonymous: Boolean(isAnonymous),
      message: message ? message.trim() : '',
    });

    // Update campaign raisedAmount and donorsCount
    campaign.raisedAmount = (campaign.raisedAmount || 0) + donationAmount;
    campaign.donorsCount = (campaign.donorsCount || 0) + 1;

    // Check if goal reached
    if (campaign.raisedAmount >= campaign.targetAmount && campaign.status === 'active') {
      campaign.status = 'completed';
    }

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Thank you so much! Your donation has been recorded successfully.',
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
  } catch (error) {
    next(error);
  }
};

// @desc    Get all donations (Admin) with filter, search, pagination
// @route   GET /api/donations
// @access  Private (Admin)
export const getDonations = async (req, res, next) => {
  try {
    const { campaignId, search, status, page = 1, limit = 20 } = req.query;

    const query = {};

    if (campaignId) {
      query.campaign = campaignId;
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { donorName: { $regex: search, $options: 'i' } },
        { donorEmail: { $regex: search, $options: 'i' } },
        { receiptNumber: { $regex: search, $options: 'i' } },
        { paymentId: { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    const skip = (pageNum - 1) * limitNum;

    const total = await Donation.countDocuments(query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title slug category images')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Calculate aggregated stats
    const totalRaisedAgg = await Donation.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalRaised = totalRaisedAgg[0]?.total || 0;

    res.status(200).json({
      success: true,
      count: donations.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      totalRaised,
      donations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get donation receipt details by receiptNumber
// @route   GET /api/donations/receipt/:receiptNumber
// @access  Public
export const getDonationReceipt = async (req, res, next) => {
  try {
    const donation = await Donation.findOne({ receiptNumber: req.params.receiptNumber })
      .populate('campaign', 'title slug category images beneficiary targetAmount raisedAmount')
      .lean();

    if (!donation) {
      return res.status(404).json({
        success: false,
        message: 'Donation receipt not found',
      });
    }

    res.status(200).json({
      success: true,
      donation,
    });
  } catch (error) {
    next(error);
  }
};
