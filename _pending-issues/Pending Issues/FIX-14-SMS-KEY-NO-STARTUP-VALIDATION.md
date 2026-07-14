# FIX-14 — SMS API Key Not Validated at Startup Silently Blocks All Registrations

**Severity:** MEDIUM (Operational Risk)  
**File:** `backend/src/config.js` — Line 48  
**Estimated Fix Time:** 5 minutes  
**Downtime Required:** Server restart (validation happens at startup)

---

## What Is the Issue?

The SMS API key is loaded with an empty string default and no startup validation:

```javascript
smsApiKey: process.env.SMS_API_KEY || '',  // ← empty = no startup error
```

If `SMS_API_KEY` is missing, empty, or rotated in `.env`, the server starts cleanly. The first member who tries to register enters their mobile number and waits. No OTP arrives. The send-otp route calls `sendOtp(mobile, otp)` with a blank or invalid API key. The SMS service returns an error, which the route handler converts to:

```json
HTTP 500: {"success":false,"message":"Could not send OTP. Please try again."}
```

The member retries. They hit the 60-second cooldown. They wait and retry again. Still nothing. **No one can register.** Meanwhile, the server health check is green, PM2 shows online, and startup logs show no errors.

---

## How It Affects the Drive

- The entire registration flow depends on OTP delivery — without it, zero registrations can be completed
- If SMS credentials are rotated or accidentally cleared in a deploy, the drive stops silently
- On launch day with 10,000 people trying to register, this means 10,000 failures in the first hour with no obvious server-side alarm
- Support gets flooded: "OTP not received"
- Your team scrambles to diagnose — they check the server (green), check MongoDB (no new records), check Sentry (sees SMS service errors, but you have to look)
- This can take 30–60 minutes to diagnose and fix during a high-pressure launch moment
- If the SMS provider requires a new API key format or the key expires, same scenario

---

## The Fix

Add SMS API key validation to startup.

**File:** `backend/src/config.js` — add after B2 validation:

```javascript
// BEFORE
smsApiKey: process.env.SMS_API_KEY || '',
```

**Add to the startup validation block (around line 14):**

```javascript
// AFTER — add this to the startup throws block
if (!process.env.SMS_API_KEY) {
  throw new Error('SMS_API_KEY must be set in .env — OTP sending will not work without it');
}
```

This ensures the server refuses to start without an SMS key. PM2 immediately shows "errored" status with the exact message — visible in seconds.

---

## Deploy Steps

```bash
# 1. Verify your .env has SMS_API_KEY set:
grep "SMS_API_KEY" /var/www/bjptn/backend/.env
# Expected: SMS_API_KEY=your_actual_key_here

# 2. Add the validation to config.js

# 3. Deploy
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend

# 4. Verify server started
pm2 list
# status should be: online
```

---

## How Success Looks

**1. Server refuses to start if SMS_API_KEY is missing**
```bash
# Temporarily remove SMS_API_KEY from .env, then restart:
pm2 restart bjptn-backend
pm2 list
# Expected: status = errored

pm2 logs bjptn-backend --lines 5
# Expected: Error: SMS_API_KEY must be set in .env
```

**2. Server starts cleanly when key is present**
```bash
pm2 list
# status = online ✅
```

**3. OTP delivery works end-to-end after deploy**
```bash
# Test from the registration page:
# Enter a mobile number → click Send OTP → OTP arrives via SMS within 30 seconds
```

**4. No silent registration failures on launch day**
- Any deploy with missing SMS credentials fails loudly at startup
- The team sees the error before any users are affected
- Launch day OTP delivery is verified in the pre-launch checklist by successfully completing a test registration
