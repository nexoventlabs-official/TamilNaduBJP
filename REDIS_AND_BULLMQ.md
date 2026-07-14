# Redis & BullMQ in this Project

_Last updated: 14 July 2026_

> **Status at a glance**
> - **Redis** — ✅ **Implemented and in production.** Used for the voter/EPIC cache, cross-instance rate limiting, and session storage.
> - **BullMQ** — ❌ **Not implemented.** It was evaluated for scaling card generation; the web flow was scaled a different way (client-side rendering + presigned uploads + unified voter lookup), so a job queue was not needed. BullMQ remains the recommended tool **if/when the WhatsApp server-side card path needs to scale** (details in §6).

---

## 1. The Redis Instance

- A **managed Redis** instance (Redis Cloud) is used.
- Configured via a single env var in `backend/.env`:
  ```
  REDIS_URL=redis://default:<password>@<host>:<port>
  ```
- Version in use: Redis 8.x (standalone). Connection is plain `redis://` (no TLS) from the droplet.
- If `REDIS_URL` is **unset**, the app degrades gracefully (see §2): cache falls back to an in-memory map and sessions fall back to MongoDB. This keeps local/dev working without Redis.

---

## 2. The Shared Redis Client — `backend/src/redis.js`

A single **ioredis** client is created once and shared across the app.

```js
const Redis  = require('ioredis');
const config = require('./config');

let client = null;
let ready  = false;

if (config.redisUrl) {
  client = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 2,     // fail fast so callers can fall back
    enableOfflineQueue:   true,
    connectTimeout:       10000,
    retryStrategy(times) { return Math.min(times * 300, 3000); }, // backoff, capped 3s
  });
  client.on('ready',        () => { ready = true;  console.log('[Redis] Connected & ready'); });
  client.on('error',        (e) => { ready = false; console.error('[Redis] Error:', e.message); });
  client.on('end',          () => { ready = false; });
  client.on('reconnecting', () => {});
}

function isReady() { return !!client && ready; }
module.exports = { client, isReady };
```

**Key design choices**
- **Single client, reused everywhere** — cache, rate limiting, and sessions all share it (one connection pool).
- **`isReady()` guard** — callers check this before using Redis and fall back if it's down, so a Redis outage never hard-crashes the app.
- **Fail-fast retries** — `maxRetriesPerRequest: 2` means a command rejects quickly instead of hanging, letting the fallback kick in.

Client library versions: `ioredis@5`.

---

## 3. Use #1 — Voter / EPIC Cache (`backend/src/db.js`)

Every card generation validates an EPIC via `findVoterByEpic()`. Results are cached in Redis so repeat lookups are instant.

- **Key:** `epic:<EPIC_NO>`
- **Value:** the JSON voter document
- **TTL:** 1 hour (`EX 3600`)
- **Only successful lookups are cached** — never `null` (so a transient miss doesn't poison the cache with a false "not found").

```js
// read: Redis first, then bounded in-memory fallback
async function _cacheGet(epicNo) {
  if (redis.isReady()) {
    try { const raw = await redis.client.get(`epic:${epicNo}`); if (raw) return JSON.parse(raw); }
    catch (e) { /* fall through */ }
  }
  // in-memory fallback (see below)
}

// write: Redis (TTL) + bounded in-memory fallback
async function _cacheSet(epicNo, data) {
  if (redis.isReady()) {
    try { await redis.client.set(`epic:${epicNo}`, JSON.stringify(data), 'EX', 3600); } catch (e) {}
  }
  // in-memory fallback with 50k cap
}
```

**Bounded in-memory fallback.** If Redis is unavailable, a plain `Map` is used — but capped at **50,000 entries** (oldest evicted first). This is critical: the original code used an *unbounded* Map that would grow forever and eventually OOM the droplet. The cap removes that risk.

**Why it matters for scale:** the unified `voters_all` lookup is ~1 ms cold; a Redis cache hit is sub-millisecond and offloads the DB entirely for repeat EPICs during a rally.

---

## 4. Use #2 — Rate Limiting (`backend/src/middleware/rateLimiter.js`)

Rate limits are stored in Redis (via `rate-limit-redis`) instead of per-process memory, so they hold **across multiple app instances** behind a load balancer.

```js
const { RedisStore } = require('rate-limit-redis');
const redis = require('../redis');

function makeStore(prefix) {
  if (!redis.client) return undefined;   // no REDIS_URL → in-memory fallback
  return new RedisStore({
    sendCommand: (...args) => redis.client.call(...args),
    prefix,                               // distinct prefix per limiter (counters never collide)
  });
}
```

Each limiter gets its **own key prefix** so their counters are independent:

| Limiter | Prefix | Policy |
|---------|--------|--------|
| Admin login | `rl:adminlogin:` | 5 / 15 min |
| OTP send | `rl:otp:` | 3 / 5 min |
| OTP verify | `rl:verifyotp:` | 5 / 15 min |
| Card generation | `rl:gencard:` | 15 / 10 min (keyed by session mobile) |
| EPIC validate | `rl:validateepic:` | 10 / 60 s |
| Check-mobile | `rl:checkmobile:` | 5 / 5 min |
| Public verify | `rl:publicverify:` | 10 / 60 s |

Library versions: `rate-limit-redis@4` (pinned to v4 because v5 requires `express-rate-limit@8`, and the project uses v7).

**Fallback:** if `REDIS_URL` is unset, `makeStore` returns `undefined` and `express-rate-limit` uses its default in-memory store (correct for a single instance only).

---

## 5. Use #3 — Session Storage (`backend/src/index.js` + `backend/src/redisSessionStore.js`)

User sessions (e.g. `verified_mobile` after login, admin login) are stored in Redis so they are shared across instances and survive restarts.

```js
// index.js
const RedisSessionStore = require('./redisSessionStore');
const sessionStore = redis.client
  ? new RedisSessionStore({ client: redis.client, prefix: 'sess:', ttl: 86400 })  // 24h
  : MongoStore.create({ /* Mongo fallback when Redis absent */ });

app.use(session({ secret: config.sessionSecret, resave: false, saveUninitialized: false, store: sessionStore, ... }));
```

### Why a custom session store (`redisSessionStore.js`)?
The popular `connect-redis` package **only speaks the node-redis API**, not ioredis. On this project's ioredis client it threw `ERR syntax error` on every session write (it calls `client.set(key, val, { expiration: { type: 'EX', value: ttl } })`, which ioredis doesn't understand).

