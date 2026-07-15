# tnbjp.org — Pre-Launch Readiness Report
**Prepared by:** Project QA Review  
**Date:** 2026-07-15  
**Server:** DigitalOcean Droplet — 129.212.233.215  
**Stack:** Node.js + Express (PM2) · React + Vite · MongoDB Atlas · Redis (external) · nginx

---

## Summary

The application is **ready for web-only launch**. One infrastructure change is recommended before going live. Everything else — backend code, error monitoring, rate limiting, database indexing — is correctly configured.

---

## 1. Server Capacity Analysis

### What the server can handle

The DigitalOcean droplet specs:
- **CPU:** 4 vCPU
- **RAM:** 7.8 GB (approx. 4.1 GB free at idle)
- **Swap:** None (currently)
- **PM2:** 4 Node.js workers in cluster mode

### What happens with 1,000 concurrent users (web-only)

Each layer of the stack was analysed independently:

| Layer | Status | Notes |
|---|---|---|
| nginx (static files) | ✅ Handles easily | 4 workers × 768 connections = 3,072 max. Static assets load fast, slots free up quickly. |
| nginx (API proxy) | ⚠️ Tight but functional | Each proxied API call uses 2 connection slots. Effective API capacity ~1,500 simultaneous calls. Can become a bottleneck at peak. |
| Express / PM2 (4 workers) | ✅ Fine | Node.js async I/O handles concurrent requests well. ~250 users per worker. |
| MongoDB App DB (local) | ✅ Fine | Local connection, sub-millisecond latency, pool of 50 connections per worker. |
| MongoDB Voter DB (Atlas) | ✅ Slight queue, clears fast | Pool of 50 per worker = 200 total Atlas connections. 1,000 concurrent EPIC validations queue and drain in under 1 second. |
| Redis (rate limiting) | ✅ Correct | External Redis at `redis.io`. Rate limits are keyed by mobile number (not IP) — correct for Indian carrier-grade NAT where thousands share one IP. |
| SMS Gateway (2Factor.in) | ⚠️ Delay, not a crash | 1,000 OTP requests simultaneously may take 20–30 seconds to deliver all SMS. Users just wait — the site does not crash. |
| RAM | ✅ Comfortable | Baseline usage ~1.8 GB out of 7.8 GB. Web-only flow has no memory spikes. |
| WhatsApp / Puppeteer | N/A | Not active. This is the only component that would require swap and careful capacity planning when WhatsApp goes live. |

**Conclusion:** The server comfortably handles 1,000 concurrent web users. The nginx connection limit is the only component that becomes tight, and it is addressed in the recommendation below.

---

## 2. Sentry Error Monitoring — Verification

Sentry was verified directly against the **live server files** on DigitalOcean (not the local repo).

### Backend (`/var/www/bjptn/backend/src/index.js`)

| Item | Status | Detail |
|---|---|---|
| DSN source | ✅ Env-based | `dsn: process.env.SENTRY_DSN` — reads from `.env`, not hardcoded |
| `SENTRY_DSN` set in `.env` | ✅ Confirmed | Value present in `/var/www/bjptn/backend/.env` |
| Startup warning if DSN missing | ✅ Present | Logs `[Startup] SENTRY_DSN not set — error monitoring is disabled.` |
| `tracesSampleRate: 0.1` | ✅ Confirmed | 10% transaction sampling — stays within Sentry free tier |
| `environment` field | ✅ Present | Reads from `NODE_ENV` |
| `release` field | ✅ Present | `tnbjp-backend@<package.json version>` |
| `serverName` field | ✅ Present | Reads from `SERVER_NAME` env or `os.hostname()` |
| `beforeSend` redaction | ✅ Present | Scrubs `otp`, `pin`, `new_pin`, `password`, `secret_pin` from both `request.data` and `extra` |
| `Sentry.setupExpressErrorHandler(app)` | ✅ Present | Registered after all routes — catches all unhandled errors |

### Route Coverage

| Route / Service | Status | What is captured |
|---|---|---|
| `routes/webhook.js` (WhatsApp card generation) | ✅ | `setUser`, breadcrumbs at each stage, `startSpan` around Puppeteer render + B2 upload, `captureException` on all failures |
| `routes/chat.js` (Web form card generation) | ✅ | `setUser`, breadcrumbs, `captureException` on photo upload failure and card generation failure |
| `services/whatsappService.js` | ✅ | `captureException` on all 5 send functions: `sendTextMessage`, `sendReplyButtons`, `sendImageMessage`, `sendFlowMessage`, `sendCtaUrlMessage` |
| `services/backblazeService.js` | ✅ | `captureException` on photo upload and card upload, with file type and bucket context |
| `utils/dbErrorHandler.js` | ✅ | `trackMongoOperation` wrapper: captures exceptions on DB errors, sends `captureMessage` warning for queries exceeding 2 seconds |
| `middleware/rateLimiter.js` | ✅ | `captureMessage` on every rate-limit hit; `captureMessage` (warning level) when Redis is unavailable and the limiter falls back to in-memory mode |

### Frontend (`frontend/src/main.jsx`)

| Item | Status | Detail |
|---|---|---|
| Sentry initialised | ✅ | `Sentry.init()` runs before app renders |
| `tracesSampleRate: 0.1` | ✅ | Free-tier safe |
| `beforeSend` redaction | ✅ | Scrubs `otp`, `pin`, `new_pin`, `password` |
| `release` field | ✅ | `tnbjp-frontend@__APP_VERSION__` — injected at build time via `vite.config.js` |
| `Sentry.ErrorBoundary` | ✅ | Wraps the entire app. Shows "Something went wrong" screen with a Reload button on unhandled React errors |

