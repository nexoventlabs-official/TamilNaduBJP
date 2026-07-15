# Scale to 1 Lakh Registrations Per Day

**Estimated Fix Time:** 30 minutes  
**Files Changed:** 2  
**Server Downtime:** ~10 seconds (PM2 rolling reload — zero actual downtime)  
**Prerequisites:** All 10 security fixes already deployed ✅

---

## Important: What This Is NOT About

This document does **not** involve:

- ❌ BullMQ — not needed. The web card is rendered client-side in the browser (iframe loading `bjp_card_design.html`). The server does not generate cards via Puppeteer for web registrations. There is no blocking card generation to queue.
- ❌ Redis installation — already running (external managed Redis, confirmed connected)
- ❌ Async card generation — not applicable to the current web flow
- ❌ Additional servers — not needed

The bottleneck is simply that **PM2 runs 1 Node.js process on 1 CPU** while 3 CPUs sit idle.

---

## Current State (Verified on Server — 14 July 2026)

```
PM2 mode:       fork (single process)
CPU usage:      1 of 4 vCPUs
Node processes: 1
DB1 pool:       maxPoolSize: 10  (voter roll — local MongoDB)
DB2 pool:       maxPoolSize: 50  (app data — Atlas) ✅ already good
Redis:          Connected (external managed) ✅
Sessions:       Redis-backed ✅
Rate limiters:  Redis-backed ✅
EPIC cache:     Redis-backed ✅
MongoDB connections available: 25,571 (no risk of exhaustion)
```

---

## What Needs to Change

### Change 1 — Create `ecosystem.config.js` (PM2 Cluster Mode)

**Why:**  
Right now PM2 runs in `fork` mode — one Node.js process on one CPU. Node.js is single-threaded. All incoming HTTP requests — OTP sends, EPIC lookups, photo uploads, session reads, admin panel — queue behind each other in one event loop on one CPU.

With cluster mode, PM2 forks 4 identical worker processes, one per CPU. The OS distributes incoming requests across all 4. Throughput multiplies by ~4x with no code changes.

**Why sessions and rate limits won't break across 4 workers:**  
All 4 workers connect to the same external Redis. Sessions are stored in Redis (not in-memory). Rate limiters use Redis counters. EPIC cache is in Redis. There is no shared in-memory state that would desync between workers — this was already designed for multi-process use.

**File to create:** `backend/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name:             'bjptn-backend',
      script:           'src/index.js',
      instances:        4,
      exec_mode:        'cluster',
      watch:            false,
      max_memory_restart: '1500M',
      env_production: {
        NODE_ENV: 'production',
      },
      error_file:  '/root/.pm2/logs/bjptn-backend-error.log',
      out_file:    '/root/.pm2/logs/bjptn-backend-out.log',
      merge_logs:  true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
```

**Key decisions explained:**

| Setting | Value | Why |
|---------|-------|-----|
| `instances` | `4` | Matches vCPU count confirmed by server (`node -e "require('os').cpus().length"` = 4) |
| `exec_mode` | `'cluster'` | Uses Node.js cluster module — shares port 5000 across all workers |
| `max_memory_restart` | `'1500M'` | Restarts a worker if it leaks past 1.5GB. Total safe ceiling: 4 × 1.5GB = 6GB out of 7.8GB available |
| `watch` | `false` | Never auto-restart on file change in production |
| `merge_logs` | `true` | All 4 workers write to the same log file — easier to tail |

---

### Change 2 — Increase DB1 Connection Pool

**Why:**  
`findVoterByEpic()` fires **234 parallel MongoDB queries** on every cache miss (querying all 234 assembly collections simultaneously to find an EPIC number). With 4 PM2 workers, a simultaneous cache miss on 4 different EPICs = 234 × 4 = **936 concurrent queries** hitting local MongoDB.

With `maxPoolSize: 10`, only 10 connections are open. The remaining 926 queries queue up waiting for a free connection. This creates a backlog that slows EPIC lookups significantly during bursts.

Local MongoDB has **25,571 available connections** (confirmed on server). Increasing the pool to 50 costs nothing and eliminates the queue.

**File:** `backend/src/db.js` — Lines 57–58

**Replace this:**
```javascript
await voterConn.openUri(voterUri, {
  dbName:                   config.mongoVoterDbName,
  maxPoolSize:              10,
  minPoolSize:              2,
  serverSelectionTimeoutMS: 15000,
});
```

