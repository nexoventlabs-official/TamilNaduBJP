# Sentry Optimization - URGENT Fixes (30 Minutes)

## Context
This BJP Tamil Nadu membership application is currently live at www.tnbjp.org with Sentry installed but improperly configured. These urgent fixes will prevent exceeding the free tier and address security vulnerabilities.

---

## Issue 1: Transaction Sampling Rate Too High ⚠️ CRITICAL

### Problem
**Current Configuration:**
```javascript
// backend/src/index.js line 12-15
Sentry.init({
  dsn: "https://9beaab4828c82c718969bbcb7d4db92b@o4511709522886656.ingest.us.sentry.io/4511709628989441",
  tracesSampleRate: 1.0,  // ← Tracking 100% of transactions
});
```

**Why This is a Problem:**
- Application handles ~500 card generations/day + ~2,000 API calls/day = **~75,000 transactions/month**
- Sentry free tier limit: **10,000 transactions/month**
- **Currently exceeding by 7.5x** - will quickly hit paid tier ($26/month)
- With `tracesSampleRate: 1.0`, every single API call is tracked and sent to Sentry
- This wastes bandwidth and storage unnecessarily

**Business Impact:**
- Unexpected costs when free tier exceeded
- Quota exhausted mid-month = no monitoring when you need it
- Performance overhead from tracking every transaction

### Solution
Change transaction sampling from 100% to 10% in both backend and frontend.

**Backend Changes:**
File: `backend/src/index.js`
```javascript
// Line 12-15 - UPDATE THIS:
Sentry.init({
  dsn: "https://9beaab4828c82c718969bbcb7d4db92b@o4511709522886656.ingest.us.sentry.io/4511709628989441",
  tracesSampleRate: 0.1,  // ← Changed from 1.0 to 0.1 (track 10% of transactions)
});
```

**Frontend Changes:**
File: `frontend/src/main.jsx`
```javascript
// Line 8-11 - UPDATE THIS:
Sentry.init({
  dsn: "https://e857576d03d7f74b12d4708d13cf8022@o4511709522886656.ingest.us.sentry.io/4511709631545344",
  tracesSampleRate: 0.1,  // ← Changed from 1.0 to 0.1 (track 10% of transactions)
})
```

**Why 10% is Sufficient:**
- 10% sampling = 7,500 transactions/month (within free tier)
- Still provides statistically significant performance data
- Identifies slow operations and patterns
- Standard industry practice for production monitoring
- Can be increased to 0.2 (20%) or 0.5 (50%) if needed while staying in free tier

**Expected Outcome:**
- ✅ Stay within Sentry free tier (no unexpected costs)
- ✅ Still get valuable performance insights
- ✅ 90% reduction in bandwidth usage
- ✅ Faster application (less overhead)

---

## Issue 2: Sensitive Data Not Filtered 🔐 SECURITY RISK

### Problem
**Current Issue:**
When errors occur, Sentry captures the entire HTTP request including request body. This means:

**Sensitive Data Being Sent to Sentry:**
```javascript
// Example: User submits OTP verification
POST /api/verify-otp
Body: { mobile: "8106811285", otp: "123456" }

// If error occurs, this entire payload goes to Sentry cloud!
// ⚠️ OTP exposed in Sentry dashboard (accessible to all team members)
```

**Data at Risk:**
- OTPs (6-digit codes for login/PIN reset)
- PINs (4-digit secret codes)
- Admin passwords
- User passwords (if any future auth added)

**Security Implications:**
- OTPs/PINs visible in Sentry dashboard = security breach
- Compliance violation (PII data sent to 3rd party without proper masking)
- If Sentry account compromised, attackers get sensitive data
- Team members with Sentry access can see user credentials

### Solution
Add `beforeSend` hook to scrub sensitive data before sending to Sentry.

