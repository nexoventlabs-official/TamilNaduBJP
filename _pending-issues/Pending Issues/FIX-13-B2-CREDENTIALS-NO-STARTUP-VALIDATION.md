# FIX-13 — B2 Credentials Not Validated at Startup

**Severity:** MEDIUM (Operational Risk)  
**File:** `backend/src/config.js` — Lines 35–41  
**Estimated Fix Time:** 10 minutes  
**Downtime Required:** Server restart (validation happens at startup)

---

## What Is the Issue?

Backblaze B2 credentials are loaded with empty string defaults and no startup validation:

```javascript
b2: {
  endpoint:   process.env.B2_ENDPOINT     || 's3.us-east-005.backblazeb2.com',
  keyId:      process.env.B2_KEY_ID       || '',   // ← empty = no error
  appKey:     process.env.B2_APP_KEY      || '',   // ← empty = no error
  bucketName: process.env.B2_BUCKET_NAME  || 'bjpmembers',
  region:     process.env.B2_REGION       || 'us-east-005',
},
```

Unlike `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and `BASE_URL` (which throw at startup if missing), missing B2 credentials cause the server to start cleanly with a green health check.

When the first member uploads a photo, `uploadPhoto()` is called with empty credentials. The B2 SDK returns an authentication error. This error is caught and swallowed in the generate-card handler (Issue #3) — so the registration appears to succeed but `photo_url` is empty.

---

## How It Affects the Drive

- A deploy with missing or rotated B2 credentials causes 100% photo upload failure
- The server starts normally — PM2 shows green, health check passes, no errors in startup logs
- First registration attempt fails silently — the member sees "success" but has no photo
- Without Sentry, you won't know for hours
- Even with Sentry, the error is tagged as a photo upload failure — not an obvious "server misconfigured" alert
- If B2 credentials are accidentally rotated or the bucket name changes, the entire drive's photos stop being saved silently
- After fixing Issue #3 (photo upload failure returns an error), members will at least see an error — but you still won't know it's a configuration problem vs. a transient B2 outage

---

## The Fix

Add B2 credential validation to the startup checks in `config.js`.

**File:** `backend/src/config.js` — add after the existing startup validations (around line 16):

```javascript
// BEFORE — no B2 validation
if (nodeEnv === 'production' && !process.env.BASE_URL) {
  throw new Error('BASE_URL must be set in production');
}
```

```javascript
// AFTER — add B2 validation
if (nodeEnv === 'production' && !process.env.BASE_URL) {
  throw new Error('BASE_URL must be set in production');
}

if (!process.env.B2_KEY_ID || !process.env.B2_APP_KEY || !process.env.B2_BUCKET_NAME) {
  throw new Error('B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME must be set in .env — photo uploads will not work without them');
}
```

This ensures the server refuses to start with missing B2 credentials. PM2 will show the process as "errored" with the exact error message in logs — immediately visible.

---

## Deploy Steps

```bash
# 1. Add the validation to config.js
# 2. Verify your .env has all three B2 variables set:
grep "B2_" /var/www/bjptn/backend/.env
# Expected output:
# B2_KEY_ID=xxxxxxxxxxxxx
# B2_APP_KEY=xxxxxxxxxxxxx
# B2_BUCKET_NAME=bjpmembers
# (B2_ENDPOINT and B2_REGION have safe defaults)

# 3. Deploy
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend

# 4. Verify the server started (not errored)
pm2 list
```

---

## How Success Looks

**1. Server refuses to start if B2 credentials are missing**
```bash
# Temporarily remove B2_KEY_ID from .env, then restart:
pm2 restart bjptn-backend
pm2 list
# Expected: status = errored

pm2 logs bjptn-backend --lines 10
# Expected: Error: B2_KEY_ID, B2_APP_KEY, and B2_BUCKET_NAME must be set in .env
```

**2. Server starts cleanly when credentials are present**
```bash
# With correct B2 credentials in .env:
pm2 list
# status = online ✅
```

**3. No more silent photo failures from misconfiguration**
- Any deploy with missing B2 credentials fails loudly at startup
- On-call team sees the PM2 error immediately
- No members are silently registered with empty `photo_url` due to missing credentials

**4. Verify B2 upload works after deploy**
```bash
# Run a test registration end-to-end after deploy
# Check the resulting record in MongoDB:
# db.generated_voters.findOne({MOBILE_NO: "9876543210"}, {photo_url: 1})
# Expected: photo_url contains a valid B2 URL (not empty string)
```
