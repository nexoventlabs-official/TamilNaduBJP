const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Sentry = require('@sentry/node');
const redis = require('../redis');

/**
 * Build a Redis-backed store for a limiter, or return undefined to
 * fall back to express-rate-limit's default in-memory store.
 * Each limiter gets a distinct prefix so their counters never collide.
 * @param {string} prefix - unique key prefix, e.g. 'rl:otp:'
 */
// FIX-08: warn (log + Sentry) when a limiter silently falls back to the
// in-memory store. Under PM2 cluster mode each worker keeps its own counter,
// so the effective limit is multiplied by the worker count — a real security
// weakening for OTP/admin brute-force guards. We can't avoid the fallback when
// Redis is down, but we must be alerted the moment it happens.
let _fallbackAlerted = false;
function makeStore(prefix) {
  if (!redis.client) {
    console.warn(`[RateLimit] Redis unavailable — ${prefix} using in-memory store (NOT safe for multi-process)`);
    // Alert once per process start to avoid Sentry noise on repeated calls.
    if (!_fallbackAlerted) {
      _fallbackAlerted = true;
      try {
        Sentry.captureMessage('Rate limiter using in-memory fallback — Redis unavailable', { level: 'warning' });
      } catch (_) { /* Sentry not initialised — the console.warn above still fires */ }
    }
    return undefined; // no REDIS_URL / Redis down → express-rate-limit in-memory
  }
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,
  });
}

/**
 * Key a limiter by the request's mobile number (from the JSON body) instead of
 * IP, falling back to IP when no valid mobile is present. Indian mobile carriers
 * use carrier-grade NAT, so thousands of distinct users can share one public IP;
 * keying OTP/enumeration limiters by IP would falsely throttle them at scale.
 * Per-mobile abuse is still fully blocked (plus the 60s cooldown + unique index).
 */
function mobileKey(req) {
  const m = String(req.body?.mobile || '').replace(/\D/g, '');
  return m.length >= 10 ? m.slice(-10) : req.ip;
}

/**
 * Factory for creating rate limiters.
 * @param {number} maxRequests   - max requests allowed in window
 * @param {number} windowSeconds - window duration in seconds
 * @param {string} prefix        - unique Redis key prefix for this limiter
 * @param {function} [keyGenerator] - optional custom key function (defaults to IP)
 */
function createRateLimiter(maxRequests, windowSeconds, prefix = 'rl:generic:', keyGenerator) {
  if (process.env.DISABLE_RATE_LIMITER === 'true') {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs: windowSeconds * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(prefix),
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (req, res) => {
      const route = req.originalUrl || req.url;
      const key = keyGenerator ? keyGenerator(req) : req.ip;
      Sentry.captureMessage(`Rate limit exceeded: ${key} on ${route}`, {
        level: 'warning',
        extra: { key, route }
      });
      res.status(429).json({
        success: false,
        message: `Rate limit exceeded. Try again in ${Math.ceil(windowSeconds / 60)} minute(s).`,
      });
    },
  });
}

// Admin login — 5 attempts per 15 min
const adminLoginLimiter = createRateLimiter(5, 15 * 60, 'rl:adminlogin:');

// Admin OTP login (mobile-keyed). Send has its own 60s cooldown in the route;
// these bound abuse per mobile without locking the small admin whitelist out.
const adminOtpSendLimiter   = createRateLimiter(5, 10 * 60, 'rl:adminotpsend:', mobileKey);
const adminOtpVerifyLimiter = createRateLimiter(8, 10 * 60, 'rl:adminotpverify:', mobileKey);

// OTP send (send-otp) — 3 sends per 5 min, keyed by mobile (not IP) so users
// behind a shared carrier NAT aren't throttled by each other at scale.
const chatOtpLimiter = createRateLimiter(3, 5 * 60, 'rl:otp:', mobileKey);

// OTP verification — 5 attempts per 15 min (brute-force guard), keyed by mobile.
const chatVerifyOtpLimiter = createRateLimiter(5, 15 * 60, 'rl:verifyotp:', mobileKey);

// Mobile-registration check — 5 checks per 5 min (enumeration guard, FIX-05),
// keyed by mobile so a shared NAT IP doesn't block legitimate concurrent users.
const chatCheckMobileLimiter = createRateLimiter(5, 5 * 60, 'rl:checkmobile:', mobileKey);

// Card generation — 15 attempts per 10 min, keyed by session mobile (not IP).
// Multiple members can share the same mobile carrier NAT IP; using session
// mobile as the key prevents one user from exhausting another's quota.
const chatGenerateCardLimiter = process.env.DISABLE_RATE_LIMITER === 'true'
  ? (req, res, next) => next()
  : rateLimit({
      windowMs: 10 * 60 * 1000, // 10 minutes
      max: 15,
      standardHeaders: true,
      legacyHeaders: false,
      store: makeStore('rl:gencard:'),
      // Key by session mobile if available, fall back to IP
      keyGenerator: (req) => req.session?.verified_mobile || req.ip,
      handler: (req, res) => {
        const key = req.session?.verified_mobile || req.ip;
        const route = req.originalUrl || req.url;
        Sentry.captureMessage(`Card generation rate limit exceeded for: ${key}`, {
          level: 'warning',
          extra: { key, route }
        });
        res.status(429).json({
          success: false,
          message: 'Too many card generation attempts. Please wait a few minutes and try again.',
        });
      },
    });

// EPIC validation — 10 per 60 s
const chatValidateEpicLimiter = createRateLimiter(10, 60, 'rl:validateepic:');

// Public verify endpoint — 10 per minute (enumeration guard)
const publicVerifyLimiter = createRateLimiter(10, 60, 'rl:publicverify:');

module.exports = {
  createRateLimiter,
  adminLoginLimiter,
  adminOtpSendLimiter,
  adminOtpVerifyLimiter,
  chatOtpLimiter,
  chatVerifyOtpLimiter,
  chatGenerateCardLimiter,
  chatValidateEpicLimiter,
  chatCheckMobileLimiter,
  publicVerifyLimiter,
};
