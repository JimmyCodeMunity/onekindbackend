import { Campaign } from '../models/Campaign.js';
import { Donation } from '../models/Donation.js';
import { isCloudinaryConfigured } from '../config/cloudinary.js';
import { isStripeConfigured } from '../config/stripe.js';

// @desc    Get dashboard analytics & platform overview
// @route   GET /api/analytics/dashboard
// @access  Private (Admin)
export const getAdminAnalytics = async (req, res, next) => {
  try {
    const [
      totalCampaigns,
      activeCampaigns,
      completedCampaigns,
      totalDonationsCount,
      donationTotals,
      recentDonations,
      categoryStats,
      recentCampaigns,
    ] = await Promise.all([
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: { $in: ['active', 'urgent'] } }),
      Campaign.countDocuments({ status: 'completed' }),
      Donation.countDocuments({ status: 'completed' }),
      Donation.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, totalRaised: { $sum: '$amount' }, avgDonation: { $avg: '$amount' } } },
      ]),
      Donation.find({ status: 'completed' })
        .populate('campaign', 'title slug images')
        .sort({ createdAt: -1 })
        .limit(6)
        .lean(),
      Campaign.aggregate([
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            totalRaised: { $sum: '$raisedAmount' },
            targetAmount: { $sum: '$targetAmount' },
          },
        },
      ]),
      Campaign.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title slug category status targetAmount raisedAmount donorsCount images createdAt')
        .lean(),
    ]);

    const totalRaised = donationTotals[0]?.totalRaised || 0;
    const avgDonation = Math.round(donationTotals[0]?.avgDonation || 0);

    // Compute monthly donation trends for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const monthlyTrends = await Donation.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1 },
      },
    ]);

    // Format months with names
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedTrends = monthlyTrends.map((item) => ({
      name: `${monthNames[item._id.month - 1]} ${item._id.year}`,
      amount: item.total,
      donations: item.count,
    }));

    res.status(200).json({
      success: true,
      stats: {
        totalRaised,
        avgDonation,
        totalDonationsCount,
        totalCampaigns,
        activeCampaigns,
        completedCampaigns,
        systemStatus: {
          cloudinaryConnected: isCloudinaryConfigured,
          stripeLiveMode: isStripeConfigured,
        },
      },
      monthlyTrends: formattedTrends,
      categoryStats,
      recentDonations,
      recentCampaigns,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get public impact stats for hero/homepage
// @route   GET /api/analytics/public-impact
// @access  Public
export const getPublicImpact = async (req, res, next) => {
  try {
    const [campaignsCount, completedCount, donationsAgg] = await Promise.all([
      Campaign.countDocuments(),
      Campaign.countDocuments({ status: 'completed' }),
      Donation.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, totalRaised: { $sum: '$amount' }, totalDonors: { $sum: 1 } } },
      ]),
    ]);

    const totalRaised = donationsAgg[0]?.totalRaised || 0;
    const totalDonors = donationsAgg[0]?.totalDonors || 0;

    res.status(200).json({
      success: true,
      impact: {
        totalRaised,
        totalDonors,
        verifiedCauses: campaignsCount,
        completedCampaigns: completedCount,
        communitiesReached: 18,
      },
    });
  } catch (error) {
    next(error);
  }
};
