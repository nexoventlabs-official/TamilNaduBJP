# Sentry Quick Reference Card

## 🎯 At a Glance

| Document | Priority | Time | Purpose |
|----------|----------|------|---------|
| `SENTRY_README.md` | **START HERE** | 5 min | Overview & guide |
| `SENTRY_IMPLEMENTATION_SUMMARY.md` | Read First | 10 min | Business case & plan |
| `SENTRY_OPTIMIZATION_URGENT.md` | 🔥 DO TODAY | 30 min | Fix cost & security |
| `SENTRY_OPTIMIZATION_HIGH_PRIORITY.md` | ⚠️ THIS WEEK | 2-3 hr | Track all errors |
| `SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md` | 📊 WEEKS 2-3 | 3-4 hr | Performance insights |

---

## 🚨 Critical Issues (Fix Today)

### Issue 1: Exceeding Free Tier
**Problem:** Tracking 75,000 transactions/month (free tier: 10,000)
**Fix:** Change `tracesSampleRate: 1.0` to `0.1` 
**Files:** `backend/src/index.js`, `frontend/src/main.jsx`
**Time:** 5 minutes

### Issue 2: Security Vulnerability  
**Problem:** OTPs/PINs sent to Sentry cloud
**Fix:** Add `beforeSend` hook to redact sensitive data
**Files:** `backend/src/index.js`, `frontend/src/main.jsx`
**Time:** 10 minutes

### Issue 3: No Environment Tags
**Problem:** Can't distinguish prod vs dev errors
**Fix:** Add `environment: process.env.NODE_ENV`
**Files:** `backend/src/index.js`, `frontend/src/main.jsx`
**Time:** 5 minutes

**Total Urgent Time: 30 minutes**

---

## 📋 Implementation Checklist

### Today (30 min)
- [ ] Reduce transaction sampling to 10%
- [ ] Add sensitive data filtering
- [ ] Add environment tags
- [ ] Test: Check Sentry dashboard

### This Week (2-3 hours)
- [ ] Track webhook card generation errors
- [ ] Track web form card generation errors
- [ ] Track WhatsApp API errors
- [ ] Track B2 upload errors
- [ ] Track MongoDB query errors
- [ ] Add user context (mobile, epicNo)
- [ ] Add breadcrumbs (operation trail)

### Weeks 2-3 (3-4 hours)
- [ ] Add performance transactions
- [ ] Add React error boundaries
- [ ] Enhanced session tracking
- [ ] Custom dashboards

---

## 💬 AI IDE Prompts (Copy-Paste Ready)

### Prompt 1: Urgent Fixes
```
Please implement all changes from SENTRY_OPTIMIZATION_URGENT.md.

Priority changes:
1. Change tracesSampleRate from 1.0 to 0.1 in:
   - backend/src/index.js (line 12-15)
   - frontend/src/main.jsx (line 8-11)

2. Add beforeSend hook to filter sensitive data:
   - Remove: otp, pin, new_pin, password, secret_pin
   - Replace with: "[REDACTED]"

3. Add environment tracking:
   - Backend: environment: process.env.NODE_ENV
   - Frontend: environment: import.meta.env.MODE

Follow the exact code examples in the document.
Show me a summary of files changed when done.
```

### Prompt 2: High Priority Tracking
```
Please implement error tracking from SENTRY_OPTIMIZATION_HIGH_PRIORITY.md.

Work through Implementation Checklist sequentially:

Phase 1 (45 min): Webhook Card Generation
- File: backend/src/routes/webhook.js
- Function: handleImageMessage
- Add: User context, breadcrumbs, error tracking for photo download, card gen, uploads

Phase 2 (30 min): Web Form Card Generation
- File: backend/src/routes/chat.js
- Route: POST /generate-card
- Add: Same pattern as Phase 1

Phase 3 (20 min): WhatsApp Service
- File: backend/src/services/whatsappService.js
- Add error tracking to all functions

Phase 4 (20 min): B2 Upload Service
- File: backend/src/services/backblazeService.js
- Add error tracking to upload functions

Phase 5 (25 min): MongoDB Error Tracking
- Create: backend/src/utils/dbErrorHandler.js
- Update critical DB queries

Confirm after each phase before proceeding.
```

---

## 🔍 Verification Commands

### Check Transaction Sampling Working
```bash
# Backend logs should show:
# "Sentry init: tracesSampleRate = 0.1"

# In Sentry dashboard → Performance:
# Should see ~10% of actual traffic
```

### Verify Sensitive Data Filtering
```bash
# Trigger OTP error:
curl -X POST http://localhost:5000/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"mobile":"9999999999","otp":"123456"}'

# Check Sentry dashboard:
# OTP field should show: "[REDACTED]"
```

### Check Error Tracking Active
```bash
# Trigger test error in card generation
# Check Sentry Issues tab
# Should see: tags, user context, breadcrumbs
```

---

## 📊 Expected Results

