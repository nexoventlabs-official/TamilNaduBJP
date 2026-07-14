# FIX-10 — Session Written After DB Write Causes Orphaned Registrations

**Severity:** HIGH  
**File:** `backend/src/routes/chat.js` — Lines 681, 729  
**Estimated Fix Time:** 15 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

In the generate-card handler, the order of operations is:

1. Line 681 — Write member record to MongoDB (`generated_voters` upsert) ✅
2. Line 718 — Write generation stats to MongoDB ✅
3. Line 729 — Set `req.session.verified_mobile = mobile` ← session saved here, LAST

If anything fails between steps 2 and 3 — a Redis connection blip, a session store timeout, a network hiccup — the member's record exists in MongoDB but they have no active session.

The member sees success on their screen (response was already sent... wait, actually the session save happens before `res.json` but the issue is the session save can fail silently). More precisely: `express-session` saves the session asynchronously after the response. If the Redis write fails, the session is never persisted.

On the member's next visit:
- `req.session.verified_mobile` is empty (session was never saved)
- The "check-mobile" endpoint returns `has_card: true` if the DB record exists, but the session is not set
- The member cannot proceed through the chatbot flow without re-verifying OTP
- If they try to re-register with the same EPIC, the `photo_url: { $exists: true, $ne: '' }` check on line 530 blocks them if a photo was uploaded
- They are stuck: can't register again, no session to continue

---

## How It Affects the Drive

- During any Redis hiccup (external managed Redis has occasional reconnections), members who register at that exact moment end up with no session
- They close and reopen the app — it appears as if they were never registered
- They try again — either get blocked (if photo was written) or re-register (if photo was not written)
- Support calls increase: "I registered but my card is not showing"
- At 1 lakh registrations per day and even 0.1% session-save failure rate = 100 affected members per day

---

## The Fix

Move the session assignment to BEFORE the database writes. The session is the user's authenticated state — it should be set once OTP is verified, not after card generation. The generate-card handler already requires `req.session.verified_mobile` to be set (after Fix-05), so this is also a consistency fix.

**File:** `backend/src/routes/chat.js`

Move these lines (currently at 729–730) to immediately after the EPIC lookup succeeds (around line 566, after `const voter = normaliseVoter(rawVoter)`):

```javascript
// BEFORE — session set AFTER all DB writes (line 729)
// ... all the DB writes ...
req.session.verified_mobile = mobile;
req.session.cookie.maxAge   = 86400 * 1000;
return res.json({ success: true, ... });
```

```javascript
// AFTER — session confirmed/refreshed BEFORE DB writes
const voter = normaliseVoter(rawVoter);

// Ensure session is persisted before any DB writes
req.session.verified_mobile = mobile;
req.session.cookie.maxAge   = 86400 * 1000;
await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));

// ... then proceed with lock acquisition and DB writes ...
```

The `req.session.save()` call forces an immediate synchronous save to Redis rather than waiting for the response cycle. If Redis fails here, the error is thrown and the user gets a proper error response — not a silent session loss after a "success" response.

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. Session is set before DB writes complete**
- After OTP verification and EPIC lookup, the session is saved to Redis immediately
- If Redis fails at this point, the user gets an error and no partial record is written

**2. Members can immediately access their card after registration**
- Complete registration flow
- Close the browser tab
- Reopen `https://tnbjp.org` — the chatbot recognises them as registered
- Card is displayed without needing to re-verify OTP

**3. No orphaned records**
```bash
# mongosh — check for records with photo but no session issues
# (hard to verify directly, but monitor support volume for "registered but card not showing" complaints)
```

**4. Session save errors appear in logs**
```bash
pm2 logs bjptn-backend
# If Redis session save fails, you will see an explicit error:
# generate-card error: [Redis session save failure message]
# Instead of: silent success + missing session
```
