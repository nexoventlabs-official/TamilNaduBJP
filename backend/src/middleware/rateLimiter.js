const rateLimit = require('express-rate-limit');

/**
 * Factory for creating rate limiters.
 * @param {number} maxRequests  - max requests allowed in window
 * @param {number} windowSeconds - window duration in seconds
 */
function createRateLimiter(maxRequests, windowSeconds) {
  if (process.env.DISABLE_RATE_LIMITER === 'true') {
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs: windowSeconds * 1000,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: `Rate limit exceeded. Try again in ${Math.ceil(windowSeconds / 60)} minute(s).`,
      });
    },
  });
}

// Admin login — 5 attempts per 15 min
const adminLoginLimiter = createRateLimiter(5, 15 * 60);

// OTP send (send-otp, forgot-pin) — 3 sends per 5 min
const chatOtpLimiter = createRateLimiter(3, 5 * 60);

// OTP / PIN verification — 5 attempts per 15 min (brute-force guard)
const chatVerifyOtpLimiter = createRateLimiter(5, 15 * 60);
const chatVerifyPinLimiter = createRateLimiter(5, 15 * 60);

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
      // Key by session mobile if available, fall back to IP
      keyGenerator: (req) => req.session?.verified_mobile || req.ip,
      handler: (req, res) => {
        res.status(429).json({
          success: false,
          message: 'Too many card generation attempts. Please wait a few minutes and try again.',
        });
      },
    });

// EPIC validation — 10 per 60 s
const chatValidateEpicLimiter = createRateLimiter(10, 60);

// Public verify endpoint — 10 per minute (enumeration guard)
const publicVerifyLimiter = createRateLimiter(10, 60);

module.exports = {
  createRateLimiter,
  adminLoginLimiter,
  chatOtpLimiter,
  chatVerifyOtpLimiter,
  chatVerifyPinLimiter,
  chatGenerateCardLimiter,
  chatValidateEpicLimiter,
  publicVerifyLimiter,
};