So a **small ioredis-native store** (~50 lines) was written instead — it subclasses `express-session`'s `Store` and uses ioredis' real command signatures:

```js
class RedisSessionStore extends session.Store {
  set(sid, sess, cb) {
    this.client.set(this._key(sid), JSON.stringify(sess), 'EX', this._ttl(sess))
      .then(() => cb && cb(null)).catch(e => cb && cb(e));
  }
  get(sid, cb) { /* GET + JSON.parse */ }
  touch(sid, sess, cb) { /* EXPIRE */ }
  destroy(sid, cb) { /* DEL */ }
}
```

- **Key prefix:** `sess:`
- **TTL:** 24 hours (refreshed on `touch`)
- **Fallback:** MongoDB (`connect-mongo`) when Redis is not configured.

> Note: rotating `SESSION_SECRET` (done during the security hardening) invalidates all existing sessions — everyone re-logs in once. Expected.

---

## 6. BullMQ — Evaluated, Not Implemented

**BullMQ is a Redis-backed job queue.** It was considered for scaling card generation to very high concurrency (the "10k members" goal). It is **not currently in the codebase.** Here is the honest reasoning.

### Why it was NOT needed for the web flow
The web card is **rendered in the user's browser** (client-side canvas), not on the server. The two heavy server costs were removed differently:
1. **Photo upload** → the browser now uploads **directly to Backblaze B2** via a presigned URL (photo bytes + image compression never touch the server).
2. **EPIC lookup** → replaced the 234-collection fan-out with a **single indexed query** on the unified `voters_all` collection (~1 ms).

With those two changes, the remaining per-registration server work is tiny (two indexed writes), so there is **nothing heavy to queue** — a job queue would only add latency and complexity. See `VOTER_LOOKUP_OPTIMIZATION.md`.

### Where BullMQ *would* be the right tool
The **WhatsApp** registration path renders the card **on the server with Puppeteer** (`cardGenerator.js`), which is CPU/RAM heavy and currently capped by an in-process semaphore (`MAX_CARD_CONCURRENCY`, default 4). If that path ever needs to absorb large bursts, BullMQ is the correct upgrade:

- **Producer:** the webhook accepts the photo, adds a job to a Redis queue, and replies "generating…".
- **Worker(s):** a separate process (run under PM2) consumes jobs, renders the card with Puppeteer at a controlled concurrency, uploads to B2, and sends it to WhatsApp.
- **Benefits:** bursts are buffered in Redis (no OOM), failed renders retry automatically, jobs survive restarts, and throughput scales by adding worker processes.

**Important reality:** BullMQ does not render faster — it smooths and parallelizes. Throughput = `workers × concurrency ÷ render-time`. A 10k WhatsApp burst would **drain over minutes**, not instantly, but without crashing.

### If BullMQ is added later (sketch)
```
backend/src/queue/cardQueue.js     # new Queue('card-gen', { connection: redisUrl })
backend/src/worker.js              # new Worker('card-gen', processor, { concurrency: 4 })  ← run as a 2nd PM2 process
```
It would reuse the **same `REDIS_URL`** and the existing ioredis client pattern. No new infrastructure required beyond a worker process.

---

## 7. Summary Table

| Concern | Backed by | Key/prefix | Fallback if Redis down | File |
|---------|-----------|------------|------------------------|------|
| Voter/EPIC cache | Redis | `epic:<EPIC>` (TTL 1h) | Bounded in-memory Map (50k) | `src/db.js` |
| Rate limiting | Redis (`rate-limit-redis`) | `rl:*` per limiter | In-memory store | `src/middleware/rateLimiter.js` |
| Sessions | Redis (custom store) | `sess:<sid>` (TTL 24h) | MongoDB (`connect-mongo`) | `src/index.js`, `src/redisSessionStore.js` |
| Job queue (BullMQ) | — (not used) | — | — | — |

## 8. Dependencies
```
ioredis            ^5      # shared Redis client
rate-limit-redis   ^4      # Redis store for express-rate-limit v7
connect-mongo      *       # session fallback store
# NOT installed: bullmq, connect-redis (connect-redis was removed — ioredis-incompatible)
```

## 9. Operational Notes
- **Rotate the Redis password** if it has been shared, and update `REDIS_URL` on the droplet + local `.env`.
- A Redis outage is non-fatal: cache → in-memory, sessions → MongoDB, rate limits → in-memory. The app keeps serving.
- All three uses share **one** Redis connection; monitor Redis memory/connections if traffic grows.
