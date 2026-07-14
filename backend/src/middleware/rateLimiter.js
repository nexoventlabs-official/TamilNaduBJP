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
function makeStore(prefix) {
  if (!redis.client) return undefined; // no REDIS_URL → in-memory
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,
  });
}

/**
 * Factory for creating rate limiters.
 * @param {number} maxRequests  - max requests allowed in window
 * @param {number} windowSeconds - window duration in seconds
 * @param {string} prefix       - unique Redis key prefix for this limiter
 */
function createRateLimiter(maxRequests, windowSeconds, prefix = 'rl:generic:') {
  if (process.env.DISABLE_RATE_LIMITER === 'true') {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs: windowSeconds * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    store: makeStore(prefix),
    handler: (req, res) => {
      const route = req.originalUrl || req.url;
      Sentry.captureMessage(`Rate limit exceeded: ${req.ip} on ${route}`, {
        level: 'warning',
        extra: { ip: req.ip, route }
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

// OTP send (send-otp) — 3 sends per 5 min
const chatOtpLimiter = createRateLimiter(3, 5 * 60, 'rl:otp:');

// OTP verification — 5 attempts per 15 min (brute-force guard)
const chatVerifyOtpLimiter = createRateLimiter(5, 15 * 60, 'rl:verifyotp:');

// Mobile-registration check — 5 checks per 5 min (enumeration guard, FIX-05)
const chatCheckMobileLimiter = createRateLimiter(5, 5 * 60, 'rl:checkmobile:');

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
  chatOtpLimiter,
  chatVerifyOtpLimiter,
  chatGenerateCardLimiter,
  chatValidateEpicLimiter,
  chatCheckMobileLimiter,
  publicVerifyLimiter,
};
