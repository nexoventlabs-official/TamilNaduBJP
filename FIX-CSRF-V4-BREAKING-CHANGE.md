# FIX: CSRF Middleware Crash — `csrf-csrf` v4 Breaking API Change

**Severity:** CRITICAL
**Estimated Fix Time:** 20 minutes
**File:** `backend/src/index.js` — Lines 218–238
**Status:** App is online but all admin POST operations (confirm/reject volunteer, confirm/reject booth agent) are returning 500 errors. The admin panel appears to work but state-changing actions are silently failing.

---

## What Is the Issue?

The `csrf-csrf` package was installed at version `4.0.3`. The code was written using the **v3 API**. Between v3 and v4, the library made three breaking changes. All three are present in the current code, causing the CSRF middleware to malfunction on every request that hits it.

**Evidence from server error logs (`pm2 logs bjptn-backend`):**

```
Unhandled error: Cannot read properties of undefined (reading '__Host-bjp.csrf')
Unhandled error: Cannot use 'in' operator to search for '__Host-bjp.csrf' in undefined
```

Both errors mean the same thing: inside `csrf-csrf`, it executes `req.cookies['__Host-bjp.csrf']` or `'__Host-bjp.csrf' in req.cookies` but `req.cookies` is `undefined` at that point — because the library's internal state was never properly initialized due to the broken configuration.

These errors are caught by the global error handler and returned as HTTP 500, so they do not crash the process. However, **every admin POST action fails silently**.

---

## Three Breaking Changes — Detailed

### Breaking Change 1 — `getSessionIdentifier` removed

**Current code (broken):**

```javascript
getSessionIdentifier: (req) => req.sessionID || '',
```

**What happened:** `csrf-csrf` v4 removed the `getSessionIdentifier` option entirely. The library now handles session binding internally. When this unknown option is passed, v4 ignores it and falls back to an undefined internal state, which causes `req.cookies` to be read incorrectly on subsequent requests.

**Fix:** Remove this line entirely.

---

### Breaking Change 2 — `size` option removed

**Current code (broken):**

```javascript
size: 64,
```

**What happened:** `csrf-csrf` v4 removed the `size` option for controlling token byte length. Same as above — unknown option passed to the initializer causes silent internal failure.

**Fix:** Remove this line entirely.

---

### Breaking Change 3 — `generateCsrfToken` renamed to `generateToken`

**Current code (broken):**

```javascript
const {
  doubleCsrfProtection,
  generateCsrfToken,       // ← does not exist in v4
  invalidCsrfTokenError,
} = doubleCsrf({...});

// Later, line 238:
return res.json({ success: true, csrfToken: generateCsrfToken(req, res) });
```

**What happened:** In v4, `generateCsrfToken` was renamed to `generateToken`. The destructured `generateCsrfToken` is `undefined`. Calling `undefined(req, res)` on line 238 throws a `TypeError`, also caught by the global error handler.

**Fix:** Rename to `generateToken` in the destructure and in the usage.

---

## How to Fix It

**Only `backend/src/index.js` needs to change. Two edits.**

---

### Edit 1 — Fix the `doubleCsrf` configuration (Lines 218–234)

**Replace this:**

```javascript
const { doubleCsrf } = require('csrf-csrf');
const {
  doubleCsrfProtection,
  generateCsrfToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret:            () => config.sessionSecret,
  getSessionIdentifier: (req) => req.sessionID || '',
  cookieName:           config.nodeEnv === 'production' ? '__Host-bjp.csrf' : 'bjp.csrf',
  cookieOptions: {
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure:   config.nodeEnv === 'production',
    path:     '/',
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});
```

**With this:**

```javascript
const { doubleCsrf } = require('csrf-csrf');
const {
  doubleCsrfProtection,
  generateToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret:               () => config.sessionSecret,
  cookieName:              config.nodeEnv === 'production' ? '__Host-bjp.csrf' : 'bjp.csrf',
  cookieOptions: {
    sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
    secure:   config.nodeEnv === 'production',
    path:     '/',
  },
  getCsrfTokenFromRequest: (req) => req.headers['x-csrf-token'],
});
```

**Changes made:**

- Removed `getSessionIdentifier` option (not in v4)
- Removed `size: 64` option (not in v4)
- Renamed `generateCsrfToken` → `generateToken` in the destructure

---

### Edit 2 — Fix the token generation endpoint (Line 238)

**Replace this:**

```javascript
app.get('/admin/api/csrf-token', (req, res) => {
  return res.json({ success: true, csrfToken: generateCsrfToken(req, res) });
});
```

**With this:**

```javascript
app.get('/admin/api/csrf-token', (req, res) => {
  return res.json({ success: true, csrfToken: generateToken(req, res) });
});
```

**Change made:** `generateCsrfToken` → `generateToken`

---

## No Frontend Changes Required

The frontend (`frontend/src/api/index.js`) already:

- Calls `GET /admin/api/csrf-token` to fetch the token ✅
- Sends it as `x-csrf-token` header on all admin POST requests ✅
- Clears the cached token on 403 responses and retries ✅

The frontend is correct. Only the backend needs fixing.

---

## Deploy Steps

```bash
# 1. Edit backend/src/index.js as described above

# 2. On the DigitalOcean server, pull the changes
cd /var/www/bjptn
git pull origin main

# 3. Restart the app via PM2
pm2 restart bjptn-backend

# 4. Watch logs for 30 seconds to confirm no more CSRF errors
pm2 logs bjptn-backend --lines 30
```

---

## Success Criteria

After the fix, verify the following:

**1. No CSRF errors in logs**

```bash
pm2 logs bjptn-backend --lines 50
```

The lines containing `Cannot read properties of undefined (reading '__Host-bjp.csrf')` and `Cannot use 'in' operator` must not appear.

**2. Admin panel CSRF token endpoint returns a token**

```bash
curl -s -c /tmp/cookies.txt https://tnbjp.org/admin/api/csrf-token
# Expected: {"success":true,"csrfToken":"<long string>"}
# Before fix: {"success":false,"message":"Internal server error",...}
```

**3. Admin POST action succeeds**

- Log in to the admin panel at `https://tnbjp.org/admin`
- Open any volunteer or booth agent request
- Click **Confirm** or **Reject**
- Before fix: action silently fails or shows an error
- After fix: action succeeds and the status updates immediately

**4. CSRF attack is still blocked**

- A POST to any `/admin/api/` endpoint without the `x-csrf-token` header must return `403 Invalid or missing CSRF token` — not 500

```bash
curl -s -X POST https://tnbjp.org/admin/api/volunteer-requests/BJP-TEST1234/confirm \
  -H "Content-Type: application/json"
# Expected: HTTP 403 {"success":false,"message":"Invalid or missing CSRF token."}
```

---

## What Does NOT Change

- The CSRF protection logic itself is correct — double-submit cookie pattern is the right approach
- The frontend CSRF integration is correct and requires no changes
- The admin login flow is unaffected (login is exempt from CSRF)
- All public API endpoints (`/api/*`) are completely unaffected
- WhatsApp webhook endpoints are completely unaffected
