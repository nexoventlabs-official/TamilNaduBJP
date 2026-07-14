# FIX-05 — OTP Bypass: Unauthenticated Mobile from POST Body

**Severity:** CRITICAL (Security)  
**File:** `backend/src/routes/chat.js` — Line 511  
**Estimated Fix Time:** 10 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

Line 511 in the generate-card handler reads the mobile number like this:

```javascript
const mobile = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';
```

If the user has no session (i.e., they never went through OTP verification), the mobile number falls through to `req.body.mobile` — whatever value they sent in the POST body. There is no check to ensure the mobile was OTP-verified before proceeding.

This means anyone can send a direct HTTP POST to `/api/generate-card` with any mobile number in the body and register a voter card under that number — without ever receiving or entering an OTP.

---

## How It Affects the Drive

- Bots can pre-register thousands of mobile numbers, blocking legitimate voters from joining
- A single script running overnight can claim 50,000 mobile numbers before the drive opens
- When the real voter tries to register, they get "This mobile number is already registered"
- Your registration count is inflated with fake entries — reported numbers are unreliable
- Fake BJP codes are generated under real voter EPICs
- If discovered by the press or opposition, it becomes a major credibility issue for the drive
- This is the most serious security vulnerability in the application

---

## The Fix

Reject the request immediately if the mobile is not in a verified session. Remove the body fallback entirely from the generate-card route.

**File:** `backend/src/routes/chat.js` — Lines 510–512:

```javascript
// BEFORE
const mobile = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';
```

```javascript
// AFTER
const mobile = req.session.verified_mobile || '';
if (!mobile) {
  return res.status(401).json({
    success: false,
    message: 'Please verify your mobile number via OTP before registering.',
  });
}
```

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. Unauthenticated request is rejected**
```bash
# POST with mobile in body but no valid session cookie
curl -s -X POST https://tnbjp.org/api/generate-card \
  -F "mobile=9876543210" \
  -F "epic_no=AYR2750958" \
  -F "photo=@test.jpg"

# Expected: HTTP 401
# {"success":false,"message":"Please verify your mobile number via OTP before registering."}
# Before fix: HTTP 200 — card generated without OTP
```

**2. Authenticated request still works**
- A user who completed OTP verification has `req.session.verified_mobile` set
- Their card generation proceeds normally
- No change to the legitimate user flow

**3. All registrations in the database have OTP-verified mobiles**
- Every `MOBILE_NO` in `generated_voters` corresponds to a mobile that received and entered a valid OTP
- Registration count is trustworthy