**Backend Changes:**
File: `backend/src/index.js`
```javascript
// Line 12-15 - REPLACE WITH THIS:
Sentry.init({
  dsn: "https://9beaab4828c82c718969bbcb7d4db92b@o4511709522886656.ingest.us.sentry.io/4511709628989441",
  tracesSampleRate: 0.1,
  
  // Security: Remove sensitive data before sending to Sentry
  beforeSend(event, hint) {
    // Remove sensitive fields from request body
    if (event.request?.data) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password', 'secret_pin'];
      sensitiveFields.forEach(field => {
        if (event.request.data[field]) {
          event.request.data[field] = '[REDACTED]';
        }
      });
    }
    
    // Remove sensitive fields from extra context
    if (event.extra) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password', 'secret_pin'];
      sensitiveFields.forEach(field => {
        if (event.extra[field]) {
          event.extra[field] = '[REDACTED]';
        }
      });
    }
    
    return event;
  }
});
```

**Frontend Changes:**
File: `frontend/src/main.jsx`
```javascript
// Line 8-11 - REPLACE WITH THIS:
Sentry.init({
  dsn: "https://e857576d03d7f74b12d4708d13cf8022@o4511709522886656.ingest.us.sentry.io/4511709631545344",
  tracesSampleRate: 0.1,
  
  // Security: Remove sensitive data before sending to Sentry
  beforeSend(event, hint) {
    // Remove sensitive fields from request body
    if (event.request?.data) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password'];
      sensitiveFields.forEach(field => {
        if (event.request.data[field]) {
          event.request.data[field] = '[REDACTED]';
        }
      });
    }
    return event;
  }
})
```

**How It Works:**
1. Error occurs in application
2. Sentry captures error + context
3. `beforeSend` runs BEFORE sending to cloud
4. Sensitive fields replaced with `[REDACTED]`
5. Cleaned data sent to Sentry
6. Original sensitive data never leaves your server

**Expected Outcome:**
- ✅ OTPs/PINs never sent to Sentry cloud
- ✅ Compliance with data privacy standards
- ✅ Reduced security risk
- ✅ Still get full error context (minus sensitive fields)

---

## Issue 3: No Environment Differentiation 🔧

### Problem
**Current Issue:**
```javascript
Sentry.init({
  dsn: "...",
  tracesSampleRate: 0.1
  // ⚠️ No environment specified!
});
```

**Why This is a Problem:**
- Can't distinguish between production errors vs development/test errors
- Sentry dashboard shows all errors mixed together
- Can't filter: "Show only production errors"
- Can't set different alert rules for prod vs dev
- Confusing when debugging (is this error from prod or my local machine?)

**Real-World Impact:**
```
Scenario: Developer tests locally, triggers 20 errors while debugging
Sentry: Shows 20 new errors!
You: Panic! Are users affected?
You: Check each error... all from localhost
Result: False alarm, wasted time
```

**With Environment Tags:**
```
Sentry Dashboard:
- Production: 2 errors (⚠️ REAL ISSUES - alert the team!)
- Development: 18 errors (✅ Just devs testing, ignore)
```

### Solution
Add environment and release tracking to identify error source.

**Backend Changes:**
File: `backend/src/index.js`
```javascript
// Line 12-15 - REPLACE WITH THIS:
Sentry.init({
  dsn: "https://9beaab4828c82c718969bbcb7d4db92b@o4511709522886656.ingest.us.sentry.io/4511709628989441",
  tracesSampleRate: 0.1,
  
  // Environment tracking
  environment: process.env.NODE_ENV || 'development',
  
  // Release tracking (helps identify which version has bugs)
  release: `tnbjp-backend@${require('../package.json').version}`,
  
  // Server name (useful if you scale to multiple servers later)
  serverName: process.env.SERVER_NAME || require('os').hostname(),
  
  // Security: Remove sensitive data before sending to Sentry
  beforeSend(event, hint) {
    if (event.request?.data) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password', 'secret_pin'];
      sensitiveFields.forEach(field => {
        if (event.request.data[field]) {
          event.request.data[field] = '[REDACTED]';
        }
      });
    }
    if (event.extra) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password', 'secret_pin'];
      sensitiveFields.forEach(field => {
        if (event.extra[field]) {
          event.extra[field] = '[REDACTED]';
        }
      });
    }
    return event;
  }
});
```

