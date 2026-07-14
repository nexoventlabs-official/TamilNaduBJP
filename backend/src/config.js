require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';

// ── Startup secret validations ────────────────────────────────────
if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
  throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD_HASH must be set in .env');
}

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be set and at least 32 characters long');
}

if (nodeEnv === 'production' && !process.env.BASE_URL) {
  throw new Error('BASE_URL must be set in production');
}

// FIX-13: fail fast if B2 storage credentials are missing — otherwise photo
// uploads silently fail and members register with broken (empty) photos.
if (!process.env.B2_KEY_ID || !process.env.B2_APP_KEY || !process.env.B2_BUCKET_NAME) {
  throw new Error('B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME must be set in .env — photo uploads require them');
}

// FIX-14: surface a missing SMS key loudly at startup.
// NOTE: this is a WARNING (not a hard throw) on purpose — the web flow has no
// OTP step yet, so SMS is not required to run today, and a throw would crash
// the live site. Once OTP login goes live (registration depends on SMS
// delivery), promote this to a hard throw so a missing/rotated key fails the
// deploy immediately instead of silently blocking every registration.
if (!process.env.SMS_API_KEY) {
  if (nodeEnv === 'production') {
    console.warn('[Startup] ⚠️  SMS_API_KEY is NOT set — OTP delivery will fail. Web still runs (no OTP step yet). Set it before enabling OTP login.');
  } else {
    console.warn('[Startup] SMS_API_KEY not set — OTP sends will use the dev mock.');
  }
}

const config = {
  port:    process.env.PORT    || 5000,
  nodeEnv,

  // ── DB2: App data (Atlas) — writes happen here ──────────────────
  mongoUri: process.env.MONGO_URI || '',
  mongoDb:  process.env.MONGO_DB  || 'bjptamilnadu',

  // ── DB1: Voter roll (DigitalOcean) — READ-ONLY ──────────────────
  mongoVoterUrl:    process.env.MONGO_VOTER_URL    || '',
  mongoVoterDbName: process.env.MONGO_VOTER_DB_NAME || 'voter_db',

  // ── Redis (shared cache, rate limiting, sessions) ───────────────
  // If unset, the app falls back to in-memory cache + MongoDB sessions
  // (correct for a single instance only).
  redisUrl: process.env.REDIS_URL || '',

  b2: {
    endpoint:   process.env.B2_ENDPOINT     || 's3.us-east-005.backblazeb2.com',
    keyId:      process.env.B2_KEY_ID       || '',
    appKey:     process.env.B2_APP_KEY      || '',
    bucketName: process.env.B2_BUCKET_NAME  || 'bjpmembers',
    region:     process.env.B2_REGION       || 'us-east-005',
  },

  admin: {
    username:     process.env.ADMIN_USERNAME,
    passwordHash: process.env.ADMIN_PASSWORD_HASH,
  },

  smsApiKey:          process.env.SMS_API_KEY          || '',
  // 2factor approved OTP template name (e.g. 'OTP1', sender id SULTNE).
  // When set, OTP SMS is sent using this DLT-approved template.
  smsTemplateName:    process.env.SMS_TEMPLATE_NAME     || '',
  whatsappChannelUrl: process.env.WHATSAPP_CHANNEL_URL || '',

  // WhatsApp Cloud API
  whatsapp: {
    verifyToken:    process.env.WHATSAPP_VERIFY_TOKEN    || '',
    appId:          process.env.WHATSAPP_APP_ID           || '',
    appSecret:      process.env.WHATSAPP_APP_SECRET       || '',
    accessToken:    process.env.WHATSAPP_ACCESS_TOKEN     || '',
    phoneNumberId:  process.env.WHATSAPP_PHONE_NUMBER_ID  || '',
    wabaId:         process.env.WHATSAPP_WABA_ID          || '',
    // RSA private key for decrypting WhatsApp Flow requests (optional)
    // Set WHATSAPP_FLOW_PRIVATE_KEY in .env (newlines as \n)
    flowPrivateKey: process.env.WHATSAPP_FLOW_PRIVATE_KEY || '',
    flows: {
      registrationId: process.env.WHATSAPP_FLOW_REGISTRATION_ID || '',
      loginId:        process.env.WHATSAPP_FLOW_LOGIN_ID        || '',
    },
  },

  baseUrl:       process.env.BASE_URL       || 'http://localhost:5000',
  frontendUrl:   process.env.FRONTEND_URL   || 'https://we-the-leader.vercel.app',
  // Comma-separated list of extra allowed CORS origins e.g. preview deploy URLs
  extraOrigins:  process.env.EXTRA_ORIGINS
    ? process.env.EXTRA_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
    : [],
  sessionSecret: process.env.SESSION_SECRET,
};

module.exports = config;
