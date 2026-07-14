# FIX-06 — Unbounded Referral Tree Loads OOM the Server

**Severity:** HIGH  
**File:** `backend/src/routes/chat.js` — Lines 992–1044  
**Estimated Fix Time:** 30 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The `/my-members/:bjpCode` endpoint fetches a member's full referral tree (Layer 2 and Layer 3 referrals) with no limit on how many records are returned:

```javascript
// Layer 2 — no limit
const layer2Docs = await db.collection('generated_voters')
  .find({ referred_by_bjp: bjpCode }, { projection: { ... } })
  .sort({ generated_at: -1 })
  .toArray();  // ← loads ALL direct referrals into memory

// Layer 3 — no limit
layer3Docs = await db.collection('generated_voters')
  .find({ referred_by_bjp: { $in: layer2Bjps } }, { projection: { ... } })
  .toArray();  // ← loads ALL second-level referrals into memory

// B2 presigned URL calls — one per member, all concurrent
await Promise.all(layer3Docs.map(async (m3) => {
  photo_url: await getPhotoPresignedUrl(m3.photo_url || ''),  // ← unlimited concurrent API calls
}));
```

If a party leader, influencer, or district organiser joins and 3,000 people register under them, opening "My Members" page loads 3,000+ documents into RAM and fires 3,000 simultaneous Backblaze API calls for presigned photo URLs.

---

## How It Affects the Drive

- One viral member opening their "My Members" page can consume 500MB+ of RAM in a single request
- PM2's `max_memory_restart: 1500M` kicks in and restarts that worker
- All active registrations on that worker are dropped mid-flow during the restart (~10 seconds)
- If the same member keeps refreshing, the worker keeps crashing in a cycle
- With 4 PM2 workers, multiple simultaneous viral member page loads can take all 4 workers down
- The more successful the drive, the worse this gets — your top recruiters are the ones who break it

---

## The Fix

Add `.limit()` to both queries and cap the concurrent presigned URL calls.

**File:** `backend/src/routes/chat.js`

**Replace lines 992–1010:**
```javascript
// BEFORE
const layer2Docs = await db.collection('generated_voters')
  .find(
    { referred_by_bjp: bjpCode },
    { projection: { ... } }
  )
  .sort({ generated_at: -1 })
  .toArray();

// ...

layer3Docs = await db.collection('generated_voters')
  .find(
    { referred_by_bjp: { $in: layer2Bjps } },
    { projection: { ... } }
  )
  .toArray();
```

```javascript
// AFTER
const LAYER2_LIMIT = 100; // Show top 100 direct referrals
const LAYER3_LIMIT = 200; // Show top 200 second-level referrals

const layer2Docs = await db.collection('generated_voters')
  .find(
    { referred_by_bjp: bjpCode },
    { projection: { ... } }
  )
  .sort({ generated_at: -1 })
  .limit(LAYER2_LIMIT)
  .toArray();

// ...

layer3Docs = await db.collection('generated_voters')
  .find(
    { referred_by_bjp: { $in: layer2Bjps } },
    { projection: { ... } }
  )
  .limit(LAYER3_LIMIT)
  .toArray();
```

**Also cap the concurrent presigned URL calls using a simple batch helper:**
```javascript
// Replace the unbounded Promise.all with batched execution
async function batchPresign(docs, batchSize = 20) {
  const results = [];
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = docs.slice(i, i + batchSize);
    const resolved = await Promise.all(batch.map(m => getPhotoPresignedUrl(m.photo_url || '')));
    results.push(...resolved);
  }
  return results;
}
```

Include the total referral count in the response so the UI can show "Showing 100 of 3,241 members":
```javascript
const totalLayer2Count = await db.collection('generated_voters')
  .countDocuments({ referred_by_bjp: bjpCode });
// Add to response: total_referrals: totalLayer2Count
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

**1. Response time is bounded regardless of referral count**
- A member with 10,000 referrals gets a response in under 2 seconds
- A member with 50 referrals gets the same response time
- PM2 memory stays below 300MB per worker after the page load

**2. Server stays up when viral members open their page**
```bash
pm2 list
# All 4 workers show status: online
# No restarts in the ↺ column
```

**3. Response includes total count**
```json
{
  "success": true,
  "root": { ... },
  "tree": [ ... ],
  "total_referrals": 3241,
  "showing": 100
}
```

**4. Memory stays stable**
```bash
pm2 monit
# Worker memory should not spike above 400MB on any single request
```
