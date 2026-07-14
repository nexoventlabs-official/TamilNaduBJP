# FIX-04 — Non-Atomic Generation Lock Allows Duplicate Cards

**Severity:** CRITICAL  
**File:** `backend/src/routes/chat.js` — Lines 572–586  
**Estimated Fix Time:** 20 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The card generation lock is acquired and verified in two separate, non-atomic operations:

```javascript
// Step 1 — acquire lock
await db.collection('generation_locks').updateOne(
  { mobile: mobile, locked_until: { $lt: new Date() } },
  { $set: { locked_until: lockExpiry, locked_by: reqId } },
  { upsert: true }
);

// Step 2 — verify we own it (separate round-trip to MongoDB)
const lock = await db.collection('generation_locks').findOne({ mobile: mobile });
lockAcquired = lock?.locked_by === reqId;
```

Between Step 1 and Step 2, another concurrent request for the same mobile number can execute its own `updateOne` and overwrite `locked_by`. Both requests then read the lock, both see their own `reqId`... except this is impossible — only one `reqId` can be stored. The real problem is that under concurrent load, both requests can write the same mobile's lock near-simultaneously, and the `findOne` verification is not guaranteed to reflect the latest write due to the two round-trips.

More critically: the `updateOne` filter matches `locked_until: { $lt: new Date() }` — an expired lock. If two requests arrive within the same millisecond and no lock exists yet (upsert), both `updateOne` calls try to insert. The second one gets a duplicate key error (caught at line 583) and correctly backs off. But if a lock exists and is exactly at the expiry boundary, both updates can match and both proceed.

---

## How It Affects the Drive

- Two concurrent requests for the same mobile can both believe they hold the lock
- Both proceed to generate a card, upload photos, and upsert `generated_voters`
- The second upsert overwrites the first — the member gets a new `bjp_code`
- All referrals previously made under the original `bjp_code` are now orphaned (referral chain broken)
- The original member's card shows a different BJP code than what they shared with their recruits
- This is silent — no error is thrown, no log entry, no Sentry alert
- At high concurrency (campaign events with 500+ simultaneous registrations), this will happen

---

## The Fix

Replace the two-step acquire+verify with a single atomic `findOneAndUpdate`. This returns the document that was actually modified, so you know with certainty whether your `reqId` won the lock.

**File:** `backend/src/routes/chat.js` — Replace lines 570–586:

```javascript
// BEFORE
const lockExpiry = new Date(Date.now() + 120000);
let lockAcquired = false;
try {
  await db.collection('generation_locks').updateOne(
    { mobile: mobile, locked_until: { $lt: new Date() } },
    { $set: { locked_until: lockExpiry, locked_by: reqId } },
    { upsert: true }
  );
  const lock = await db.collection('generation_locks').findOne({ mobile: mobile });
  lockAcquired = lock?.locked_by === reqId;
} catch (e) {
  if (e.code !== 11000) throw e;
  lockAcquired = false;
}
```

```javascript
// AFTER
const lockExpiry = new Date(Date.now() + 120000);
let lockAcquired = false;
try {
  const result = await db.collection('generation_locks').findOneAndUpdate(
    { mobile: mobile, locked_until: { $lt: new Date() } },
    { $set: { locked_until: lockExpiry, locked_by: reqId } },
    { upsert: true, returnDocument: 'after' }
  );
  // findOneAndUpdate is atomic — if it returned a doc, we wrote it
  lockAcquired = result?.locked_by === reqId;
} catch (e) {
  if (e.code !== 11000) throw e;
  // 11000 = duplicate key — another request holds the lock
  lockAcquired = false;
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

**1. Under concurrent load, only one card is generated per mobile**

Send 10 simultaneous requests for the same mobile number (can use `ab` or a simple script):
```bash
for i in {1..10}; do
  curl -s -X POST https://tnbjp.org/api/generate-card \
    -b cookies.txt \
    -F "mobile=9876543210" \
    -F "epic_no=TN001001" \
    -F "photo=@test.jpg" &
done
wait
```
Expected: exactly 1 response with `success: true`, 9 responses with `"Card generation already in progress"`

**2. Only one record per mobile in the database**
```bash
# mongosh
use bjptamilnadu
db.generated_voters.countDocuments({ MOBILE_NO: "9876543210" })
# Expected: 1
```

**3. No orphaned referral chains**
- All members' BJP codes remain stable across multiple card generation attempts
- Referral counts remain accurate
