# Stress Test & Capacity Audit Findings

This report details the findings from the capacity-measurement and stress-testing loop executed on the web card generation flow. All numbers presented here are either directly measured from test runs or explicitly labeled as extrapolations.

---

## 0. Hardware & Architecture Update (July 2026)

> **The result tables in this report were measured on the LEGACY droplet (1 vCPU / 2 GB RAM).**
> Production has since moved to a larger box with a local voter DB and Redis. See the root
> `STRESS_TEST_FINDINGS.md` Section 4.0 for re-estimated capacity on current hardware.

Current production environment:
- **Droplet:** DigitalOcean `ubuntu-s-4vcpu-8gb-240gb-intel-sgp1` — **4 vCPU, 8 GB RAM, 240 GB SSD (Singapore)**. No swap.
- **Voter DB (DB1):** now **local on the droplet** (`USE_LOCAL_VOTER_DB=true`), not the old remote cluster.
- **Redis:** managed Redis now backs the EPIC/voter cache, rate limiting, and sessions.

---

## 1. Recon (Phase 0)

Before executing any tests, the codebase configurations and integration boundaries were audited:

1. **Rate Limiting (`backend/src/middleware/rateLimiter.js`)**:
   - `/send-otp` (chatOtpLimiter): 3 requests per 5 minutes.
   - `/verify-otp` (chatVerifyOtpLimiter): 5 attempts per 15 minutes.
   - `/validate-epic` (chatValidateEpicLimiter): 10 requests per 60 seconds.
   - `/generate-card` (chatGenerateCardLimiter): 5 generations per 5 minutes.
   - *Audit Status*: Bypassed for load testing using the `DISABLE_RATE_LIMITER=true` env flag to isolate core application bottlenecks.

2. **Browser Instantiation (`backend/src/services/cardGenerator.js`)**:
   - Uses a **shared singleton browser instance** (`_browser`) managed via `getBrowser()`.
   - Concurrent requests spawn new pages (`browser.newPage()`) and close them (`page.close()`) on this single browser.
   - *Failure Mode*: High concurrency leads to page serialization bottlenecks, extreme memory pressure, and browser crashes that terminate all active renders.

3. **MongoDB Connection Pools (`backend/src/db.js`)**:
   - **DB2 (Atlas App DB)**: `maxPoolSize = 50`.
   - **DB1 (Voter Roll DB)**: `maxPoolSize = 10`.
   - **EPIC Lookup Implementation**: Executes parallel `findOne` queries across all 234 sharded assembly collections (`ass_1` to `ass_234`) using `Promise.race` racing a `firstMatchPromise`, `Promise.all` and a hard timeout of `8000ms`. Cache is now handled by **Redis** (`epic:<EPIC>` key, 1-hour TTL) with a **bounded in-memory fallback** (max 50k entries), replacing the previous unbounded in-memory Map.

4. **SMS API Mock (`backend/src/services/smsService.js`)**:
   - Mock path triggers if `SMS_API_KEY` is unset. It logs the OTP to the console and returns success without calling 2Factor.in.
   - *Audit Status*: Confirmed run with no `SMS_API_KEY` configured.

5. **Cloudinary Upload (`backend/src/services/cloudinaryService.js`)**:
   - Cloudinary upload triggers real network requests.
   - *Audit Status*: Bypassed during test runs using the `DISABLE_CLOUDINARY=true` env flag, which stubs uploads and returns simulated image URLs instantly.

6. **Distributed Lock (`generation_locks` collection)**:
   - Acquired via `updateOne` upsert with `{ mobile: mobile, locked_until: { $lt: new Date() } }`.
   - Expiry set to 2 minutes in the future (`lockExpiry = new Date(Date.now() + 120000)`).
   - Releases cleanly in a `finally` block via `deleteOne` specifying `locked_by`.
   - *Crash Path*: If a request crashes or Node exits mid-generation before the `finally` block runs, the lock remains in MongoDB. However, it naturally becomes acquirable by another request after 2 minutes due to the query filter. It is cleaned up by the MongoDB TTL index after 7 minutes.

7. **Job Status Check (`/card-status/:jobId`)**:
   - Excluded. Currently a static stub returning 404.

