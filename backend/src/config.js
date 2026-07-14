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
