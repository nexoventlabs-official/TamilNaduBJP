# FIX-01 — Referral Link Crashes with ReferenceError

**Severity:** CRITICAL  
**File:** `backend/src/routes/chat.js` — Line 931  
**Estimated Fix Time:** 5 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The `config` object is required inside the `generate-card` route handler on line 604 as a local variable scoped only to that function. The `/referral-link/:bjpCode` route handler at line 905 uses `config.baseUrl` on line 931 — but `config` is never imported at the top of the file or within that handler's scope.

Every time any authenticated member clicks their referral link button, Node.js throws:
```
ReferenceError: config is not defined
```
This is caught by the global error handler and returned as HTTP 500.

---

## How It Affects the Drive

- Every member who taps "Share My Referral Link" receives a blank error screen
- The referral mechanic — the core viral growth engine of the membership drive — does not work at all
- Members who have already recruited others cannot retrieve their referral link to share further
- Referral attribution during card generation (lines 606–628) still works because `config` is locally scoped there — but the dedicated referral-link endpoint is completely broken
- Support volume increases as members report they cannot share their link

---

## The Fix

Add `const config = require('../config');` at the top of `chat.js` with the other imports.

**File:** `backend/src/routes/chat.js`

**Find this block (around line 18):**
```javascript
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const crypto   = require('crypto');
const Sentry   = require('@sentry/node');
```

**Add one line after the existing requires:**
```javascript
const config   = require('../config');
```

Then remove the local `const config = require('../config');` on line 604 inside the generate-card handler (it becomes redundant but causes no harm if left — removing it is cleaner).

---

## Deploy Steps

```bash
# On the DigitalOcean server
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. No more ReferenceError in logs**
```bash
pm2 logs bjptn-backend --lines 50
# Must NOT contain: ReferenceError: config is not defined
```

**2. Referral link endpoint returns a link**
```bash
# With a valid session cookie (logged-in member):
curl -s -b cookies.txt https://tnbjp.org/api/referral-link/BJP-XXXXXXXX
# Expected: {"success":true,"referral_id":"REF-XXXXXXXX","referral_link":"https://tnbjp.org/refer/BJP-XXXXXXXX/REF-XXXXXXXX"}
# Before fix: {"success":false,"message":"Server error"}
```

**3. Member can share referral link from the UI**
- Open `https://tnbjp.org` and log in as a registered member
- Navigate to the referral/share section
- Click "Share My Referral Link"
- A valid link is displayed and can be copied or shared
- The link opens the registration page with referral attribution pre-filled
