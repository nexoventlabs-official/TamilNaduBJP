# tnbjp.org — Launch Readiness: Cross-Check & Changes Applied

**Date:** 2026-07-15
**Server:** DigitalOcean Droplet — 129.212.233.215
**Purpose:** Verifies the claims in `LAUNCH_READINESS_REPORT.md` against the live server, records corrections, and documents the infrastructure changes that were applied.

---

## 1. Cross-Check of the Original Report

Every claim in `LAUNCH_READINESS_REPORT.md` was checked directly on the live droplet.

### ✅ Confirmed correct

| Claim | Verified value |
|---|---|
| Server: 4 vCPU, ~7.8 GB RAM | `free -h` → 7.8 Gi total; `worker_processes auto` = 4 |
| No swap (at time of report) | `swapon --show` was empty |
| PM2: 4 workers, cluster mode | 4 workers `online` |
| nginx `worker_connections 768` | Confirmed in `/etc/nginx/nginx.conf` |
| Sentry backend (DSN via env, sampling 0.1, beforeSend redaction, environment/release/serverName, Express handler) | All present; **live delivery test passed** (event reached Sentry, `flush` = true) |
| Sentry route coverage (webhook, chat, whatsappService, backblazeService, dbErrorHandler, rateLimiter) | All present |
| Sentry frontend (init, 0.1 sampling, beforeSend, release, ErrorBoundary) | All present |
| `generated_voters` indexes on `MOBILE_NO` (unique), `EPIC_NO`, `bjp_code` | Confirmed in `db.js` |
| `otp_sessions` TTL (600s), `generation_locks` TTL (300s) | Confirmed |
| Rate limiting keyed by mobile number | Confirmed |
| nginx recommendation 768 → 2048 and its math | Sound |

### ❌ Corrections (report was wrong or outdated)

1. **"MongoDB Atlas" is incorrect — the databases are LOCAL on the droplet.**
   - `MONGO_URI` uses the `mongodb://` scheme (Atlas uses `mongodb+srv://`), and a local `mongod` service is **active**. The voter DB connection logs `[DB1] ... READ-ONLY [LOCAL]`.
   - **Impact:** the real capacity bottleneck is **not** "200 Atlas connections queueing" — it is **CPU/RAM contention on the single box**, where 4 Node workers + local MongoDB (app data **and** the 56.5M-row voter DB) + the Redis client all share 4 vCPU / 7.8 GB RAM. `free -h` shows ~3.6 GB used + ~3.3 GB cache (MongoDB working set), ~4.2 GB available — tighter than the report's "comfortable 1.8 GB baseline."

2. **Sessions are Redis-backed, not a MongoDB `sessions` TTL collection.** Sessions use the Redis store with an EX (expiry) TTL; the MongoDB `sessions` collection is only a fallback if Redis is unavailable.

3. **The "Local vs Live sync gap" section is now stale.** The local code already reads the Sentry DSN from `process.env.SENTRY_DSN` and already has the Redis-fallback Sentry alert, so local matches live for those files. (Committing to GitHub is still good hygiene.)

4. **The report predates recent features** (still accurate, just newer than the snapshot): admin OTP login (whitelisted mobiles), OTP verification for **all** member registrations, rolling 1-hour inactivity sessions, and the iOS card-download fix (Web Share + in-app preview overlay).

**Overall:** the report's core conclusion — *ready for web-only launch, bump nginx `worker_connections`* — was valid. The "Atlas" mislabel was the one material error.

---

## 2. Changes Applied

### Change 1 — nginx connection capacity (DONE ✅)

**What:** `worker_connections 768` → `2048` in `/etc/nginx/nginx.conf`.

| | Before | After |
|---|---|---|
| Total connections | 4 × 768 = 3,072 | 4 × 2,048 = **8,192** |
| Effective API capacity (2 conns/API call) | ~1,500 | **~4,000** |

**Why:** each API call (OTP, card generation, EPIC lookup) uses two nginx connections (browser + backend). At ~1,500 the server would start returning **502 Bad Gateway** during a launch spike. 2,048 gives ~3× the headroom needed for 1,000 concurrent users.

