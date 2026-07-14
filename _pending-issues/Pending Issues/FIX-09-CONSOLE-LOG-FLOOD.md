# FIX-09 — Console Log Flood Degrades Event Loop Under Load

**Severity:** HIGH (Performance)  
**File:** `backend/src/db.js` — Line 224  
**Estimated Fix Time:** 10 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

Every EPIC cache miss logs a line before querying:

```javascript
console.log(`[DB1] Querying ${allCollections.length} collections for ${epicNo} in parallel`);
```

**Note:** Since the `voters_all` optimisation (VOTER_LOOKUP_OPTIMIZATION.md), the 234 parallel fan-out only runs as a fallback. The fast path via `voters_all` still logs on cache miss:

```javascript
console.log(`[DB1] Cache MISS for ${epicNo} — querying all 234 collections`);
```

This log fires on every new EPIC that hasn't been seen before. During the first hours of a campaign event, most EPICs are new (cold cache). At 100 new registrations per minute, that's 100 log lines per minute minimum — plus match/not-found lines, plus the 234-collection fan-out lines if `voters_all` is bypassed.

Node.js `console.log` writes to stdout synchronously (it calls `process.stdout.write` which can block the event loop on high-frequency writes). Under sustained log pressure, this adds measurable latency to every incoming request.

---

## How It Affects the Drive

- Registration response times increase from ~200ms to 500ms–1s under heavy load
- The event loop is partially blocked by stdout writes — all async operations slow down
- At a campaign event with 200 registrations per minute and a cold cache, this is ~200 log lines per minute
- PM2 log files grow rapidly — if disk fills up (240GB total, but log rotation may not be configured), the process can stall
- Harder to read useful errors in logs because they're buried in EPIC lookup noise
- `pm2 logs` becomes unusable for real-time monitoring during the drive

---

## The Fix

**1. Remove or downgrade the cache miss log to debug level**

**File:** `backend/src/db.js` — Line 224:

```javascript
// BEFORE
console.log(`[DB1] Cache MISS for ${epicNo} — querying all 234 collections`);
```

```javascript
// AFTER — only log in development, silent in production
if (process.env.NODE_ENV !== 'production') {
  console.log(`[DB1] Cache MISS for ${epicNo}`);
}
```

**2. Also suppress the per-query log (line 214 area):**

```javascript
// BEFORE
console.log(`[DB1] Querying ${allCollections.length} collections for ${epicNo} in parallel`);
```

```javascript
// AFTER — remove entirely, it's noise
// (the cache HIT / ✓ Found / ✗ Not found logs below are sufficient)
```

**3. Keep the useful logs (these are fine — they're low frequency):**
- `[DB1] Cache HIT for ${epicNo} ⚡` — only fires on repeat lookups (low volume)
- `[DB1] ✓ Found ${epicNo}: ${name} — cached ✅` — fires once per new EPIC (useful)
- `[DB1] ✗ EPIC ${epicNo} not found` — fires on invalid EPICs (useful for fraud detection)

**4. Configure PM2 log rotation to prevent disk fill:**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend

# Install log rotation (one-time)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 save
```

---

## How Success Looks

**1. Logs are clean and readable during high-traffic periods**
```bash
pm2 logs bjptn-backend --lines 50
# During 100 registrations/minute, logs show:
# [DB1] ✓ Found AYR2750958: KALIDHAS — cached ✅
# [DB1] Cache HIT for TN123456 ⚡
# (No flood of "Cache MISS" or "Querying X collections" lines)
```

**2. Registration response times stay low under load**
- p95 response time for `/generate-card` stays under 300ms even at 100 concurrent registrations
- No event loop lag warnings in Sentry

**3. Log files stay manageable**
```bash
ls -lh /root/.pm2/logs/
# Log files rotate at 50MB
# Old logs compressed with .gz extension
# Maximum 7 log files retained
```

**4. Disk usage stays under control**
```bash
df -h /
# /dev/vda1 should not grow rapidly during drive operation
```
