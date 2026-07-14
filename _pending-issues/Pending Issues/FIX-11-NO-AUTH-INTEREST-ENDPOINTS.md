# FIX-11 — No Auth on Interest Endpoints Allows Data Poisoning

**Severity:** MEDIUM (Security)  
**File:** `backend/src/routes/chat.js` — Lines 1270, 1297  
**Estimated Fix Time:** 15 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

Two POST endpoints update member interest data without any session authentication check:

**`POST /local-body-interest` (line 1270):**
```javascript
router.post('/local-body-interest', async (req, res) => {
  try {
    const { bjp_code, interest } = req.body;
    // ← No req.session.verified_mobile check
    // Anyone who knows a BJP code can update this
    await db.collection('generated_voters').updateOne(
      { bjp_code },
      { $set: { local_body_interest: interest } }
    );
```

**`POST /save-meeting-interest` (line 1297):**
```javascript
router.post('/save-meeting-interest', async (req, res) => {
  try {
    const { bjp_code, interest } = req.body;
    // ← No req.session.verified_mobile check
    // Anyone who knows a BJP code can update this
    await db.collection('appointments').updateOne(
      { bjp_code },
      { $set: { interest, created_at: new Date() } },
      { upsert: true }
    );
```

BJP codes are visible in every referral link that members share publicly on WhatsApp:
`https://tnbjp.org/refer/BJP-ABCD1234/REF-XXXXXXXX`

Anyone who receives a referral link can extract the BJP code and use it to update that member's interest flags — no login required.

---

## How It Affects the Drive

- A rival group or individual collects BJP referral links shared on WhatsApp (they are public)
- Extracts the BJP code from the URL pattern
- Runs a script to POST `{ bjp_code: "BJP-ABCD1234", interest: "not_interested" }` to both endpoints for every collected code
- Your database now shows thousands of active members as "not interested" in local body elections and meetings
- Campaign organisers use this data to prioritise follow-up calls — they stop calling your most active members
- Rally attendance planning is corrupted — you bring extra chairs where no one shows up, miss areas where everyone is eager
- This data is used to decide who to invite for leadership roles — the wrong people get passed over

---

## The Fix

Add a session authentication check to both endpoints, and verify the session mobile owns the BJP code being updated.

**File:** `backend/src/routes/chat.js`

**Fix `/local-body-interest` (line 1270):**
```javascript
// BEFORE
router.post('/local-body-interest', async (req, res) => {
  try {
    const { bjp_code, interest } = req.body;
```

```javascript
// AFTER
router.post('/local-body-interest', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { bjp_code, interest } = req.body;
    
    // Verify the session mobile owns this BJP code
    const db = getDb();
    const member = await db.collection('generated_voters').findOne(
      { bjp_code },
      { projection: { MOBILE_NO: 1 } }
    );
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (member.MOBILE_NO && member.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
```

**Fix `/save-meeting-interest` (line 1297) — same pattern:**
```javascript
// AFTER
router.post('/save-meeting-interest', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { bjp_code, interest } = req.body;

    // Verify the session mobile owns this BJP code
    const db = getDb();
    const member = await db.collection('generated_voters').findOne(
      { bjp_code },
      { projection: { MOBILE_NO: 1 } }
    );
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (member.MOBILE_NO && member.MOBILE_NO !== req.session.verified_mobile) {
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

**1. Unauthenticated update is rejected**
```bash
curl -s -X POST https://tnbjp.org/api/local-body-interest \
  -H "Content-Type: application/json" \
  -d '{"bjp_code":"BJP-ABCD1234","interest":"not_interested"}'

# Expected: HTTP 401
# {"success":false,"message":"Authentication required."}
# Before fix: HTTP 200 — data updated silently
```

**2. Authenticated member can only update their own record**
```bash
# Logged in as BJP-ABCD1234 (mobile 9876543210), trying to update BJP-WXYZ5678 (different member)
# Expected: HTTP 403 {"success":false,"message":"Access denied."}
```

**3. Legitimate use case still works**
- Member opens "Are you interested in local body elections?" dialog in the app
- They are logged in (have a session)
- They tap "Yes" — their own record is updated
- Interest is saved: HTTP 200 `{"success":true}`

**4. Interest data in the database is trustworthy**
- Every `local_body_interest` and `appointments` record was set by the member themselves
- Campaign team can rely on this data for outreach planning
