/**
 * Security utilities — ported from security_fixes.py
 * Uses Node.js crypto with PBKDF2-SHA256 matching Python's hashlib.pbkdf2_hmac
 */
const crypto = require('crypto');

/**
 * Track failed admin login attempts per IP — ported from LoginAttemptTracker class.
 */
class LoginAttemptTracker {
  constructor() {
    // { ip: [(timestamp, username), ...] }
    this.attempts = new Map();
  }

  recordAttempt(ip, username, success) {
    const now = Date.now() / 1000;
    if (!this.attempts.has(ip)) this.attempts.set(ip, []);

    // Clean attempts older than 1 hour
    let list = this.attempts.get(ip).filter(([ts]) => now - ts < 3600);

    if (!success) {
      list.push([now, username]);
    }
    this.attempts.set(ip, list);
  }

  isLocked(ip, maxAttempts = 5, lockoutMinutes = 15) {
    const list = this.attempts.get(ip);
    if (!list || list.length === 0) return { locked: false, retryAfter: null };

    const now = Date.now() / 1000;
    const lockoutSeconds = lockoutMinutes * 60;
    const recent = list.filter(([ts]) => now - ts < lockoutSeconds);

    if (recent.length >= maxAttempts) {
      const oldest = Math.min(...recent.map(([ts]) => ts));
      const retryAfter = Math.ceil(lockoutSeconds - (now - oldest)) + 1;
      return { locked: true, retryAfter };
    }
    return { locked: false, retryAfter: null };
  }

  reset(ip) {
    this.attempts.delete(ip);
  }
}

module.exports = { LoginAttemptTracker };
