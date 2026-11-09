import { Campaign } from '../models/Campaign.js';
import { Donation } from '../models/Donation.js';

// @desc    Get all campaigns with filters, search & pagination
// @route   GET /api/campaigns
// @access  Public
export const getCampaigns = async (req, res, next) => {
  try {
    const {
      search,
      category,
      status,
      featured,
      urgent,
      sort = '-createdAt',
      page = 1,
      limit = 12,
    } = req.query;

    const query = {};

    // Filter by status (default to active for public unless specified)
    if (status && status !== 'all') {
      query.status = status;
    }

    // Filter by category
    if (category && category !== 'All') {
      query.category = category;
    }

    // Filter featured
    if (featured === 'true') {
      query.isFeatured = true;
    }

    // Filter urgent
    if (urgent === 'true') {
      query.isUrgent = true;
    }

    // Search keyword in title, summary, or beneficiary location
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { summary: { $regex: search, $options: 'i' } },
        { 'beneficiary.name': { $regex: search, $options: 'i' } },
        { 'beneficiary.location': { $regex: search, $options: 'i' } },
      ];
    }

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 12;
    const skip = (pageNum - 1) * limitNum;

    // Build sort option
    let sortQuery = { createdAt: -1 };
    if (sort === 'urgent') sortQuery = { isUrgent: -1, createdAt: -1 };
    if (sort === 'most_funded') sortQuery = { raisedAmount: -1 };
    if (sort === 'almost_funded') sortQuery = { raisedAmount: -1 };
    if (sort === 'newest') sortQuery = { createdAt: -1 };
    if (sort === 'oldest') sortQuery = { createdAt: 1 };

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .sort(sortQuery)
      .skip(skip)
      .limit(limitNum)
      .lean();

    res.status(200).json({
      success: true,
      count: campaigns.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      campaigns,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single campaign by slug (Public)
// @route   GET /api/campaigns/slug/:slug
// @access  Public
export const getCampaignBySlug = async (req, res, next) => {
  try {
    const campaign = await Campaign.findOne({ slug: req.params.slug });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign story not found',
      });
    }

    // Also fetch the 10 most recent donations for this campaign
    const recentDonations = await Donation.find({
      campaign: campaign._id,
      status: 'completed',
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('donorName amount isAnonymous message createdAt')
      .lean();

    res.status(200).json({
      success: true,
      campaign,
      recentDonations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single campaign by ID (Admin)
// @route   GET /api/campaigns/:id
// @access  Public / Admin
export const getCampaignById = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    res.status(200).json({
      success: true,
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create new campaign (Admin)
// @route   POST /api/campaigns
// @access  Private (Admin)
export const createCampaign = async (req, res, next) => {
  try {
    const campaignData = {
      ...req.body,
      createdBy: req.user?._id,
    };

    // Ensure images array exists
    if (!campaignData.images || !campaignData.images.length) {
      return res.status(400).json({
        success: false,
        message: 'At least one photo of the beneficiary or story is required.',
      });
    }

    const campaign = await Campaign.create(campaignData);

    res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update campaign (Admin)
// @route   PUT /api/campaigns/:id
// @access  Private (Admin)
export const updateCampaign = async (req, res, next) => {
  try {
    let campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    campaign = await Campaign.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: 'Campaign updated successfully',
      campaign,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete campaign (Admin)
// @route   DELETE /api/campaigns/:id
// @access  Private (Admin)
export const deleteCampaign = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    await Campaign.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add photo update to a campaign (Proof of Impact / Progress)
// @route   POST /api/campaigns/:id/updates
// @access  Private (Admin)
export const addCampaignUpdate = async (req, res, next) => {
  try {
    const campaign = await Campaign.findById(req.params.id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found',
      });
    }

    const { title, content, images = [], amountSpent = 0 } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Update title and content description are required',
      });
    }

    campaign.updates.unshift({
      title,
      content,
      images,
      amountSpent: Number(amountSpent) || 0,
      postedAt: new Date(),
    });

    await campaign.save();

    res.status(201).json({
      success: true,
      message: 'Photographic update added to campaign successfully',
      updates: campaign.updates,
    });
  } catch (error) {
    next(error);
  }
};
