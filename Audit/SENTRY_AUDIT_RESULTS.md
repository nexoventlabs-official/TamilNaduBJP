# Sentry Audit — Results

_Completed & deployed: 13 July 2026 · Production: `tnbjp.org` / `tamilnadubjp.live` (droplet `129.212.233.215`)_

This document maps every issue raised in the audit
(`SENTRY_OPTIMIZATION_URGENT.md`, `SENTRY_OPTIMIZATION_HIGH_PRIORITY.md`,
`SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md`) to what was actually fixed.

> Note: the audit's code samples targeted Sentry SDK **v7** (`Sentry.startTransaction`).
> The project runs **v8.18.0**, so the implementation uses the current
> `Sentry.startSpan` API instead.

---

## URGENT

| # | Issue found in audit                                                                   | Fix applied                                                                                                      | Status   |
| - | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| 1 | Transaction sampling at `1.0` (100%) → ~75k transactions/month, 7.5x over free tier | `tracesSampleRate` set to `0.1` in `backend/src/index.js` and `frontend/src/main.jsx`                    | ✅ Fixed |
| 2 | Sensitive data (OTP, PIN, password) sent to Sentry cloud                               | `beforeSend` hook redacts `otp`, `pin`, `new_pin`, `password`, `secret_pin` before send              | ✅ Fixed |
| 3 | No environment differentiation (prod vs dev errors mixed)                              | Added `environment`, `release`, `serverName`; frontend `__APP_VERSION__` injected via `vite.config.js` | ✅ Fixed |

## HIGH PRIORITY

| # | Issue found in audit                                                   | Fix applied                                                                                                                                 | Status   |
| - | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 4 | Webhook card generation errors untracked (Puppeteer crashes, timeouts) | User context + breadcrumbs +`captureException` around photo download, render, upload in `routes/webhook.js`; slow-render warning (>10s) | ✅ Fixed |
| 5 | Web-form card generation errors untracked                              | User context, breadcrumbs, photo-upload + catch-all capture in `routes/chat.js`                                                           | ✅ Fixed |
| 6 | WhatsApp API send failures only logged to console                      | `captureException` added to all send fns (text, buttons, image, flow, cta_url) in `services/whatsappService.js`                         | ✅ Fixed |
| 7 | Backblaze B2 upload failures untracked                                 | `captureException` with file size + bucket context in `services/backblazeService.js` (`uploadPhoto`)                                  | ✅ Fixed |
| 8 | MongoDB query errors/timeouts untracked                                | New `utils/dbErrorHandler.js` (`trackMongoOperation`) wired around `findVoterByEpic`; flags queries >2s                               | ✅ Fixed |

## MEDIUM PRIORITY

* #Issue found in auditFix appliedStatus9No performance transactions (can't see operation durations/bottlenecks)`Sentry.startSpan` spans around Puppeteer render and B2 upload✅ Fixed10No frontend React error boundary (crashes → blank page)`Sentry.ErrorBoundary` with reload fallback wrapping the app in `main.jsx`✅ Fixed

---

## Additional issues found & fixed during implementation

| Issue                                                                                                          | Fix applied                                                                                                           | Status                    |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Audit code used deprecated Sentry v7 API (`startTransaction`)                                                | Reworked to installed v8 `startSpan` API                                                                            | ✅ Fixed                  |
| Nginx served blank assets after deploy —`dist/assets` uploaded with `700` perms caused 404 + SPA fallback | `chmod 755` dir + `644` files; JS/CSS now serve HTTP 200                                                          | ✅ Fixed                  |
| Suspected Backblaze "Class B cap exceeded" errors                                                              | Investigated: errors were historical (last ~11:27 UTC); live photo download verified HTTP 200 — no current cap issue | ✅ Verified (false alarm) |

---

## Files changed

```
backend/src/index.js
backend/src/routes/webhook.js
backend/src/routes/chat.js
backend/src/services/whatsappService.js
backend/src/services/backblazeService.js
backend/src/utils/dbErrorHandler.js   (new)
frontend/src/main.jsx
frontend/vite.config.js
```

## Verification

- ✅ All backend files pass `node --check` (locally and on the droplet).
- ✅ Frontend `npm run build` succeeds (vite v5, 415 modules).
- ✅ `pm2 restart bjptn-backend` → online, `Environment : production`, `/health` returns ok, both DBs connected.
- ✅ Site + hashed assets serve HTTP 200.

## Rollback

```
cp -r /var/www/bjptn/backend/src.bak.deploy/* /var/www/bjptn/backend/src/ && pm2 restart bjptn-backend
```
