import mongoose from 'mongoose';

/**
 * Tracks every payment attempt for donations.
 * Created on payment initiation, updated on verification/abandonment.
 */
const paymentLogSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    donorName: { type: String, default: 'Anonymous Supporter', trim: true },
    donorEmail: {
      type: String,
      required: [true, 'Donor email is required'],
      trim: true,
      lowercase: true,
    },
    amount: {
      type: Number,
      required: [true, 'Donation amount is required'],
      min: [1, 'Donation amount must be at least 1'],
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      enum: ['stripe', 'paystack', 'fortpesa', 'paypal'],
      required: true,
      index: true,
    },
    paymentId: { type: String, default: '', index: true }, // stripe PI id / paystack reference / fortpesa uuid / paypal order id
    providerReference: { type: String, default: '' }, // fortpesa uuid / paypal order id
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded', 'abandoned'],
      default: 'pending',
      index: true,
    },
    providerStatus: { type: String, default: null }, // raw provider status (e.g. fortpesa success/failed)
    platformFee: { type: Number, default: null }, // fortpesa platform fee in KES
    isAnonymous: { type: Boolean, default: false },
    message: { type: String, maxlength: 500, default: '' },
    phone: { type: String, default: '' }, // for fortpesa (254XXXXXXXXX)
    receiptNumber: { type: String, unique: true, sparse: true },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

// Auto-generate receipt number before save
paymentLogSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(1000 + Math.random() * 9000);
    this.receiptNumber = `OKA-${timestamp}-${random}`;
  }
  next();
});

export const PaymentLog = mongoose.model('PaymentLog', paymentLogSchema);
