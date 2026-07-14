# Sentry Optimization - Implementation Guide

## 📚 Documentation Overview

This folder contains comprehensive documentation for implementing Sentry error tracking and performance monitoring in the BJP Tamil Nadu membership application.

---

## 📄 Documents

### 1. **START HERE:** `SENTRY_IMPLEMENTATION_SUMMARY.md`
**Read this first** - High-level overview of:
- Current situation (what works, what's missing)
- Why this matters (business impact)
- Implementation phases (urgent, high, medium priority)
- Cost analysis (stay in free tier)
- Success criteria

**Time to read:** 5-10 minutes

---

### 2. **URGENT:** `SENTRY_OPTIMIZATION_URGENT.md` 🔥
**Implement today** (30 minutes):
- Fix transaction sampling (prevent paid tier)
- Add sensitive data filtering (security)
- Add environment tags (production vs dev)

**Why urgent:**
- Currently exceeding free tier by 7.5x
- OTPs/PINs exposed in Sentry (security risk)
- No way to distinguish prod errors from dev errors

**Give to AI IDE:** Full document with detailed code changes

---

### 3. **HIGH PRIORITY:** `SENTRY_OPTIMIZATION_HIGH_PRIORITY.md` ⚠️
**Implement this week** (2-3 hours):
- Track card generation errors (90% of issues)
- Track photo upload failures
- Track WhatsApp API errors
- Track MongoDB query errors
- Add user context and breadcrumbs

**Why high priority:**
- Currently blind to 90% of production errors
- Users experience silent failures
- No way to debug issues after they occur

**Give to AI IDE:** Full document with implementation checklist

---

### 4. **MEDIUM PRIORITY:** `SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md` 📊
**Implement in 2-3 weeks** (3-4 hours):
- Performance transaction tracking
- Frontend React error boundaries
- Enhanced user session tracking
- Custom dashboards

**Why medium priority:**
- Nice-to-have, not critical
- Builds on urgent + high priority work
- Provides insights and optimization opportunities

**Give to AI IDE:** After urgent and high priority complete

---

## 🚀 Quick Start

### For Human Review (You)

**Step 1:** Read `SENTRY_IMPLEMENTATION_SUMMARY.md` (10 minutes)
- Understand what's missing
- Review business impact
- Check cost analysis

**Step 2:** Review `SENTRY_OPTIMIZATION_URGENT.md` (10 minutes)
- Understand urgent issues
- Review proposed solutions
- Verify changes make sense

**Step 3:** Give to AI IDE for implementation (see below)

---

### For AI IDE Implementation (Claude/Cursor/etc.)

**Phase 1: Urgent Fixes (Today)**
```
Prompt for AI IDE:
"Please implement all changes from SENTRY_OPTIMIZATION_URGENT.md.

Focus on these three issues:
1. Change tracesSampleRate from 1.0 to 0.1 in backend/src/index.js and frontend/src/main.jsx
2. Add beforeSend hook to filter sensitive data (OTP, PIN, passwords)
3. Add environment and release tracking

Follow the code examples exactly as written in the document.
After implementation, show me a summary of files changed."
```

**Phase 2: High Priority (This Week)**
```
Prompt for AI IDE:
"Please implement all error tracking from SENTRY_OPTIMIZATION_HIGH_PRIORITY.md.

Follow the Implementation Checklist:
- Phase 1: Webhook Card Generation (45 minutes)
- Phase 2: Web Form Card Generation (30 minutes)  
- Phase 3: WhatsApp Service (20 minutes)
- Phase 4: B2 Upload Service (20 minutes)
- Phase 5: MongoDB Error Tracking (25 minutes)

Work through each phase sequentially.
After each phase, confirm completion before moving to next."
```

**Phase 3: Medium Priority (Weeks 2-3)**
```
Prompt for AI IDE:
"Please implement performance monitoring from SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md.

This builds on the previous urgent and high-priority fixes.
Focus on adding performance transactions to track operation duration."
```

---

## ✅ Verification After Each Phase

### After Urgent Fixes
1. Check Sentry dashboard → Performance tab
2. Verify transaction count drops to ~10% of previous
3. Trigger test error with OTP
4. Verify OTP shows as "[REDACTED]" in Sentry
5. Check error tags include `environment: production`

### After High Priority
1. Trigger card generation error (test)
2. Check Sentry Issues tab
3. Verify error includes:
   - User context (mobile, epicNo)
   - Breadcrumbs (operation steps)
   - Tags (operation type, source)
   - Extra data (file sizes, durations)

### After Medium Priority
1. Check Sentry Performance tab
2. Verify transactions show operation breakdown
3. Check spans show duration of each step
4. Verify slow operations flagged

---

## 📊 What Each Phase Achieves

| Phase | Before | After | Impact |
|-------|--------|-------|--------|
| **Urgent** | 75K transactions/month (❌ over limit) | 7.5K transactions/month (✅ within limit) | Stay in free tier, save $26/month |
| **Urgent** | OTPs visible in Sentry (🔐 security risk) | OTPs redacted (✅ secure) | Compliance + security |
| **High** | 20% errors tracked | 100% errors tracked | Full visibility |
| **High** | No user context | Full user context | Know who's affected |
| **Medium** | No performance data | Full performance insights | Identify bottlenecks |

---

## 🔍 What Gets Tracked After Implementation

### Errors Tracked
- ✅ Card generation failures (Puppeteer crashes)
- ✅ Photo download failures (WhatsApp media)
- ✅ Photo upload failures (B2/Backblaze)
- ✅ WhatsApp message send failures
- ✅ MongoDB query errors and timeouts
- ✅ Image processing failures (Sharp)
- ✅ Admin login failures (already tracked)
- ✅ EPIC validation failures (already tracked)

### Performance Tracked
- ✅ Card generation duration (total + per-step)
- ✅ Photo download time
- ✅ Puppeteer render time
- ✅ B2 upload time
- ✅ MongoDB query time
- ✅ WhatsApp API response time

### Context Tracked
- ✅ User identification (mobile, epicNo, bjpCode)
- ✅ Operation breadcrumbs (step-by-step trail)
- ✅ File sizes (photo, card)
- ✅ Error classification (tags)
- ✅ Environment (production vs development)
- ✅ Server name (useful when scaling)

---

## 💰 Cost Impact

### Current
```
Sentry Free Tier: 5K errors + 10K transactions/month
Your usage: 300 errors + 75K transactions
Status: ❌ Exceeding transaction limit by 7.5x
Cost: Will trigger paid tier ($26/month)
```

### After Urgent Fixes
```
Sentry Free Tier: 5K errors + 10K transactions/month  
Your usage: 300 errors + 7.5K transactions
Status: ✅ Within limits
Cost: FREE (₹0/month)
```

**Savings: $26/month = $312/year**

---

## 🛡️ Security Improvements

### Before
- ❌ OTPs sent to Sentry cloud (6-digit codes visible)
- ❌ PINs sent to Sentry cloud (4-digit codes visible)
- ❌ Passwords could be logged in errors
- ❌ No data filtering

### After
- ✅ All sensitive fields redacted with "[REDACTED]"
- ✅ OTPs never leave your server in plaintext
- ✅ PINs never leave your server in plaintext
- ✅ Compliance with data privacy standards

---

## 📈 Business Impact

### Scenario 1: Card Generation Failure

**Before Implementation:**
```
User: Uploads photo via WhatsApp
System: Puppeteer crashes
User: Sees "Card generation failed"
You: No notification, no logs, no context
User: Tries again, fails again
User: Gives up frustrated
Result: Lost member, bad experience
```

**After Implementation:**
```
User: Uploads photo via WhatsApp
System: Puppeteer crashes
Sentry: Sends alert to your email/Slack
You: Opens Sentry dashboard
  Error: "Puppeteer timeout - memory limit exceeded"
  User: Mobile 8106811285, EPIC ABC123
  Photo: 12MB (too large!)
  Breadcrumb: Download OK → Render started → Out of memory
You: Contacts user: "Your photo is too large, please compress to under 10MB"
User: Compresses photo, retries, succeeds
Result: Member onboarded, happy user
```

### Scenario 2: WhatsApp API Down

**Before Implementation:**
```
WhatsApp API: Rate limit exceeded
System: Silently fails to send 50 cards
Users: Never receive cards
You: Discover issue 3 days later from user complaints
Result: 50 users affected, manual recovery needed
```

**After Implementation:**
```
WhatsApp API: Rate limit exceeded
Sentry: Alert triggered "10+ WhatsApp failures in 5 minutes"
You: Notified immediately
You: Checks Sentry - sees rate limit error
You: Implements backoff strategy, contacts Meta support
Users: Delayed but eventually receive cards
Result: Issue caught in 5 minutes, not 3 days
```

---

## 🎯 Success Metrics

Track these after implementation:

### Week 1
- [ ] 0 urgent issues missed
- [ ] All card generation errors visible
- [ ] Response time to issues: <30 minutes

### Month 1
- [ ] Error rate: <2%
- [ ] Card generation success rate: >98%
- [ ] Average debug time: <15 minutes (down from 2 hours)

### Month 3
- [ ] User completion rate: >95%
- [ ] Retry rate: <5%
- [ ] Zero silent failures

---

## 🆘 Troubleshooting

### Issue: "Transactions still high"
**Solution:** Reduce `tracesSampleRate` to 0.05 (5%)

### Issue: "Errors not appearing in Sentry"
**Check:**
1. DSN correct in backend/frontend?
2. NODE_ENV set properly?
3. Network connectivity to Sentry.io?
4. Sentry SDK version compatible?

### Issue: "Too many errors in dashboard"
**Solution:** 
1. Filter by `environment:production`
2. Filter by `tag:operation:card_generation`
3. Set up alert rules for critical errors only

### Issue: "Performance impact concerns"
**Answer:** 
- Sentry overhead: <1%
- Only sampled transactions tracked (10%)
- All operations are async (non-blocking)
- No user-facing impact

---

## 📞 Support

If AI IDE encounters issues:
1. Check prerequisites completed
2. Verify Sentry SDK installed: `npm list @sentry/node`
3. Test Sentry connectivity: Add test error, check dashboard
4. Review Sentry docs: https://docs.sentry.io/platforms/node/

---

## 🎓 Learning Resources

- Sentry Node.js Docs: https://docs.sentry.io/platforms/node/
- Sentry React Docs: https://docs.sentry.io/platforms/javascript/guides/react/
- Performance Monitoring: https://docs.sentry.io/product/performance/
- Error Tracking: https://docs.sentry.io/product/issues/

---

## ✨ Final Checklist

Before you start:
- [ ] Read SENTRY_IMPLEMENTATION_SUMMARY.md
- [ ] Understand business impact
- [ ] Review cost analysis
- [ ] Backup current code
- [ ] Set aside time (30 min urgent, 2-3 hours high priority)

During implementation:
- [ ] Follow documents in order (urgent → high → medium)
- [ ] Test after each phase
- [ ] Verify in Sentry dashboard
- [ ] Check no sensitive data exposed

After implementation:
- [ ] Set up Sentry alerting rules
- [ ] Monitor error trends weekly
- [ ] Review performance metrics
- [ ] Adjust sampling rate if needed

---

## 🎉 Expected Outcome

After full implementation:
- ✅ 100% error visibility (up from 20%)
- ✅ <15 minute debug time (down from 2 hours)
- ✅ Proactive issue detection (before users complain)
- ✅ Performance insights (identify bottlenecks)
- ✅ Better user experience (faster issue resolution)
- ✅ Stay in Sentry free tier (no unexpected costs)

**Time investment: 5.5 hours**
**Value: Prevent hundreds of hours of blind debugging**

---

## 🚀 Ready to Start?

1. Read `SENTRY_IMPLEMENTATION_SUMMARY.md` (10 min)
2. Give `SENTRY_OPTIMIZATION_URGENT.md` to AI IDE (30 min)
3. Verify urgent fixes working
4. Give `SENTRY_OPTIMIZATION_HIGH_PRIORITY.md` to AI IDE (2-3 hours)
5. Verify high-priority tracking working
6. Schedule medium-priority for weeks 2-3

**Start with urgent fixes today!**
