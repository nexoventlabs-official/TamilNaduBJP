/**
 * BJP Tamil Nadu — Express API Server
 * =====================================
 * Node.js port of Flask app.py
 * Lead the Change
 */
require('dotenv').config();

const Sentry = require('@sentry/node');

// Initialize Sentry before requiring other route modules to ensure auto-instrumentation works
Sentry.init({
  dsn: "https://9beaab4828c82c718969bbcb7d4db92b@o4511709522886656.ingest.us.sentry.io/4511709628989441",

  // Sample 10% of transactions to stay within the Sentry free tier
  tracesSampleRate: 0.1,

  // Environment tracking (production vs development)
  environment: process.env.NODE_ENV || 'development',

  // Release tracking — helps identify which version introduced a bug
  release: `tnbjp-backend@${require('../package.json').version}`,

  // Server name — useful once scaled to multiple droplets
  serverName: process.env.SERVER_NAME || require('os').hostname(),

  // Security: scrub sensitive fields before anything leaves the server
  beforeSend(event) {
    const sensitiveFields = ['otp', 'pin', 'new_pin', 'password', 'secret_pin'];
    if (event.request && event.request.data) {
      sensitiveFields.forEach((field) => {
        if (event.request.data[field] !== undefined) {
          event.request.data[field] = '[REDACTED]';
        }
      });
    }
    if (event.extra) {
      sensitiveFields.forEach((field) => {
        if (event.extra[field] !== undefined) {
          event.extra[field] = '[REDACTED]';
        }
      });
    }
    return event;
  },
});

const express    = require('express');
const session    = require('express-session');
const MongoStore = require('connect-mongo');
const RedisSessionStore = require('./redisSessionStore');
const redis      = require('./redis');
const cors       = require('cors');
const helmet     = require('helmet');
const crypto     = require('crypto');
const path       = require('path');
const cookieParser = require('cookie-parser');
const config     = require('./config');
const { connectDB } = require('./db');

// ── Route modules ─────────────────────────────────────────────────
const chatRoutes    = require('./routes/chat');
const adminRoutes   = require('./routes/admin');
const publicRoutes  = require('./routes/public');
const webhookRoutes = require('./routes/webhook');
const flowRoutes    = require('./routes/flow');
const { router: uploadRoutes } = require('./routes/upload');

const app = express();

// ── Trust proxy (Render + Cloudflare sit in front) ────────────────
// Required for secure cookies and correct req.ip behind a reverse proxy
app.set('trust proxy', 1);

// ── Warn if insecure cookie in non-production ─────────────────────
if (config.nodeEnv !== 'production') {
  console.warn('⚠️  NODE_ENV is not production — secure cookies disabled, CSP relaxed');
}

// ── Security headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? {
    directives: {
      defaultSrc: ["'self'", 'https://res.cloudinary.com'],
      imgSrc:     ["'self'", 'https://res.cloudinary.com', 'data:'],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://cdn.jsdelivr.net'],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com', 'https://cdn.jsdelivr.net'],
      connectSrc: ["'self'", config.frontendUrl, config.baseUrl].filter(Boolean),
    },
  } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  res.setHeader('Referrer-Policy',        'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy',     'geolocation=(), microphone=(), camera=()');

  if (req.path.startsWith('/static/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.path.startsWith('/admin') || req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private, max-age=0');
    res.setHeader('Pragma',  'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ── CORS ──────────────────────────────────────────────────────────
// Meta webhook & flow endpoints are server-to-server — skip origin check.
// All other routes restrict to known origins in production.
const allowedOrigins = config.nodeEnv === 'development'
  ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000']
  : [
      config.baseUrl,
      config.frontendUrl,
      ...(config.extraOrigins || []),
    ].filter(Boolean);

const META_PATHS_RE = /^\/api\/webhook(\/flow)?(\/|$)/;

app.use((req, res, next) => {
  // Meta server-to-server paths — allow any origin, no credentials
  if (META_PATHS_RE.test(req.path)) {
    return cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] })(req, res, next);
  }
  // All other routes — enforce origin allowlist
  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      const isAllowed = allowedOrigins.some(allowed => {
        if (allowed === origin) return true;
        const normalize = url => url.replace(/^https?:\/\/(www\.)?/, "");
        return normalize(allowed) === normalize(origin);
      });
      if (isAllowed) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials:    true,
    methods:        ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })(req, res, next);
});

// ────────────────────────────────────────────────────────────────
// Body-parsing order matters:
//
//  /api/webhook/flow  → express.json() (handled inside flow.js)
//  /api/webhook       → express.raw()  for HMAC-SHA256 on Meta messages
//
// The raw middleware MUST be scoped to the exact /api/webhook path
// (not /api/webhook/*) so it does NOT consume the body for /api/webhook/flow.
// ────────────────────────────────────────────────────────────────