**Frontend Changes:**
File: `frontend/src/main.jsx`
```javascript
// Line 8-11 - REPLACE WITH THIS:
Sentry.init({
  dsn: "https://e857576d03d7f74b12d4708d13cf8022@o4511709522886656.ingest.us.sentry.io/4511709631545344",
  tracesSampleRate: 0.1,
  
  // Environment tracking
  environment: import.meta.env.MODE || 'development',
  
  // Release tracking
  release: `tnbjp-frontend@${__APP_VERSION__}`,  // Note: Need to define __APP_VERSION__ in vite.config.js
  
  // Security: Remove sensitive data before sending to Sentry
  beforeSend(event, hint) {
    if (event.request?.data) {
      const sensitiveFields = ['otp', 'pin', 'new_pin', 'password'];
      sensitiveFields.forEach(field => {
        if (event.request.data[field]) {
          event.request.data[field] = '[REDACTED]';
        }
      });
    }
    return event;
  }
})
```

**Additional Frontend Setup Required:**
File: `frontend/vite.config.js`
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0')
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
      '/admin/api': 'http://localhost:5000',
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
```

**Expected Outcome:**
- ✅ Filter errors by environment in Sentry dashboard
- ✅ Set up alerts: "Only notify for production errors"
- ✅ Track which version introduced bugs
- ✅ Identify server-specific issues (if you scale to multiple droplets)
- ✅ Clean separation of dev vs prod issues

---

## Verification Steps

After implementing these changes, verify they work:

### 1. Check Transaction Sampling
```bash
# Start backend
cd backend
npm start

# In Sentry dashboard:
# 1. Go to Performance tab
# 2. Check transaction count
# 3. Should see ~10% of actual traffic (not 100%)
```

### 2. Verify Sensitive Data Filtering
```bash
# Trigger an OTP error manually:
curl -X POST http://localhost:5000/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9999999999","otp":"000000"}'

# In Sentry dashboard:
# 1. Go to Issues tab
# 2. Find the error
# 3. Check Request Data
# 4. Verify OTP shows as "[REDACTED]", not actual value
```

### 3. Check Environment Tagging
```bash
# In Sentry dashboard:
# 1. Go to any issue
# 2. Check Tags section
# 3. Should see: environment: production (or development)
# 4. Should see: release: tnbjp-backend@1.0.0
```

---

## Testing Before Deployment

**Local Testing:**
```bash
# Backend
cd backend
NODE_ENV=development npm start
# Trigger error, check Sentry shows environment: development

# Frontend  
cd frontend
npm run dev
# Trigger error, check Sentry shows environment: development
```

**Production Testing:**
```bash
# After deploying to Digital Ocean
# Check one error in Sentry
# Verify: environment: production, release: correct version
```

---

## Deployment Notes

**Order of deployment:**
1. Deploy backend changes first (no breaking changes)
2. Deploy frontend changes (no breaking changes)
3. Monitor Sentry for 24 hours
4. Verify transaction count drops to ~10%

**Rollback plan:**
If issues occur, simply revert:
```javascript
Sentry.init({
  dsn: "...",
  tracesSampleRate: 1.0  // Back to original
});
```

---

## Impact Summary

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Transactions/month** | 75,000 | 7,500 | 90% reduction ✅ |
| **Within free tier?** | ❌ No (7.5x over) | ✅ Yes | Cost savings: $26/month |
| **Sensitive data exposed?** | ⚠️ Yes (OTPs, PINs) | ✅ No | Security improved |
| **Environment tracking?** | ❌ No | ✅ Yes | Better debugging |
| **Implementation time** | - | 30 minutes | Quick win |

---

## Next Steps

After these urgent fixes, implement the high-priority improvements in `SENTRY_OPTIMIZATION_HIGH_PRIORITY.md`:
- Error tracking for card generation
- User context tracking
- Performance monitoring for critical operations

---

## Questions?

If AI IDE/Claude Code encounters issues:
1. Ensure Node.js packages are installed: `npm install`
2. Verify `.env` file has `NODE_ENV=production` on production server
3. Check backend/frontend can import Sentry: `const Sentry = require('@sentry/node');`
4. Test locally before deploying to production
