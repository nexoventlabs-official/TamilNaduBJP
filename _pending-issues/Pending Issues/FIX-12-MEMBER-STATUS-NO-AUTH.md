# FIX-12 — No Auth on `/member-status` Exposes Political Engagement Data

**Severity:** MEDIUM (Security / Privacy)  
**File:** `backend/src/routes/chat.js` — Line 1221  
**Estimated Fix Time:** 10 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The `GET /member-status/:bjpCode` endpoint returns sensitive political engagement data for any BJP code — with no session authentication required:

```javascript
router.get('/member-status/:bjpCode', async (req, res) => {
  try {
    const bjpCode = req.params.bjpCode;
    // ← No req.session.verified_mobile check
    const db = getDb();
    const voter = await db.collection('generated_voters').findOne({ bjp_code: bjpCode });
    ...
    return res.json({
      success: true,
      referred_count: voter.referred_members_count || 0,
      has_appointment: !!appointment,
      local_body_interest: voter.local_body_interest || null,
      volunteer_status: volReq ? volReq.status : null,   // ← Are they a volunteer?
      booth_agent_status: baReq ? baReq.status : null,   // ← Are they a booth agent?
      created_at: voter.created_at || voter.generated_at || null,
      appreciation_earned_at: appreciation_earned_at
    });
```

BJP codes follow the format `BJP-XXXXXXXX` where X is a hex character (0–9, A–F). There are 16^8 = ~4.3 billion possible codes, but in practice only your registered members (up to 1 lakh) have valid codes. A scraper can try random codes or enumerate from referral links seen publicly.

---

## How It Affects the Drive

- **Intelligence leak:** An adversary who collects BJP codes (from WhatsApp referral links) can determine who your active volunteers and booth agents are — your ground-level campaign infrastructure
- **Targeted harassment:** Knowing who is a booth agent in which constituency allows targeted intimidation or disruption of those individuals
- **Referral count enumeration:** Reveals which members are your top recruiters — valuable opposition intelligence
- **Local body interest data:** Reveals constituency-level political sentiment — useful to competitors planning their own campaigns
- **Timing data:** `created_at` and `appreciation_earned_at` reveal campaign activity patterns
- DPDP Act 2023 compliance: exposing individual political engagement data without consent is a regulatory risk

---

## The Fix

Add session authentication. The member-status endpoint is used by the chatbot to show a member their own status — the caller should always be authenticated.

**File:** `backend/src/routes/chat.js` — Line 1221:

```javascript
// BEFORE
router.get('/member-status/:bjpCode', async (req, res) => {
  try {
    const bjpCode = req.params.bjpCode;
    const db = getDb();
```

```javascript
// AFTER
router.get('/member-status/:bjpCode', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = req.params.bjpCode;
    const db = getDb();

    // Verify session mobile owns this BJP code
    const voter = await db.collection('generated_voters').findOne({ bjp_code: bjpCode });
    if (!voter) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (voter.MOBILE_NO && voter.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
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

**1. Unauthenticated request is blocked**
```bash
curl -s https://tnbjp.org/api/member-status/BJP-ABCD1234

# Expected: HTTP 401
# {"success":false,"message":"Authentication required."}
# Before fix: HTTP 200 with full engagement data
```

**2. Member can see their own status**
- Logged-in member (session set) opens their profile
- `GET /member-status/BJP-ABCD1234` (their own code) returns their data
- Volunteer status, booth agent status, referral count all displayed correctly

**3. Member cannot see another member's status**
```bash
# Logged in as owner of BJP-ABCD1234, requesting BJP-WXYZ5678
# Expected: HTTP 403 {"success":false,"message":"Access denied."}
```

**4. Political engagement data is private**
- Volunteer and booth agent identities cannot be enumerated externally
- Only each member can see their own status
- Opposition groups cannot map your ground-level campaign infrastructure