### Sentry Dashboard (After Urgent)
```
Performance Tab:
✅ Transaction count: ~7,500/month (was 75,000)
✅ Within free tier limits

Issues Tab:
✅ Errors tagged with environment: production
✅ Sensitive data shows as "[REDACTED]"
```

### Sentry Dashboard (After High Priority)
```
Issues Tab:
✅ Card generation errors with full context
✅ WhatsApp API errors with recipient info
✅ B2 upload errors with file size
✅ MongoDB errors with query details
✅ User context on all errors (mobile, epicNo)
✅ Breadcrumbs show operation steps
```

### Error Context Example
```
Error: Puppeteer timeout
Tags:
  - operation: card_generation
  - source: whatsapp
  - stage: puppeteer_render
User:
  - mobile: 8106811285
  - epicNo: ABC123
Extra:
  - photoSizeKB: 8192
  - durationMs: 15000
  - bjpCode: BJP-ABC123
Breadcrumbs:
  1. Card generation started
  2. Photo downloaded (8MB)
  3. Puppeteer render started
  4. Timeout after 15s
```

---

## 💰 Cost Tracking

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Errors/month | 300 | 300 | ✅ Within 5K limit |
| Transactions/month | 75,000 | 7,500 | ✅ Within 10K limit |
| Free tier status | ❌ Exceeded | ✅ Within limits | ✅ FREE |
| Monthly cost | $26 (paid) | $0 (free) | ✅ SAVINGS |

---

## 🎯 Success Metrics

### Week 1 Targets
- [ ] All card generation errors visible in Sentry
- [ ] Response time to issues: <30 minutes
- [ ] Zero sensitive data leaks

### Month 1 Targets
- [ ] Card generation success rate: >98%
- [ ] Average debug time: <15 minutes
- [ ] Error rate: <2%

### Month 3 Targets
- [ ] User completion rate: >95%
- [ ] Zero silent failures
- [ ] Proactive issue resolution (before user complaints)

---

## 🆘 Common Issues

| Problem | Solution |
|---------|----------|
| Transactions still high | Reduce tracesSampleRate to 0.05 |
| Errors not appearing | Check DSN, NODE_ENV, network |
| Too many errors shown | Filter by environment:production |
| Performance impact? | <1% overhead, async operations |
| Sensitive data leaked? | Check beforeSend hook active |

---

## 📱 Quick Contact

**Sentry Dashboard:** https://sentry.io/organizations/your-org/
**Documentation:** See full docs in this folder
**Support:** Check SENTRY_README.md troubleshooting section

---

## ⚡ Super Quick Start (5 Minutes)

1. **Read:** `SENTRY_README.md` (2 min)
2. **Copy:** Urgent Prompt (above) to AI IDE
3. **Wait:** 20 minutes for implementation
4. **Test:** Verify transaction sampling reduced
5. **Deploy:** Push to production

**Done! You've prevented:**
- ❌ $26/month unexpected costs
- ❌ Security vulnerability (OTP leaks)
- ❌ Debugging confusion (prod vs dev)

---

## 📚 Document Structure

```
SENTRY_README.md                          ← START HERE
  ↓
SENTRY_IMPLEMENTATION_SUMMARY.md          ← Business case
  ↓
SENTRY_OPTIMIZATION_URGENT.md             ← 🔥 TODAY (30 min)
  ↓
SENTRY_OPTIMIZATION_HIGH_PRIORITY.md      ← ⚠️ THIS WEEK (2-3 hr)
  ↓
SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md    ← 📊 WEEKS 2-3 (3-4 hr)
```

---

## 🎓 Key Concepts

**Transaction Sampling:**
- 1.0 = Track 100% (expensive)
- 0.1 = Track 10% (free tier)
- 0.05 = Track 5% (very conservative)

**Sensitive Data:**
- OTP, PIN, password fields
- Must be redacted before Sentry
- Use beforeSend hook

**User Context:**
- Identifies who had error
- mobile, epicNo, bjpCode
- Set with Sentry.setUser()

**Breadcrumbs:**
- Trail of operations
- Shows what led to error
- Add with Sentry.addBreadcrumb()

**Tags:**
- Categorize errors
- Filter in dashboard
- Example: operation:card_generation

---

## 🚀 Ready to Go?

**Right Now:**
1. Open `SENTRY_README.md`
2. Copy Urgent Prompt to AI IDE
3. Watch it implement
4. Verify in Sentry dashboard

**This Week:**
5. Copy High Priority Prompt to AI IDE
6. Verify all errors tracked

**Weeks 2-3:**
7. Copy Medium Priority Prompt
8. Enjoy performance insights

**Total time: 5.5 hours for production-grade monitoring**

---

## ✅ Final Check

Before starting:
- [ ] Backed up current code?
- [ ] Read SENTRY_README.md?
- [ ] Understand why urgent?
- [ ] Ready for 30 min work?

After urgent fixes:
- [ ] Transaction count reduced?
- [ ] Sensitive data redacted?
- [ ] Environment tags visible?
- [ ] Deployed to production?

**All checked? You're good to go! 🎉**
