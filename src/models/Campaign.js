import mongoose from 'mongoose';
import slugify from 'slugify';

const updateSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    content: {
      type: String,
      required: true,
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, default: '' },
        caption: { type: String, default: '' },
      },
    ],
    amountSpent: {
      type: Number,
      default: 0,
    },
    postedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const campaignSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Campaign title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      index: true,
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: [
        'Medical Aid',
        'Emergency Relief',
        'Food & Essentials',
        'Shelter & Housing',
        'Children & Education',
        'Elderly Care',
        'Disability Support',
        'Community Projects',
      ],
      default: 'Emergency Relief',
    },
    summary: {
      type: String,
      required: [true, 'Short summary is required'],
      maxlength: [300, 'Summary cannot exceed 300 characters'],
    },
    story: {
      type: String,
      required: [true, 'Full story is required'],
    },
    images: [
      {
        url: { type: String, required: true },
        public_id: { type: String, default: '' },
        caption: { type: String, default: '' },
        isCover: { type: Boolean, default: false },
      },
    ],
    beneficiary: {
      name: { type: String, required: true },
      age: { type: Number },
      location: { type: String, required: true },
      situation: { type: String },
    },
    targetAmount: {
      type: Number,
      required: [true, 'Target amount is required'],
      min: [5, 'Target amount must be at least $5'],
    },
    raisedAmount: {
      type: Number,
      default: 0,
    },
    donorsCount: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: 'USD',
    },
    status: {
      type: String,
      enum: ['active', 'urgent', 'completed', 'paused'],
      default: 'active',
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isUrgent: {
      type: Boolean,
      default: false,
    },
    seo: {
      metaTitle: { type: String, default: '' },
      metaDescription: { type: String, default: '' },
      keywords: [{ type: String }],
      ogImage: { type: String, default: '' },
    },
    updates: [updateSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate slug and default SEO before validation
campaignSchema.pre('validate', function (next) {
  if (this.title && (!this.slug || this.isModified('title'))) {
    const baseSlug = slugify(this.title, { lower: true, strict: true });
    // Append a short random suffix if needed to guarantee uniqueness
    this.slug = `${baseSlug}-${Math.random().toString(36).substring(2, 6)}`;
  }

  // Set default SEO title/description if not provided
  if (!this.seo.metaTitle && this.title) {
    this.seo.metaTitle = `${this.title} | OneKindAct`;
  }
  if (!this.seo.metaDescription && this.summary) {
    this.seo.metaDescription = this.summary.slice(0, 155);
  }
  if (!this.seo.ogImage && this.images && this.images.length > 0) {
    this.seo.ogImage = this.images[0].url;
  }

  next();
});

export const Campaign = mongoose.model('Campaign', campaignSchema);
