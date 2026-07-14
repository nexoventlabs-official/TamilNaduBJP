# FIX-08 — Rate Limiters Fall Back to Per-Process Memory on Redis Down

**Severity:** HIGH  
**File:** `backend/src/middleware/rateLimiter.js` — Line 13  
**Estimated Fix Time:** 20 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

All rate limiters are built with a Redis-backed store. But if Redis is unavailable (outage, reconnection delay, misconfiguration), the `makeStore()` function returns `undefined`:

```javascript
function makeStore(prefix) {
  if (!redis.client) return undefined; // ← falls back silently
  return new RedisStore({ ... });
}
```

When `store: undefined` is passed to `express-rate-limit`, it uses its default **in-memory store**. Each PM2 worker process has its own independent in-memory counter.

With 4 PM2 cluster workers:
- OTP send limit (3 per 5 min) becomes effectively **12 per 5 min** (3 × 4 workers)
- OTP verify limit (5 per 15 min) becomes **20 per 15 min**
- Admin login limit (5 per 15 min) becomes **20 per 15 min**

Each worker counts independently — a user hitting different workers gets fresh counters each time.

---

## How It Affects the Drive

- **OTP brute force:** An attacker can try 20 OTP guesses per 15 minutes instead of 5. 6-digit OTPs have 1,000,000 combinations. With 20 guesses per 15 minutes = 1,920 guesses per day. Targeted attacks on known mobile numbers become feasible.
- **Admin login brute force:** 20 attempts per 15 minutes against the admin panel instead of 5
- **During Redis reconnection:** All pent-up requests that were queued fire simultaneously when Redis comes back. The burst bypasses rate limits for that window.
- **Silent degradation:** There is no log warning when the fallback activates. You won't know the rate limits are broken until after an incident.
- This matters most after switching to PM2 cluster mode (4 workers), which is the next planned change

---

## The Fix

Two changes:

**1. Log a warning when falling back to in-memory store**

**File:** `backend/src/middleware/rateLimiter.js` — replace `makeStore`:

```javascript
// BEFORE
function makeStore(prefix) {
  if (!redis.client) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,
  });
}
```

```javascript
// AFTER
function makeStore(prefix) {
  if (!redis.client) {
    console.warn(`[RateLimit] Redis unavailable — ${prefix} using in-memory store (NOT safe for multi-process)`);
    return undefined;
  }
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,
  });
}
```

**2. Alert via Sentry when falling back (so you know in production)**

```javascript
function makeStore(prefix) {
  if (!redis.client) {
    const msg = `Rate limiter ${prefix} using in-memory fallback — Redis unavailable`;
    console.warn(`[RateLimit] ${msg}`);
    Sentry.captureMessage(msg, { level: 'warning' });
    return undefined;
  }
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,
  });
}
```

Add `const Sentry = require('@sentry/node');` at the top of the file (already imported for the handler, check if it's already there).

**Note:** The underlying issue (in-memory fallback) cannot be fully fixed without Redis being available. The fix ensures you are immediately alerted when it happens so you can act.

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. Warning appears in logs if Redis goes down**
```bash
pm2 logs bjptn-backend
# If Redis disconnects, you will see:
# [RateLimit] Redis unavailable — rl:otp: using in-memory store (NOT safe for multi-process)
```

**2. Sentry alert fires immediately**
- In Sentry dashboard, a Warning-level event appears: "Rate limiter rl:otp: using in-memory fallback"
- You know within seconds that rate limits are weakened

**3. Normal operation — Redis is up**
```bash
redis-cli -u $REDIS_URL ping
# PONG

# Rate limits work correctly — a single IP hitting OTP send 4 times in 5 minutes:
# 4th attempt: HTTP 429 "Rate limit exceeded. Try again in 5 minute(s)."
# This works correctly across all 4 PM2 workers when Redis is up
```

**4. Verify Redis store is active**
```bash
redis-cli -u $REDIS_URL keys "rl:otp:*"
# Should show keys like: rl:otp:103.xxx.xxx.xxx
# If keys appear here, Redis store is active (not in-memory)
```
