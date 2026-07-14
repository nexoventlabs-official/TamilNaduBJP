# FIX-03 — Silent Photo Upload Failure Registers Member with No Photo

**Severity:** CRITICAL  
**File:** `backend/src/routes/chat.js` — Lines 659–671, 681, 732  
**Estimated Fix Time:** 30 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

When a member uploads their photo during registration, the server uploads it to Backblaze B2. If that upload fails for any reason (B2 outage, network timeout, rate limit, credential issue), the catch block at line 659 logs the error and sends it to Sentry — but then continues execution with `photoUrl` still set to `''`.

The code then:
1. Writes the member record to MongoDB with `photo_url: ''` (line 681)
2. Returns `{ success: true }` to the frontend (line 732)

The member believes they have successfully registered. Their card renders with no photo. They cannot re-register because their mobile number is now in the database (unique index enforced). They are permanently stuck.

```javascript
// Lines 659–671 — current broken behaviour
let photoUrl = '';
try {
  photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
} catch (e) {
  console.error('Photo upload failed:', e.message);
  Sentry.captureException(e, { ... });
  // photoUrl stays '' — execution continues silently
}
// Line 681 — writes empty photo_url to DB
await db.collection('generated_voters').updateOne(
  { MOBILE_NO: mobile },
  { $set: { photo_url: photoUrl, ... } }, // photoUrl = ''
  { upsert: true }
);
// Line 732 — tells user success
return res.json({ success: true, ... });
```

---

## How It Affects the Drive

- At 1 lakh registrations per day, even a 0.5% B2 failure rate = 500 members per day with no photo
- Each affected member needs manual database intervention to fix
- The member cannot self-recover — they get "already registered" on retry
- The card is visually broken with a blank photo placeholder
- Sentry captures the error but the user never knows — support volume increases
- During a B2 maintenance window or regional outage, the number could be in the thousands

---

## The Fix

Return an error to the user when photo upload fails instead of silently continuing. The member should be asked to retry rather than being silently registered with a broken record.

**File:** `backend/src/routes/chat.js`

**Replace lines 658–671:**
```javascript
// BEFORE
let photoUrl = '';
try {
  photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
} catch (e) {
  console.error('Photo upload failed:', e.message);
  Sentry.captureException(e, {
    tags:  { operation: 'photo_upload', source: 'web', storage: 'backblaze_b2' },
    extra: {
      epicNo, mobile, bjpCode,
      photoSizeKB: Math.round(photoBuffer.length / 1024),
      errorType:   'b2_upload_failed',
    },
  });
}
```

```javascript
// AFTER
let photoUrl = '';
try {
  photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
} catch (e) {
  console.error('Photo upload failed:', e.message);
  Sentry.captureException(e, {
    tags:  { operation: 'photo_upload', source: 'web', storage: 'backblaze_b2' },
    extra: {
      epicNo, mobile, bjpCode,
      photoSizeKB: Math.round(photoBuffer.length / 1024),
      errorType:   'b2_upload_failed',
    },
  });
  // Release the lock before returning
  await db.collection('generation_locks').deleteOne({ mobile });
  return res.status(503).json({
    success: false,
    message: 'Photo upload failed. Please try again in a moment.',
    retry: true,
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

**1. B2 failure returns an error, not success**

Simulate a B2 failure by temporarily setting a wrong B2 key in `.env`, then attempt a registration:
```
Expected response: HTTP 503
{"success":false,"message":"Photo upload failed. Please try again in a moment.","retry":true}
```
Before fix: HTTP 200 `{"success":true, ...}` with empty `photo_url`

**2. No member records with empty `photo_url`**
```bash
# Run in mongosh on the server
use bjptamilnadu
db.generated_voters.countDocuments({ photo_url: '' })
# Expected: 0 (or only pre-existing ones from before the fix)
```

**3. Member can retry successfully**
- If photo upload fails, the user sees "Photo upload failed. Please try again."
- They tap retry — the flow restarts from photo upload
- On success, their record is written correctly with a valid `photo_url`

**4. Generation lock is released on failure**
- After a failed upload, the member can immediately retry without hitting the "already in progress" lock