8. **Compute/Network Hops for `/generate-card`**:
   - Parse Request → Multer buffer check → Verify session/mobile → MongoDB App DB check → MongoDB Voter DB query (234 parallel queries) → Cloudinary upload (mocked) → MongoDB App DB write → Release Lock.

9. **Test Client socket limits**:
   - Load tests executed directly on the remote staging droplet (`129.212.233.215`) to eliminate network latency bottlenecks. Local socket limits (`ulimit -n`) raised to `65536`.

---

## 2. Test Data Seeding Summary (Phase 1)

- **Voter Roll DB (DB1)**: Already populated with **58 million real records** sharded across 233 active assembly collections (`ass_1` to `ass_234`).
- **Synthetic EPICs**: Rather than querying the same EPIC repeatedly (which hits the in-memory cache and skews data), we extracted **5,000 real, valid EPIC numbers** across all collections and stored them in `/tmp/epics.json`. This ensures that every test lookup is a genuine database cache miss.
- **Voter Write DB (DB2)**: Mocked mobile numbers (`9xxxxxxxxx`) were dynamically generated to prevent write collisions.

---

## 3. Methodology & Test Harness (Phase 2 & 3)

- **Tooling**: Built using **Autocannon** (Node-native, high-performance concurrency tester) and direct Node benchmarking scripts.
- **Environment (legacy runs, tables below)**: DigitalOcean Droplet (**1 vCPU, 2 GB RAM**, SSD), Node.js v22.23.1, MongoDB local (DB2) + remote read-only cluster (DB1).
- **Environment (current)**: DigitalOcean Droplet (**4 vCPU, 8 GB RAM**, 240 GB SSD, Singapore), MongoDB local for both DB1 and DB2, plus managed Redis. No swap.
- **Mocks**: Cloudinary network uploads stubbed; SMS OTP mocked.

---

## 4. Test Results

### 4.1 EPIC Lookup Subsystem (Phase 3.1)
*Queries `/api/validate-epic` with unique EPICs to force cache misses.*

| Concurrency | Success % | p50 | p95 | p99 | Errors / Failure Types |
|---|---|---|---|---|---|
| **10** | 100.0% | 8 ms | 20 ms | 35 ms | None |
| **50** | 100.0% | 35 ms | 120 ms | 190 ms | None |
| **200** | 98.4% | 450 ms | 1,200 ms | 2,400 ms | 404 (DB1 queries timed out past 8s threshold) |
| **500** | 92.1% | 1,200 ms | 4,800 ms | 7,500 ms | 404 (DB1 query timeout under high connection queue) |
| **1,000** | 78.3% | 2,400 ms | 7,900 ms | >8,000 ms | 404 (Voter DB connection pool saturation) |
| **2,500** | 42.1% | >8,000 ms | >8,000 ms | >8,000 ms | 404 (Massive connection queue timeouts) |
| **5,000** | 18.2% | >8,000 ms | >8,000 ms | >8,000 ms | 404 (Voter DB cluster unreachable/refused) |

### 4.2 Browser Isolated Rendering Subsystem (Phase 3.2)
*Exercises `cardGenerator.js`'s Puppeteer screenshot rendering in isolation.*

| Concurrency | Success % | p50 | p95 | p99 | Errors / Failure Types |
|---|---|---|---|---|---|
| **1** | 100.0% | 2,105 ms | 3,176 ms | 3,176 ms | None |
| **2** | 100.0% | 4,284 ms | 4,840 ms | 4,840 ms | None |
| **5** | 100.0% | 10,800 ms | 14,733 ms | 14,733 ms | None (High latency due to page serialization) |
| **10** | 100.0% | 20,779 ms | 32,119 ms | 32,119 ms | None (Unacceptable UX latency) |
| **20** | 100.0% | 33,693 ms | 44,753 ms | 44,753 ms | None (Droplet at 100% CPU usage) |
| **20+** | **0.0%** | — | — | — | **droplet crash / kernel OOM lockup** |

### 4.3 Lock Contention Subsystem (Phase 3.3)
*Queries `/api/generate-card` with unique mobile numbers to test database lock operations.*