**How it was applied (zero downtime):**
- Backed up config → `/etc/nginx/nginx.conf.bak.pre2048`
- Edited value, ran `nginx -t` → *test successful*
- `nginx -s reload` (graceful — existing connections finished, no drops)
- Verified: 4 workers running, homepage returns HTTP 200.

### Change 2 — 4 GB swap file (DONE ✅)

**What:** created a 4 GB swap file, persistent across reboots, with low swappiness.

**Why:** the DB + app share one box with **zero swap**. Under a launch spike, if RAM fills, the Linux **OOM killer** would force-kill MongoDB or a Node worker → site crash + manual reboot. Swap turns that into a brief slowdown instead of a crash.

**How it was applied:**
```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab        # persist across reboots
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf
sysctl -w vm.swappiness=10                              # only spill under real pressure
```

**Verified:** `free -h` shows Swap 4.0 Gi (0 B used at idle); `swapon --show` lists `/swapfile`; fstab entry present; `vm.swappiness = 10`.

> `swappiness=10` means Linux keeps using fast RAM for normal work and only touches swap when memory is genuinely tight — so no everyday slowdown, purely a safety net.

---

## 3. Current Live State (post-changes)

| Item | Value |
|---|---|
| nginx `worker_connections` | **2048** (`worker_processes auto` = 4) |
| RAM | 7.8 Gi total, ~4.2 Gi available |
| Swap | **4.0 Gi** (swappiness 10) |
| PM2 | 4 workers, cluster, `online` |
| MongoDB | local `mongod` active (app DB + voter DB, both local) |
| Sentry | active, verified delivering |

---

## 4. Remaining Recommendations (not yet done)

| Priority | Item | Why |
|---|---|---|
| **High** | **Automated MongoDB backups** (daily `mongodump`, kept locally + copied off-site) | The DB is **local**, so there are **no managed Atlas backups**. A droplet failure = total data loss without this. |
| Medium | **Cap MongoDB WiredTiger cache** (e.g. ~2.5 GB) | Prevents MongoDB from consuming RAM Node needs under load. Requires a brief `mongod` restart. |
| Medium | **Confirm 2factor plan TPS + balance** | Every member registration now sends an OTP, so SMS volume is higher than the original report assumed. |
| Medium | **Real-device testing** | Android Chrome + iPhone Safari + iPhone Chrome (iOS download path was recently fixed). |
| Low | **Commit live state to GitHub** | Keep the repo in sync so a future deploy doesn't regress the DSN/Sentry/rate-limit changes. |
| Future | **Add swap tuning / move MongoDB to its own instance** | For scale beyond ~1–2k concurrent, isolating the 56.5M voter DB frees the droplet's CPU for Node. |
| Future | **Puppeteer concurrency cap + more swap** | Only when the WhatsApp flow is enabled (Puppeteer uses 300–500 MB per render). |

---

## 5. Launch Checklist (updated)

| Item | Status |
|---|---|
| Sentry backend + frontend monitoring | ✅ Ready (verified delivering) |
| Rate limiting (OTP, card gen) — mobile-keyed | ✅ Ready |
| MongoDB indexes (TTL, lookups) | ✅ Ready |
| Redis rate limiting / sessions | ✅ Ready |
| nginx `worker_connections` | ✅ **Done — 2048** |
| Server swap | ✅ **Done — 4 GB** |
| Admin OTP login (whitelisted numbers) | ✅ Ready |
| Member OTP verification (all registrations) | ✅ Ready |
| MongoDB automated backups | ⚠️ **Recommended before launch** |
| 2factor plan TPS + balance | ⚠️ Confirm |
| Real-device testing | 🔜 Recommended |
| GitHub ↔ live sync | 🔜 Housekeeping |

**Verdict:** Web-only launch readiness is in good shape. The two infrastructure gaps flagged in the original report (nginx capacity, swap) are now closed. The most important open item is **automated database backups**, since the data lives on a single local MongoDB with no managed backup.
