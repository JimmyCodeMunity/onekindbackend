/**
 * OneKindAct API — Express server
 * Works as both a local dev server and a Vercel serverless function.
 */
import express    from 'express';
import cors       from 'cors';
import helmet     from 'helmet';
import dotenv     from 'dotenv';
import mongoose   from 'mongoose';

import { connectDB }   from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';

import authRoutes      from './routes/authRoutes.js';
import campaignRoutes  from './routes/campaignRoutes.js';
import donationRoutes  from './routes/donationRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import seoRoutes       from './routes/seoRoutes.js';
import uploadRoutes    from './routes/uploadRoutes.js';
import { paystackWebhook } from './controllers/paystackController.js';

dotenv.config();

const app = express();
const IS_VERCEL = process.env.VERCEL === '1';

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5173',
];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));

// ── Body parsing ──────────────────────────────────────────────────────────────
// Paystack webhook must receive raw body — register BEFORE json middleware
app.post(
  '/api/donations/paystack-webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    if (Buffer.isBuffer(req.body)) req.body = JSON.parse(req.body.toString());
    next();
  },
  paystackWebhook
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Logging (skip on Vercel — use their built-in logs instead) ────────────────
if (!IS_VERCEL) {
  const { default: morgan } = await import('morgan');
  app.use(morgan('dev'));
}

// ── Static uploads (local dev only — use Cloudinary in production) ────────────
if (!IS_VERCEL) {
  const { default: path }        = await import('path');
  const { fileURLToPath }        = await import('url');
  const { default: expressStatic } = await import('express');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
}

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/donations', donationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/seo',       seoRoutes);
app.use('/api/upload',    uploadRoutes);

// ── Sitemap & robots ──────────────────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => res.redirect('/api/seo/sitemap.xml'));
app.get('/robots.txt',  (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://onekindact.org';
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${frontendUrl}/sitemap.xml\n`
  );
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const start = Date.now();

  // DB status
  let dbStatus  = 'disconnected';
  let dbLatency = null;
  let dbName    = null;
  try {
    const states  = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    dbStatus = states[mongoose.connection.readyState] || 'unknown';
    if (mongoose.connection.readyState === 1) {
      const t0 = Date.now();
      await mongoose.connection.db.admin().ping();
      dbLatency = `${Date.now() - t0}ms`;
      dbName    = mongoose.connection.name;
    }
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  // Integrations
  const { isCloudinaryConfigured } = await import('./config/cloudinary.js');
  const { isStripeConfigured }     = await import('./config/stripe.js');
  const { isPaystackConfigured }   = await import('./config/paystack.js');

  const mem     = process.memoryUsage();
  const toMB    = (b) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  const healthy = dbStatus === 'connected';

  res.status(healthy ? 200 : 503).json({
    status:       healthy ? 'healthy' : 'degraded',
    timestamp:    new Date().toISOString(),
    responseTime: `${Date.now() - start}ms`,
    environment:  process.env.NODE_ENV || 'development',
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

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── DB connection (cached across warm serverless invocations) ─────────────────
connectDB();

// ── Local dev only ────────────────────────────────────────────────────────────
if (!IS_VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 OneKindAct API → http://localhost:${PORT}`);
    console.log(`   Env         : ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Frontend    : ${process.env.FRONTEND_URL || 'http://localhost:5173'}\n`);
  });
}

export default app;
