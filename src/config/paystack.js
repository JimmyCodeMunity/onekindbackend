import dotenv from 'dotenv';
dotenv.config();

const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;

export const isPaystackConfigured = Boolean(
  paystackSecretKey &&
  paystackSecretKey.startsWith('sk_') &&
  !paystackSecretKey.includes('placeholder')
);

export const PAYSTACK_SECRET = paystackSecretKey || '';

if (isPaystackConfigured) {
  console.log(' Paystack initialized.');
} else {
  console.log(' Paystack secret key not set — Paystack payments will use sandbox mode.');
}