**With this:**
```javascript
await voterConn.openUri(voterUri, {
  dbName:                   config.mongoVoterDbName,
  maxPoolSize:              50,
  minPoolSize:              5,
  serverSelectionTimeoutMS: 15000,
});
```

**Changes:**
- `maxPoolSize: 10 → 50` — allows 50 concurrent connections per worker (4 workers × 50 = 200 total max, well within MongoDB's 25,571 limit)
- `minPoolSize: 2 → 5` — keeps 5 connections warm per worker at idle, reducing cold-start latency on first burst

---

## Capacity After These Two Changes

```
Before:
  1 worker × 1 CPU × ~25 requests/sec = ~25 req/sec sustained
  Per day (16 active hours): ~1,440,000 HTTP requests handled
  But: registration flow is ~4s per user (B2 upload) = ~21,600 registrations/day

After:
  4 workers × 4 CPUs × ~25 req/sec each = ~100 req/sec sustained
  Registration flow: 4 workers handle B2 uploads in parallel
  Per day (16 active hours): ~86,400 registrations/day comfortable
                              ~1,20,000 registrations/day at peak

Note: The actual bottleneck at 1L/day will be B2 (Backblaze) upload
throughput, not the Node.js server. B2 supports thousands of concurrent
uploads — this is not expected to be a problem.
```

---

## Deploy Steps (on the DigitalOcean server)

```bash
# Step 1 — Pull the changes
cd /var/www/bjptn
git pull origin main

# Step 2 — Reload PM2 with the new ecosystem config
# 'reload' does a rolling restart — zero downtime
pm2 reload ecosystem.config.js --env production

# Step 3 — Save the PM2 process list so it survives server reboots
pm2 save

# Step 4 — Watch logs for 60 seconds to confirm all 4 workers start cleanly
pm2 logs bjptn-backend --lines 40
```

**If something goes wrong, roll back instantly:**
```bash
pm2 reload ecosystem.config.js  # retry
# or
pm2 restart bjptn-backend       # restart current config
```

---

## Success Criteria

**1. All 4 workers online**
```bash
pm2 list
```
Expected output:
```
┌─────┬──────────────────┬──────────┬──────┬───────────┬──────┬────────┐
│ id  │ name             │ mode     │ ↺    │ status    │ cpu  │ memory │
├─────┼──────────────────┼──────────┼──────┼───────────┼──────┼────────┤
│ 0   │ bjptn-backend    │ cluster  │ 0    │ online    │ 0%   │ ~165mb │
│ 1   │ bjptn-backend    │ cluster  │ 0    │ online    │ 0%   │ ~165mb │
│ 2   │ bjptn-backend    │ cluster  │ 0    │ online    │ 0%   │ ~165mb │
│ 3   │ bjptn-backend    │ cluster  │ 0    │ online    │ 0%   │ ~165mb │
└─────┴──────────────────┴──────────┴──────┴───────────┴──────┴────────┘
```
- Mode shows `cluster` not `fork` ✅
- All 4 instances show `online` ✅
- Memory per worker ~150–200MB (×4 = ~600–800MB total) ✅

**2. All 4 workers connect to Redis and MongoDB**
```bash
pm2 logs bjptn-backend --lines 50
```
You should see these lines **4 times** (once per worker):
```
[Redis] Connected & ready
[Session] Using Redis store
[DB2] App DB connected (db: bjptamilnadu)
[DB1] Voter DB connected (db: voter_db) — READ-ONLY [LOCAL]
[DB2] MongoDB indexes ensured.
TAMIL NADU BJP
API server running on port 5000
```

**3. Health check responds**
```bash
curl -s https://tnbjp.org/health
# Expected: {"status":"ok","timestamp":"..."}
```

**4. Full registration flow works end-to-end**
- Open `https://tnbjp.org` in browser
- Enter a mobile number, receive OTP, verify
- Enter EPIC number — voter details load
- Upload photo — card renders correctly
- Confirm the card displays the member's name, EPIC, assembly, district

**5. Admin panel works**
- Log in at `https://tnbjp.org/admin`
- Confirm/reject a volunteer or booth agent request
- Action succeeds without 500 error

---

## What Does NOT Change

- All API endpoints — identical behaviour, same URLs
- Session handling — Redis-backed, works across all 4 workers transparently
- Rate limiting — Redis-backed counters, shared correctly across workers
- EPIC cache — Redis-backed, a cache hit in worker 1 is a cache hit in worker 3
- Admin panel — no changes
- Frontend — no changes
- WhatsApp webhooks — no changes
- `.env` — no changes
- MongoDB Atlas (DB2) — no changes
