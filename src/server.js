/**
 * Vercel serverless entry point.
 * Vercel needs the Express `app` exported as default — not app.listen().
 * This file is the `builds.src` target in vercel.json.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes     from './routes/authRoutes.js';
import campaignRoutes from './routes/campaignRoutes.js';
import donationRoutes from './routes/donationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import seoRoutes      from './routes/seoRoutes.js';
import uploadRoutes   from './routes/uploadRoutes.js';
import { paystackWebhook } from './controllers/paystackController.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app = express();

// ── Security & Middleware ─────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: [
    process.env.FRONTEND_URL  || 'http://localhost:5173',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads (local fallback only — use Cloudinary in production)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));
app.use('/api/donations/create-payment-intent', rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many donation requests. Please slow down.' },
}));

// ── Paystack webhook (raw body before json middleware) ────────────────────────
app.post(
  '/api/donations/paystack-webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
    next();
  },
  paystackWebhook
);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/seo',       seoRoutes);
app.use('/api/upload',    uploadRoutes);

// ── Sitemap & robots ─────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => res.redirect('/api/seo/sitemap.xml'));
app.get('/robots.txt',  (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://onekindact.org';
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${frontendUrl}/sitemap.xml\n`
  );
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const start = Date.now();

  // ── DB ping ────────────────────────────────────────────────────────────────
  let dbStatus  = 'disconnected';
  let dbLatency = null;
  let dbName    = null;
  try {
    const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    dbStatus = states[mongoose.connection.readyState] || 'unknown';

    if (mongoose.connection.readyState === 1) {
      const dbPingStart = Date.now();
      await mongoose.connection.db.admin().ping();
      dbLatency = `${Date.now() - dbPingStart}ms`;
      dbName    = mongoose.connection.name;
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  // ── Memory ────────────────────────────────────────────────────────────────
  const mem  = process.memoryUsage();
  const toMB = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;

  // ── Integrations ─────────────────────────────────────────────────────────
  const { isCloudinaryConfigured } = await import('./config/cloudinary.js');
  const { isStripeConfigured }     = await import('./config/stripe.js');
  const { isPaystackConfigured }   = await import('./config/paystack.js');

  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    status:       healthy ? 'healthy' : 'degraded',
    timestamp:    new Date().toISOString(),
    responseTime: `${Date.now() - start}ms`,
    environment:  process.env.NODE_ENV || 'development',
    version:      process.env.npm_package_version || '1.0.0',
    uptime:       `${Math.floor(process.uptime())}s`,

    database: {
      status:  dbStatus,
      latency: dbLatency,
      name:    dbName,
    },

    memory: {
      rss:       toMB(mem.rss),
      heapUsed:  toMB(mem.heapUsed),
      heapTotal: toMB(mem.heapTotal),
    },

    integrations: {
      cloudinary: isCloudinaryConfigured ? 'configured' : 'sandbox (local fallback)',
      stripe:     isStripeConfigured     ? 'configured' : 'sandbox',
      paystack:   isPaystackConfigured   ? 'configured' : 'sandbox',
    },
  });
});

// ── 404 & Error handler ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});
app.use(errorHandler);

// ── Connect DB (once — cached across serverless warm invocations) ─────────────
connectDB();

// ── Local dev server (not used by Vercel) ────────────────────────────────────
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 OneKindAct API running on http://localhost:${PORT}`);
    console.log(`   Environment : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
  });
}

export default app;