// WhatsApp Flow endpoint — body parsed by express.json() inside flow.js
app.use('/api/webhook/flow', flowRoutes);

// WhatsApp message webhook — raw body required for HMAC-SHA256
// Use a path regex that matches /api/webhook exactly (no sub-paths like /flow)
app.use(/^\/api\/webhook$/, express.raw({ type: 'application/json' }));
app.use('/api/webhook', webhookRoutes);

// ── Body parsers (all other routes) ──────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser — required by csrf-csrf (populates req.cookies)
app.use(cookieParser());

// ── Sessions ──────────────────────────────────────────────────────
// Prefer Redis (shared across instances, fast); fall back to MongoDB.
const sessionStore = redis.client
  ? new RedisSessionStore({ client: redis.client, prefix: 'sess:', ttl: 86400 })
  : MongoStore.create({
      mongoUrl:       config.mongoUri,
      dbName:         config.mongoDb,
      collectionName: 'sessions',
      ttl:            86400,
      autoRemove:     'native',
    });
console.log(`[Session] Using ${redis.client ? 'Redis' : 'MongoDB'} store`);

app.use(session({
  secret:            config.sessionSecret,
  resave:            false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure:   config.nodeEnv === 'production',
    maxAge:   86400 * 1000,
  },
  name: 'bjp.session',
}));

// ── Static files ──────────────────────────────────────────────────
// NOTE: Frontend is deployed separately on Vercel.
// The backend only serves assets from /static (e.g. banner images for OG tags).
const staticDir = path.join(__dirname, '../../../static');
if (require('fs').existsSync(staticDir)) {
  app.use('/static', express.static(staticDir, { maxAge: '7d' }));
}

// ── Health check endpoint (required by Render) ──────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── CSRF protection for admin state-changing routes (FIX-08) ──────
// Double-submit cookie pattern via csrf-csrf. The admin UI fetches a
// token from /admin/api/csrf-token and echoes it in the X-CSRF-Token
// header on every mutating request. A cross-site attacker cannot read
// the token (same-origin policy) so forged POSTs are rejected.
const { doubleCsrf } = require('csrf-csrf');
const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret:            () => config.sessionSecret,
  getSessionIdentifier: (req) => req.sessionID || '',
  cookieName:           config.nodeEnv === 'production' ? '__Host-bjp.csrf' : 'bjp.csrf',
  cookieOptions: {
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure:   config.nodeEnv === 'production',
    path:     '/',
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});

// Endpoint the admin frontend calls to obtain a CSRF token
app.get('/admin/api/csrf-token', (req, res) => {
  return res.json({ success: true, csrfToken: generateCsrfToken(req, res) });
});

// Enforce CSRF on admin mutating requests (safe methods + login are exempt)
app.use('/admin/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const pathOnly = (req.originalUrl || '').split('?')[0];
  if (pathOnly.endsWith('/admin/api/login')) return next(); // login has no prior token
  return doubleCsrfProtection(req, res, next);
});

// ── API Routes ────────────────────────────────────────────────────
app.use('/api',    chatRoutes);
app.use('/admin',  adminRoutes);
app.use('/upload', uploadRoutes);
app.use('/',       publicRoutes);

// ── 404 fallback ─────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// The Sentry error handler must be registered before any other error middleware
Sentry.setupExpressErrorHandler(app);

// ── Global error handler — never leak stack traces ────────────────
app.use((err, req, res, _next) => {
  // CSRF validation failures (FIX-08) → 403, not 500
  if (err === invalidCsrfTokenError || err?.code === 'EBADCSRFTOKEN' || err?.code === 'ERR_BAD_CSRF_TOKEN') {
    if (res.headersSent) return _next(err);
    return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token.' });
  }
  const correlationId = crypto.randomUUID();
  if (config.nodeEnv === 'production') {
    console.error(`[${correlationId}] Unhandled error: ${err.message}`);
  } else {
    console.error(`[${correlationId}]`, err);
  }
  if (res.headersSent) {
    return _next(err);
  }
  res.status(500).json({ success: false, message: 'Internal server error', ref: correlationId });
});

// ── Start server ─────────────────────────────────────────────────
async function startServer() {
  await connectDB();

  app.listen(config.port, () => {
    console.log('─────────────────────────────────────────');
    console.log('  WE THE LEADERS — Lead the Change');
    console.log(`  API server running on port ${config.port}`);
    console.log(`  Environment : ${config.nodeEnv}`);
    console.log(`  Base URL    : ${config.baseUrl}`);
    console.log('─────────────────────────────────────────');
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

module.exports = app;
