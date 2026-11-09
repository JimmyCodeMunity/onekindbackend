import Stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const isStripeConfigured = Boolean(
  stripeSecretKey &&
  stripeSecretKey.startsWith('sk_') &&
  !stripeSecretKey.includes('placeholder')
);

let stripeInstance = null;
if (isStripeConfigured) {
  stripeInstance = new Stripe(stripeSecretKey, {
    apiVersion: '2024-12-18.acacia',
  });
  console.log(' Stripe initialized in live/test API mode.');
} else {
  console.log(' Stripe secret key not set. Using built-in secure sandbox test payment mode.');
}

export { stripeInstance, isStripeConfigured };
