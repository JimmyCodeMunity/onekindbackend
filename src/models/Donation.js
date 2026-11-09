import mongoose from 'mongoose';

const donationSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    donorName: {
      type: String,
      default: 'Anonymous Supporter',
      trim: true,
    },
    donorEmail: {
      type: String,
      required: [true, 'Donor email is required for receipt delivery'],
      trim: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: [true, 'Donation amount is required'],
      min: [1, 'Donation amount must be at least $1'],
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      default: 'stripe',
    },
    paymentId: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'completed',
      index: true,
    },
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      maxlength: [500, 'Message cannot exceed 500 characters'],
      default: '',
    },
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate receipt number before save
donationSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.receiptNumber = `OKA-${timestamp}-${random}`;
  }
  next();
});

export const Donation = mongoose.model('Donation', donationSchema);
