import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema(
  {
    siteName: {
      type: String,
      default: 'OneKindAct',
    },
    siteTagline: {
      type: String,
      default: 'Direct, Transparent Empathy in Action',
    },
    siteDescription: {
      type: String,
      default:
        'Empowering direct aid by connecting caring donors with verified individuals and families in critical need through authentic photographic stories and transparent proof of impact.',
    },
    supportEmail: {
      type: String,
      default: 'support@onekindact.org',
    },
    socialLinks: {
      twitter: { type: String, default: 'https://twitter.com/onekindact' },
      facebook: { type: String, default: 'https://facebook.com/onekindact' },
      instagram: { type: String, default: 'https://instagram.com/onekindact' },
      linkedin: { type: String, default: 'https://linkedin.com/company/onekindact' },
    },
    seo: {
      defaultMetaTitle: {
        type: String,
        default: 'OneKindAct | Direct Donation Platform - Verified Stories, Direct Impact',
      },
      defaultMetaDescription: {
        type: String,
        default:
          'Donate directly to verified people in need. Authentic photographic documentation, 100% transparent delivery updates, and real impact tracking.',
      },
      defaultKeywords: {
        type: [String],
        default: [
          'direct donation',
          'charity crowdfunding',
          'medical aid',
          'emergency relief',
          'philanthropy',
          'transparent charity',
        ],
      },
      defaultOgImage: {
        type: String,
        default:
          'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?q=80&w=1200&auto=format&fit=crop',
      },
      googleAnalyticsId: {
        type: String,
        default: '',
      },
    },
    impactStats: {
      verifiedCausesCount: { type: Number, default: 24 },
      communitiesReached: { type: Number, default: 12 },
      volunteersCount: { type: Number, default: 45 },
    },
  },
  {
    timestamps: true,
  }
);

export const Setting = mongoose.model('Setting', settingSchema);
