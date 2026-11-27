import crypto from 'crypto';
import {
  FORTPESA_API_KEY,
  FORTPESA_CHANNEL_ID,
  FORTPESA_WEBHOOK_SECRET,
  FORTPESA_BASE_URL,
} from '../config/fortpesa.js';

/**
 * Fortpesa M-Pesa API client.
 *
 * Base URL: https://fortpesa.co.ke/api/v1
 * Currency: KES only (whole integers, no minor units)
 */
class FortpesaService {
  constructor() {
    this.apiKey = FORTPESA_API_KEY;
    this.channelId = FORTPESA_CHANNEL_ID;
    this.webhookSecret = FORTPESA_WEBHOOK_SECRET;

    if (!this.apiKey) {
      console.warn(
        '[Fortpesa] FORTPESA_API_KEY is not set — STK requests will fail.',
      );
    }
    if (!this.channelId) {
      console.warn(
        '[Fortpesa] FORTPESA_CHANNEL_ID is not set — STK requests will fail.',
      );
    }
  }

  /**
   * Confirm prepaid wallet balance can cover platform fees.
   * GET /wallet/balance
   */
  async getWalletBalance() {
    const res = await fetch(`${FORTPESA_BASE_URL}/wallet/balance`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Fortpesa API error ${res.status}`);
    }
    const data = await res.json();
    return data.data; // { merchant_id, balance, currency }
  }

  /**
   * Send STK Push to customer's phone.
   * POST /payments/stk
   *
   * @param {Object} params
   * @param {number} params.amount      Whole KES integer (e.g. 150)
   * @param {string} params.phone       254XXXXXXXXX (12 digits, no +)
   * @param {number} params.channelId   Required integer channel id
   * @param {string} params.accountReference ≤ 12 chars
   * @param {string} params.description ≤ 13 chars
   * @param {string} params.idempotencyKey Optional, 8–128 chars [A-Za-z0-9._:-]
   * @returns {Object} Fortpesa transaction data { uuid, status, amount, platform_fee, phone, … }
   */
  async createStkPush({
    amount,
    phone,
    channelId,
    accountReference,
    description,
    idempotencyKey,
  }) {
    if (!this.apiKey) {
      throw new Error('FORTPESA_API_KEY is not configured');
    }
    if (!channelId) {
      throw new Error('channel_id is required');
    }

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(`${FORTPESA_BASE_URL}/payments/stk`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: Math.round(amount),
        phone,
        channel_id: channelId,
        account_reference: accountReference,
        description,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err.error?.message || err.message || `Fortpesa STK failed ${res.status}`,
      );
    }

    const data = await res.json();
    return data.data;
  }

  /**
   * Fetch transaction status by UUID.
   * GET /transactions/{uuid}
   */
  async getTransaction(uuid) {
    const res = await fetch(`${FORTPESA_BASE_URL}/transactions/${encodeURIComponent(uuid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 404) {
        const notFoundErr = new Error('TRANSACTION_NOT_FOUND');
        notFoundErr.status = 404;
        throw notFoundErr;
      }
      throw new Error(err.message || `Fortpesa API error ${res.status}`);
    }

    const data = await res.json();
    return data.data;
  }

  /**
   * Verify an incoming Fortpesa webhook HMAC signature.
   *
   * Steps (never skip):
   *  1. Use the RAW request body (do not re-serialize parsed JSON).
   *  2. Reject if |now - timestamp| > 300s.
   *  3. HMAC-SHA256 over "{timestamp}.{rawBody}" with webhook secret.
   *  4. Constant-time compare against X-Fortpesa-Signature hex digest.
   *
   * @param {Buffer|string} rawBody  Raw request body
   * @param {string} signature       X-Fortpesa-Signature header value, e.g. "sha256=abc…"
   * @param {string} timestamp       X-Fortpesa-Timestamp header value (unix seconds)
   * @returns {boolean} true if valid
   */
  verifyWebhookSignature(rawBody, signature, timestamp) {
    if (!this.webhookSecret) {
      console.error('[Fortpesa] FORTPESA_WEBHOOK_SECRET is not set');
      return false;
    }
    if (!signature || !timestamp) return false;

    // Replay window: 5 minutes
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      return false;
    }

    // Expected scheme: "sha256={hex}"
    const match = /^sha256=([0-9a-f]+)$/i.exec(signature);
    if (!match) return false;
    const expectedHex = match[1];

    const payload = `${ts}.${rawBody}`;
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expectedHex, 'hex'),
    );
  }

  /**
   * Map a raw Fortpesa status string to a canonical status.
   */
  static normalizeStatus(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'success') return 'success';
    if (s === 'failed') return 'failed';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'expired') return 'expired';
    if (s === 'pending') return 'pending';
    return s;
  }

  /**
   * Check whether a status is terminal.
   */
  static isTerminal(status) {
    return [
      'success',
      'failed',
      'cancelled',
      'expired',
    ].includes(FortpesaService.normalizeStatus(status));
  }
}

export const fortpesa = new FortpesaService();
export { FortpesaService };
