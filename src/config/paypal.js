import dotenv from 'dotenv';
dotenv.config();

/**
 * PayPal configuration.
 *
 * Uses PayPal REST API v2 (sandbox by default; live when PAYPAL_CLIENT_ID starts with "A" in live env).
 *
 * Environment variables:
 *   PAYPAL_CLIENT_ID     — PayPal app client ID
 *   PAYPAL_CLIENT_SECRET — PayPal app client secret
 *   PAYPAL_CURRENCY      — currency code (default: USD)
 */
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const PAYPAL_CURRENCY = process.env.PAYPAL_CURRENCY || 'USD';
const PAYPAL_BASE_URL = process.env.PAYPAL_BASE_URL || 'https://api-m.sandbox.paypal.com';

let accessToken = null;
let tokenExpiry = 0;

export const isPaypalConfigured = Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);

export {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_CURRENCY,
  PAYPAL_BASE_URL,
};

/**
 * Get a PayPal OAuth2 access token (cached until expiry).
 */
export async function getPaypalAccessToken() {
  const now = Date.now();
  if (accessToken && now < tokenExpiry - 60) {
    return accessToken;
  }

  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || `PayPal auth failed ${res.status}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600) * 1000;
  return accessToken;
}

if (isPaypalConfigured) {
  console.log(` PayPal configured (${PAYPAL_BASE_URL.includes('sandbox') ? 'sandbox' : 'live'}).`);
} else {
  console.log(' PayPal not configured — PayPal donations will be unavailable.');
}
