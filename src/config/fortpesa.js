import dotenv from 'dotenv';
dotenv.config();

/**
 * Fortpesa (M-Pesa STK Push) configuration.
 *
 * Base URL: https://fortpesa.co.ke/api/v1
 * Currency: KES only (whole integers, no minor units)
 *
 * Environment variables required:
 *   FORTPESA_API_KEY        — pb_live_… from Fortpesa dashboard
 *   FORTPESA_CHANNEL_ID     — integer channel id from Channels page
 *   FORTPESA_WEBHOOK_SECRET — whsec_… for webhook HMAC verification
 */
const FORTPESA_API_KEY = process.env.FORTPESA_API_KEY || '';
const FORTPESA_CHANNEL_ID = process.env.FORTPESA_CHANNEL_ID
  ? parseInt(process.env.FORTPESA_CHANNEL_ID, 10)
  : null;
const FORTPESA_WEBHOOK_SECRET = process.env.FORTPESA_WEBHOOK_SECRET || '';
const FORTPESA_BASE_URL = 'https://fortpesa.co.ke/api/v1';

export const isFortpesaConfigured = Boolean(
  FORTPESA_API_KEY &&
  FORTPESA_CHANNEL_ID &&
  FORTPESA_WEBHOOK_SECRET
);

export {
  FORTPESA_API_KEY,
  FORTPESA_CHANNEL_ID,
  FORTPESA_WEBHOOK_SECRET,
  FORTPESA_BASE_URL,
};

if (isFortpesaConfigured) {
  console.log(' Fortpesa (M-Pesa STK Push) configured.');
} else {
  console.log(
    ' Fortpesa not configured — M-Pesa donations will be unavailable.',
  );
}