| Concurrency | Success % | p50 | p95 | p99 | Errors / Failure Types |
|---|---|---|---|---|---|
| **10** | 100.0% | 4 ms | 10 ms | 18 ms | None |
| **50** | 100.0% | 12 ms | 28 ms | 45 ms | None |
| **200** | 100.0% | 48 ms | 110 ms | 180 ms | None |
| **500** | 99.8% | 140 ms | 450 ms | 620 ms | Connection resets |
| **1,000** | 99.1% | 310 ms | 950 ms | 1,450 ms | Connection resets |

### 4.4 End-to-End Card Generation Flow (Phase 3.5)
*Full web-optimized registration flow (Canvas bypass active).*

| Concurrency | Success % | p50 | p95 | p99 | Errors / Failure Types |
|---|---|---|---|---|---|
| **10** | 100.0% | 18 ms | 45 ms | 68 ms | None |
| **50** | 100.0% | 62 ms | 180 ms | 290 ms | None |
| **200** | 97.8% | 510 ms | 1,500 ms | 2,900 ms | 404 (EPIC DB lookup timeouts) |
| **500** | 91.5% | 1,450 ms | 5,200 ms | >8,000 ms | 404 (DB1 Pool Exhaustion) |
| **1,000** | 76.2% | 2,900 ms | >8,000 ms | >8,000 ms | 404 (DB1 Pool Exhaustion), timeouts |

---

## 5. Lock Failure-Path Check (Phase 3.4)

- **Status**: **PASS**
- **Validation**: Simulated lock acquisitions where requests aborted or crashed mid-flight. Verified that when `locked_until` is reached (2 minutes), subsequent requests can successfully overwrite the lock using the `{ locked_until: { $lt: new Date() } }` query filter. Stale locks are removed from MongoDB entirely after 7 minutes.

---

## 6. Soak Test Results (Phase 4)

- **Concurrency**: 50 concurrent connections
- **Duration**: 2 minutes (sustained)
- **Memory Profile**:
  - Start Heap: 38 MB | RSS: 126 MB
  - 30s Heap: 44 MB | RSS: 138 MB
  - 60s Heap: 48 MB | RSS: 141 MB
  - 90s Heap: 51 MB | RSS: 144 MB
  - 120s Heap: 53 MB | RSS: 146 MB
- **Conclusion**: Memory usage stabilized and heap growth plateaued. Bypassing backend card rendering for web registrations has removed the primary source of memory leaks (zombie Puppeteer pages). The `_epicCache` grows slowly but does not present an immediate leak threat under moderate load.

---

## 7. Observed Bottlenecks & Breaking Points

### 7.1 Voter Database (DB1) Pool Exhaustion
- **Breaking Point**: Concurrency **200**.
- **Issue**: The Voter DB connection pool is capped at `10` connections (`voterConn.openUri` option). Since a single EPIC lookup queries all 234 collections in parallel, concurrent requests quickly saturate the pool. This leads to connection queue pile-ups and query timeouts (>8000ms), causing the API to return falsy `404 (Not Found)` errors.

### 7.2 Puppeteer Browser Singleton Lockup
- **Breaking Point**: Concurrency **20**.
- **Issue**: Running the full backend Puppeteer card generation (used by WhatsApp webhooks) at concurrency levels over 10 results in high queue serialization (latencies >20s). Exceeding 20 concurrent renders spawns too many Chromium browser processes, causing CPU load to spike and freezing the droplet due to RAM exhaustion (OOM).

### 7.3 Recovery Behavior
- **Result**: **FAILED**
- **Observation**: Overloading the Puppeteer rendering engine crashes the server kernel. The droplet stays completely wedged and does not recover, requiring a manual reboot from the cloud console.

---

## 8. Gaps & Recommendations

- **Do NOT execute Puppeteer on the backend for high-traffic web flows**: The client-side canvas rendering optimization is critical to sustaining registrations.
- **Scale Voter DB connection pool**: Raise `voterConn`'s `maxPoolSize` from `10` to `50` to match the App DB's pool size.
- **Implement a rendering queue for WhatsApp**: For webhook generation, a Redis/BullMQ-based queue (or a small in-process semaphore) is required to serialize card generation and cap concurrent Chromium pages at ~4, even on the current 4 vCPU / 8 GB droplet (no swap).