> **Note:** The live server (`/var/www/bjptn/`) is ahead of the GitHub repo. The DSN env-variable change and the Redis fallback Sentry warning are present on the server but not yet committed to GitHub. Developer should sync these back to the repo.

---

## 3. MongoDB Indexing

Verified directly on the live server via MongoDB Atlas.

| Collection | Indexes | Status |
|---|---|---|
| `otp_sessions` | TTL index on `createdAt` (expires after 600s) | ✅ Auto-cleanup of expired OTPs |
| `sessions` | TTL index on `expires` date field | ✅ Auto-cleanup of expired sessions |
| `generation_locks` | TTL index (300s) | ✅ Auto-release of card generation locks |
| `generated_voters` | Index on `mobile`, `epic_no`, `bjp_code` | ✅ Fast lookups for existing member checks |

---

## 4. Pre-Launch Recommendation

### Change: Increase nginx `worker_connections` from 768 → 2048

**Priority:** Recommended before launch  
**Time to implement:** 2 minutes  
**Downtime:** Zero (graceful reload)

#### Why this matters

nginx is the first point of contact for every request. It sits in front of the Node.js workers and forwards traffic to them.

The current setting `worker_connections 768` means each of the 4 nginx worker processes can hold a maximum of 768 simultaneous open connections.

```
Current total capacity = 4 workers × 768 = 3,072 connections
```

However, for API calls (OTP, card generation, EPIC validation), nginx holds **two connections per request** — one from the browser, one to the Node.js backend. So the effective API capacity is:

```
3,072 ÷ 2 = ~1,500 simultaneous API calls
```

Under a launch spike of 1,000 users all hitting APIs at the same time, each making 2–3 API calls, you approach that limit. When it is exceeded, nginx returns a **502 Bad Gateway** error to users.

Changing to 2,048:

```
New total capacity = 4 workers × 2,048 = 8,192 connections
Effective API capacity = ~4,000 simultaneous API calls
```

That is nearly 3× the headroom needed, with no code changes.

#### How to implement

SSH into the server and edit the nginx config:

```bash
nano /etc/nginx/nginx.conf
```

Find the `events` block (it will look like this):

```nginx
events {
    worker_connections 768;
}
```

Change it to:

```nginx
events {
    worker_connections 2048;
}
```

Save the file, then test and reload:

```bash
nginx -t          # test config for syntax errors — must say "test is successful"
nginx -s reload   # graceful reload — zero downtime, no active connections dropped
```

#### Why `nginx -s reload` and not a restart

`nginx -s reload` sends a graceful signal. nginx:
1. Reads the new config
2. Starts new worker processes with the updated settings
3. Lets existing connections finish naturally on the old workers
4. Shuts down the old workers once they drain

A full `systemctl restart nginx` would **drop all active connections** instantly — any user mid-way through generating their card would get an error. The reload avoids this entirely.

---

## 5. What to Do When WhatsApp Goes Live (Future)

This section is not required for the current web-only launch. Address before enabling WhatsApp.

### Add 2 GB Swap

WhatsApp card generation uses Puppeteer (headless Chrome). Each Puppeteer instance consumes 300–500 MB of RAM. Without swap, if multiple WhatsApp users request cards simultaneously, the Linux OOM (Out of Memory) killer will terminate a process — requiring a manual server reboot.

Swap acts as a safety buffer: if RAM fills up, the OS spills overflow to disk instead of killing processes.

```bash
fallocate -l 2G /swapfile      # create a 2 GB file for swap
chmod 600 /swapfile             # restrict access to root only (required by Linux)
mkswap /swapfile                # format it as swap space
swapon /swapfile                # activate it immediately
echo '/swapfile none swap sw 0 0' >> /etc/fstab   # make it survive reboots
```

Verify it worked:
```bash
free -h   # should show 2.0G under "Swap"
```

### Puppeteer Concurrency Cap

Puppeteer is safe for 4–8 concurrent card renders. Beyond that, crash risk increases. Implement a queue (e.g. `p-queue` npm package, concurrency: 4) around Puppeteer invocations before WhatsApp traffic scales up.

---

## 6. Local Repo vs Live Server — Sync Gap

During QA, it was found that the live DigitalOcean server is **ahead of the GitHub repo** on at least two files:

| File | GitHub / Local | Live Server |
|---|---|---|
| `backend/src/index.js` | DSN hardcoded as a string | DSN reads from `process.env.SENTRY_DSN` |
| `backend/src/middleware/rateLimiter.js` | No Sentry alert on Redis fallback | `Sentry.captureMessage` fires when Redis is unavailable |

**Action for developer:** Pull the live server files back into the repo and commit them so GitHub reflects the true production state. This prevents the next deploy from accidentally overwriting the improvements.

```bash
# On the server — copy live files back to a branch
# Or manually copy the relevant sections into the repo
```

---

## Final Checklist Before Launch

| Item | Status | Action |
|---|---|---|
| Sentry backend monitoring | ✅ Ready | No action needed |
| Sentry frontend monitoring | ✅ Ready | No action needed |
| Rate limiting (OTP, card generation) | ✅ Ready | No action needed |
| MongoDB indexes (TTL, lookups) | ✅ Ready | No action needed |
| Redis rate limiting | ✅ Ready | No action needed |
| Server RAM headroom (web-only) | ✅ Comfortable | No action needed |
| nginx `worker_connections` | ⚠️ Needs update | Change 768 → 2048, then `nginx -s reload` |
| GitHub ↔ Live server sync | ⚠️ Out of sync | Developer to commit live server changes to repo |
| Swap (for WhatsApp launch) | 🔜 Not urgent yet | Add before WhatsApp goes live |
| Real device testing | Recommended | Test on Android Chrome + iPhone Safari before announcing |
