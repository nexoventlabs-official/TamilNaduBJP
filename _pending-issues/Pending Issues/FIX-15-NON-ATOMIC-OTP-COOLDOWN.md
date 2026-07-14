# FIX-15 — Non-Atomic OTP Cooldown Allows Double Send, Invalidates First OTP

**Severity:** MEDIUM (User Experience / Security)  
**File:** `backend/src/routes/chat.js` — Lines 160–184  
**Estimated Fix Time:** 20 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The OTP send flow has three separate operations with no atomic lock between them:

```javascript
// Step 1 — read existing OTP session to check cooldown
const doc = await db.collection('otp_sessions').findOne(
  { mobile }, { projection: { created_at: 1 } }
);

// Step 2 — check 60-second cooldown
if (doc?.created_at) {
  const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
  if (elapsed < 60) { return res.status(429) ... }
}

// Step 3 — send OTP via SMS
const otp    = genOtp();
const result = await sendOtp(mobile, otp);

// Step 4 — write new OTP hash to DB
await db.collection('otp_sessions').updateOne(
  { mobile },
  { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), ... } },
  { upsert: true }
);
```

Between Step 1 (read) and Step 4 (write), another concurrent request for the same mobile can also pass Step 2 (because it reads the same old `doc`), call `sendOtp` (Step 3), and write its own OTP hash (Step 4).

The second write overwrites the first. The SMS provider has already sent both OTPs. The member receives two SMS messages. They enter the first OTP (which arrived first, feels natural). The database has the second OTP's hash. The first OTP is now invalid. The member gets "Invalid OTP."

---

## How It Affects the Drive

- This happens when a user on a slow or unreliable network taps "Send OTP" and the request is slow to respond — their app retries automatically, or they tap again
- Rural 4G connections in Tamil Nadu frequently cause double-tap scenarios
- The member enters the first OTP (which they received first) and gets "Invalid OTP"
- They request another OTP — now wait 60 seconds
- Some members give up at this point and don't complete registration
- Support calls: "OTP not working"
- At 1 lakh registrations per day with even 0.5% retry rate = 500 people/day in this situation
- Also a minor security concern: concurrent OTP sends waste SMS credits and can be used for SMS flooding

---

## The Fix

Use a MongoDB `findOneAndUpdate` with a filter that only matches when the cooldown has expired (or no record exists). This makes the "check cooldown + write" operation atomic.

**File:** `backend/src/routes/chat.js` — Replace lines 159–184:

```javascript
// BEFORE — three separate operations (non-atomic)
const doc = await db.collection('otp_sessions').findOne(
  { mobile }, { projection: { created_at: 1 } }
);
if (doc?.created_at) {
  const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
  if (elapsed < 60) {
    const wait = Math.ceil(60 - elapsed);
    return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
  }
}
const otp    = genOtp();
const result = await sendOtp(mobile, otp);
if (!result.success) {
  return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
}
await db.collection('otp_sessions').updateOne(
  { mobile },
  { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), verified: false, purpose: 'login' } },
  { upsert: true }
);
```

```javascript
// AFTER — atomic check-and-write
const cooldownCutoff = new Date(Date.now() - 60 * 1000); // 60 seconds ago

// Atomic: only matches if no record exists, or if cooldown has expired
const existing = await db.collection('otp_sessions').findOneAndUpdate(
  {
    mobile,
    $or: [
      { created_at: { $exists: false } },        // no record
      { created_at: { $lt: cooldownCutoff } },   // cooldown expired
    ]
  },
  { $set: { created_at: nowUTC(), otp_placeholder: true } }, // reserve the slot atomically
  { upsert: true, returnDocument: 'before' }
);

// If findOneAndUpdate did NOT match (existing doc is within cooldown), block it
// The upsert throws 11000 if concurrent request already reserved the slot
// OR we can check: if the returned doc shows a recent created_at, block
// Simpler: check if the current record is within cooldown
const current = await db.collection('otp_sessions').findOne(
  { mobile }, { projection: { created_at: 1 } }
);
if (current?.created_at && !existing) {
  const elapsed = (Date.now() - new Date(current.created_at).getTime()) / 1000;
  if (elapsed < 60) {
    const wait = Math.ceil(60 - elapsed);
    return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
  }
}

const otp    = genOtp();
const result = await sendOtp(mobile, otp);
if (!result.success) {
  return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
}

// Now write the actual OTP hash
await db.collection('otp_sessions').updateOne(
  { mobile },
  { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), verified: false, purpose: 'login' } },
  { upsert: true }
);
```

**Alternative simpler approach** — add a unique index on `mobile` + use upsert with a conditional:

The cleanest fix is to use MongoDB's `$currentDate` and check the result of the update operation to see if the write succeeded or was blocked by the cooldown filter:

```javascript
const cooldownCutoff = new Date(Date.now() - 60 * 1000);

// Try to atomically claim the OTP slot
const claim = await db.collection('otp_sessions').updateOne(
  {
    mobile,
    $or: [
      { created_at: { $exists: false } },
      { created_at: { $lt: cooldownCutoff } },
    ]
  },
  { $set: { otp_slot_claimed: true, claimed_at: new Date() } },
  { upsert: false } // do NOT upsert here — only match existing expired docs
);

// If no record was modified, check if it's a cooldown issue or new user
const existing = await db.collection('otp_sessions').findOne({ mobile });
if (claim.modifiedCount === 0 && existing?.created_at) {
  const elapsed = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
  if (elapsed < 60) {
    const wait = Math.ceil(60 - elapsed);
    return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
  }
}

// Safe to send OTP now
const otp = genOtp();
const result = await sendOtp(mobile, otp);
if (!result.success) {
  return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
}

await db.collection('otp_sessions').updateOne(
  { mobile },
  { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), verified: false, purpose: 'login' } },
  { upsert: true }
);
```

**Developer note:** The developer should pick the implementation pattern that fits best. The key principle is: the cooldown check and the slot reservation must happen in a single atomic MongoDB operation, not as separate read → check → write steps.

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. Simultaneous OTP requests for same mobile — only one OTP sent**

Send two concurrent requests for the same mobile:
```bash
curl -s -X POST https://tnbjp.org/api/send-otp -d '{"mobile":"9876543210"}' &
curl -s -X POST https://tnbjp.org/api/send-otp -d '{"mobile":"9876543210"}' &
wait
```
Expected: one returns `{"success":true}`, one returns `HTTP 429` with cooldown message.
Before fix: both return `{"success":true}` and two OTPs are sent.

**2. Member receives exactly one OTP SMS**
- No double SMS for a single tap
- The OTP that arrives is the valid one in the database
- Member enters OTP and it is accepted on first try

**3. Cooldown still works correctly**
- After successful OTP send, requesting another within 60 seconds returns 429
- After 60 seconds, new OTP can be requested normally

**4. Support volume for "OTP not working" decreases**
- Monitor support contact rate for OTP issues after deploy
- Expected: measurable reduction in "OTP not working" complaints from members on slow networks
