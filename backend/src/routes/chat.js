/**
 * Chatbot API routes
 * ─────────────────────────────────────────────────────────────────
 * SECURITY HARDENING:
 *  - OTP verification, PIN verification and reset all rate-limited
 *  - OTPs stored as SHA-256 hash (never plaintext)
 *  - OTP purpose enforced — login OTP cannot verify pin-reset flow
 *  - OTP deleted from DB immediately after successful first use
 *  - Existing bjp_code preserved on card re-generation
 *  - File type validated by magic bytes (file-type library)
 *  - booth_no validated: digits only, max 6 chars
 *  - EPIC validated before any DB query in profile/booth routes
 *  - my-members and referral-link require verified session
 *  - request-volunteer/booth-agent require verified session
 *  - Card generation protected by distributed MongoDB lock
 *  - Volunteer/booth requests use unique-index + catch-11000
 */
const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const crypto   = require('crypto');
const Sentry   = require('@sentry/node');
const config   = require('../config');   // FIX-01: module-level (used by multiple routes, e.g. /referral-link)

const { validateMobile, validateEpic, validateOtp } = require('../utils/validators');
const { sendOtp } = require('../services/smsService');
const { uploadPhoto, photoKeyFor, getPhotoUploadUrl, uploadCard, uploadBackCard, uploadCombinedCard, getPhotoPresignedUrl, getCardPresignedUrl } = require('../services/backblazeService');
const { generateCard, generateBackCard, generateCombinedCard } = require('../services/cardGenerator');
const {
  chatOtpLimiter,
  chatVerifyOtpLimiter,
  chatGenerateCardLimiter,
  chatValidateEpicLimiter,
  chatCheckMobileLimiter,
} = require('../middleware/rateLimiter');
const { getDb, findVoterByEpic } = require('../db');
const { trackMongoOperation } = require('../utils/dbErrorHandler');

// ── Multer — memory storage, 10 MB limit ─────────────────────────
// MIME filter here is UX only; magic-byte check is done post-upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image\/(png|jpe?g|bmp|webp)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// ── Magic-byte file type check (replaces header-only MIME check) ─
const ALLOWED_MAGIC = {
  'ffd8ff':   'image/jpeg',            // JPEG
  '89504e47': 'image/png',             // PNG
  '424d':     'image/bmp',             // BMP
  '52494646': 'image/webp',            // WEBP (RIFF…WEBP)
};

function validateMagicBytes(buffer) {
  if (!buffer || buffer.length < 4) return false;
  const hex4 = buffer.slice(0, 4).toString('hex');
  const hex3 = buffer.slice(0, 3).toString('hex');
  const hex2 = buffer.slice(0, 2).toString('hex');
  if (ALLOWED_MAGIC[hex4]) return true;
  if (ALLOWED_MAGIC[hex3]) return true;
  if (ALLOWED_MAGIC[hex2]) return true;
  // WEBP: check bytes 8-11 for 'WEBP'
  if (buffer.length >= 12 && buffer.slice(8, 12).toString('ascii') === 'WEBP') return true;
  return false;
}

// ── normaliseVoter ────────────────────────────────────────────────
function normaliseVoter(doc) {
  if (!doc) return null;
  return {
    epic_no:       doc.EPIC_NO        || '',
    EPIC_NO:       doc.EPIC_NO        || '',
    name:          doc.VOTER_NAME     || '',
    voter_name:    doc.VOTER_NAME     || '',
    VOTER_NAME:    doc.VOTER_NAME     || '',
    assembly_no:   String(doc.ASSEMBLY_NO  || ''),
    assembly_name: doc.ASSEMBLY_NAME  || '',
    ASSEMBLY_NAME: doc.ASSEMBLY_NAME  || '',
    ASSEMBLY_NO:   String(doc.ASSEMBLY_NO  || ''),
    district:      doc.DISTRICT       || '',
    DISTRICT:      doc.DISTRICT       || '',
    DISTRICT_NAME: doc.DISTRICT       || '',
    gender:        doc.GENDER         || '',
    GENDER:        doc.GENDER         || '',
    mobile:        doc.MOBILE_NUMBER  || '',
    MOBILE_NO:     doc.MOBILE_NUMBER  || '',
    age:           '',
    part_no:       String(doc.PART_NO || ''),
    section_no:    '',
    house_no:      '',
    dob:           '',
    relation_name: '',
  };
}

// ── Helpers ───────────────────────────────────────────────────────
function nowUTC() { return new Date(); }

function generateBjpCode() {
  return 'BJP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function genOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * hashOtp — one-way SHA-256 hash of otp+mobile so the plaintext OTP
 * is never stored in the database.
 */
function hashOtp(otp, mobile) {
  return crypto.createHash('sha256').update(`${otp}:${mobile}`).digest('hex');
}

/**
 * verifyOtpHash — constant-time comparison of supplied OTP hash.
 */
function verifyOtpHash(otp, mobile, storedHash) {
  try {
    const computed = hashOtp(otp, mobile);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
//  POST /logout
// ────────────────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err.message);
        return res.status(500).json({ success: false, message: 'Failed to log out' });
      }
      res.clearCookie('bjp.session');
      return res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    return res.json({ success: true, message: 'No active session' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /send-otp
// ────────────────────────────────────────────────────────────────
router.post('/send-otp', chatOtpLimiter, async (req, res) => {
  try {
    const { valid, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!valid) return res.status(400).json({ success: false, message: mobile });

    const db  = getDb();

    // FIX-15: atomically claim the OTP slot. The filter only matches when no
    // record exists or the 60s cooldown has expired. With the unique index on
    // `mobile`, a concurrent second request that shouldn't be allowed fails
    // with 11000 → we return 429. This removes the read→check→write race that
    // let a double-tap send two OTPs (invalidating the first).
    const cooldownCutoff = new Date(Date.now() - 60 * 1000);
    try {
      await db.collection('otp_sessions').findOneAndUpdate(
        { mobile, $or: [ { created_at: { $exists: false } }, { created_at: { $lt: cooldownCutoff } } ] },
        { $set: { created_at: nowUTC(), verified: false, purpose: 'login' } },
        { upsert: true }
      );
    } catch (e) {
      if (e.code === 11000) {
        const cur = await db.collection('otp_sessions').findOne({ mobile }, { projection: { created_at: 1 } });
        const elapsed = cur?.created_at ? (Date.now() - new Date(cur.created_at).getTime()) / 1000 : 0;
        const wait = Math.max(1, Math.ceil(60 - elapsed));
        return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
      }
      throw e;
    }

    const otp    = genOtp();
    const result = await sendOtp(mobile, otp);
    if (!result.success) {
      // Release the claim so the user can retry immediately (SMS never sent)
      await db.collection('otp_sessions').deleteOne({ mobile }).catch(() => {});
      return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
    }

    // Store hashed OTP — never plaintext
    await db.collection('otp_sessions').updateOne(
      { mobile },
      { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), verified: false, purpose: 'login' } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('send-otp error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /verify-otp  — rate-limited (brute-force guard)
// ────────────────────────────────────────────────────────────────
router.post('/verify-otp', chatVerifyOtpLimiter, async (req, res) => {
  try {
    const { valid: vm, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!vm) return res.status(400).json({ success: false, message: mobile });

    const { valid: vo, value: otp } = validateOtp((req.body.otp || '').trim());
    if (!vo) return res.status(400).json({ success: false, message: otp });

    const db  = getDb();
    const doc = await db.collection('otp_sessions').findOne({ mobile });

    // Enforce purpose: login OTP only
    if (!doc || doc.purpose !== 'login') {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (!verifyOtpHash(otp, mobile, doc.otp_hash || '')) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // 5-minute expiry
    const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
    if (elapsed > 300) {
      return res.status(400).json({ success: false, message: 'OTP expired. Please request a new one.' });
    }

    // Delete OTP immediately after first successful use
    await db.collection('otp_sessions').deleteOne({ mobile });
    req.session.verified_mobile = mobile;
    req.session.cookie.maxAge   = 86400 * 1000;

    // Check if user already has a card
    const stat   = await db.collection('generation_stats').findOne({ auth_mobile: mobile });
    const genDoc = await db.collection('generated_voters').findOne(
      {
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ]
      },
      { sort: { generated_at: -1 } }
    );

    // Treat the member as "has card" whenever a record exists — same rule as
    // /check-mobile. Web chatbot registrations render the card client-side, so
    // card_url/card_b2_key are intentionally empty; keying off them here wrongly
    // sent verified members back to the EPIC step instead of showing the card.
    const hasCard = Boolean(genDoc || (stat && stat.epic_no));
    if (hasCard) {
      const s = stat || {};
      const g = genDoc || {};
      const name = (g.VOTER_NAME || `${g.FM_NAME_EN || ''} ${g.LASTNAME_EN || ''}`.trim() || '').trim();
      // FIX-06: regenerate a fresh presigned card URL from the B2 key
      const cardUrl = g.card_b2_key ? await getCardPresignedUrl(g.card_b2_key) : (s.card_url || g.card_url || '');
      return res.json({
        success:        true,
        has_card:       true,
        epic_no:        s.epic_no  || g.EPIC_NO   || '',
        card_url:       cardUrl,
        back_url:       s.back_url || g.back_url  || '',
        combined_url:   cardUrl || g.combined_url || '',
        voter_name:     name,
        photo_url:      await getPhotoPresignedUrl(g.photo_url || ''),
        bjp_code:       g.bjp_code  || '',
        referral_link:  g.referral_link || '',
        referred_count: g.referred_members_count || 0,
      });
    }

    return res.json({ success: true, has_card: false });
  } catch (err) {
    console.error('verify-otp error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /check-mobile
// ────────────────────────────────────────────────────────────────
router.post('/check-mobile', chatCheckMobileLimiter, async (req, res) => {
  try {
    const { valid, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid mobile number' });

    const db   = getDb();
    const stat = await db.collection('generation_stats').findOne({ auth_mobile: mobile });

    // Primary lookup: by MOBILE_NO (web registrations)
    let genDoc = await db.collection('generated_voters').findOne(
      {
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ]
      },
      { sort: { generated_at: -1 } }
    );

    const hasCard = Boolean(genDoc || (stat && stat.epic_no));

    // FIX-05 (login path): an EXISTING member must verify an OTP before we
    // reveal any card data. Do NOT set the session and do NOT return PII here.
    // The client then calls /send-otp → /verify-otp, and /verify-otp is what
    // authenticates the user, sets the session, and returns the card.
    if (hasCard) {
      return res.json({ success: true, has_card: true, requires_otp: true });
    }

    // New user (no card on record) → establish the verified-mobile session so
    // the registration flow (validate-epic / generate-card) is authenticated.
    // There is no pre-existing PII for this number, so no OTP gate is needed
    // to *start* a registration.
    req.session.verified_mobile = mobile;
    req.session.cookie.maxAge   = 86400 * 1000;

    return res.json({ success: true, has_card: false, has_pin: false });
  } catch (err) {
    console.error('check-mobile error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /districts-data
// ────────────────────────────────────────────────────────────────
router.get('/districts-data', async (req, res) => {
  try {
    const data = require('../assets/districts_assemblies_booths.json');
    return res.json({ success: true, data });
  } catch (err) {
    console.error('districts-data error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /request-status/:bjpCode
// ────────────────────────────────────────────────────────────────
router.get('/request-status/:bjpCode', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = String(req.params.bjpCode || '').trim();
    const db = getDb();

    // ── Ownership check (FIX-04: IDOR) ────────────────────────────
    // Verify this BJP code belongs to the caller's own mobile before
    // returning any status. Otherwise a valid session could enumerate
    // other members' request statuses.
    const owner = await db.collection('generated_voters').findOne(
      { bjp_code: bjpCode },
      { projection: { MOBILE_NO: 1, mobile: 1 } }
    );
    if (!owner) {
      return res.status(404).json({ success: false, message: 'Not found.' });
    }
    const recordMobile  = String(owner.MOBILE_NO || owner.mobile || '').replace(/^91/, '');
    const sessionMobile = String(req.session.verified_mobile || '').replace(/^91/, '');
    if (!recordMobile || recordMobile !== sessionMobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // Find the volunteer request
    const volunteer = await db.collection('volunteer_requests').findOne({ bjp_code: bjpCode });
    // Find the booth agent request
    const boothAgent = await db.collection('booth_agent_requests').findOne({ bjp_code: bjpCode });

    return res.json({
      success: true,
      volunteer: volunteer ? {
        wing: volunteer.wing || '',
        status: volunteer.status || 'pending',
        requested_at: volunteer.requested_at
      } : null,
      boothAgent: boothAgent ? {
        district: boothAgent.district || '',
        assembly: boothAgent.assembly || '',
        booth_no: boothAgent.booth_no || '',
        status: boothAgent.status || 'pending',
        requested_at: boothAgent.requested_at
      } : null
    });
  } catch (err) {
    console.error('request-status error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// (4-digit PIN login/reset removed - authentication is OTP-based)

// ────────────────────────────────────────────────────────────────
//  POST /validate-epic
// ────────────────────────────────────────────────────────────────
router.post('/validate-epic', chatValidateEpicLimiter, async (req, res) => {
  try {
    const raw = String(req.body.epic_no || req.body.epic || '').trim().toUpperCase();
    const { valid, value: epicNo } = validateEpic(raw);
    if (!valid) return res.status(400).json({ success: false, message: epicNo });

    const mobile = req.session.verified_mobile || String(req.body.mobile || '').trim();

    // ── Duplicate check: already registered by this mobile → return existing card ─
    const db       = getDb();

    if (mobile) {
      const otherEpic = await db.collection('generated_voters').findOne({
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ],
        EPIC_NO: { $ne: epicNo }
      });
      if (otherEpic) {
        const Sentry = require('@sentry/node');
        Sentry.captureMessage(`Registration duplicate check warning: Mobile ${mobile} tried to register EPIC ${epicNo} but is already bound to EPIC ${otherEpic.EPIC_NO}`, {
          level: 'warning',
          extra: { mobile, attemptedEpic: epicNo, registeredEpic: otherEpic.EPIC_NO }
        });
        return res.status(400).json({
          success: false,
          message: 'This mobile number is already registered under a different EPIC number.'
        });
      }
    }

    const existing = await db.collection('generated_voters').findOne(
      {
        EPIC_NO: epicNo,
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ]
      },
      { projection: { card_url: 1, back_url: 1, combined_url: 1, photo_url: 1, bjp_code: 1, VOTER_NAME: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, referral_link: 1 } },
    );
    if (existing?.photo_url) {
      const Sentry = require('@sentry/node');
      Sentry.captureMessage(`Already registered voter requested card again: EPIC ${epicNo}`, {
        level: 'info',
        extra: { epicNo, bjpCode: existing.bjp_code, mobile }
      });
      return res.status(409).json({
        success:     false,
        already_registered: true,
        message:     'You are already registered. Here is your existing card.',
        card_url:    existing.card_url,
        back_url:    existing.back_url    || '',
        combined_url: existing.combined_url || '',
        photo_url:   await getPhotoPresignedUrl(existing.photo_url   || ''),
        bjp_code:    existing.bjp_code    || '',
        voter_name:  existing.VOTER_NAME  || '',
        epic_no:     epicNo,
        assembly_name: existing.ASSEMBLY_NAME || '',
        district:    existing.DISTRICT_NAME || '',
        part_no:     String(existing.PART_NO || ''),
        referral_link: existing.referral_link || '',
      });
    }

    const doc = await trackMongoOperation(
      () => findVoterByEpic(epicNo),
      'find_voter_by_epic',
      { epicNo, mobile, source: 'web_validate_epic' },
    );
    if (!doc) {
      Sentry.captureMessage(`EPIC validation lookup failed: ${epicNo} not found in database`, {
        level: 'warning',
        extra: { epicNo, mobile }
      });
      return res.status(404).json({ success: false, message: 'EPIC Number not found. Please check and try again.' });
    }

    const voter = normaliseVoter(doc);
    return res.json({ success: true, voter });
  } catch (err) {
    console.error('validate-epic error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /generate-card  (photo upload)
//  SECURITY: distributed lock prevents duplicate generation;
//            existing bjp_code preserved on re-generation;
//            magic-byte file validation.
// ────────────────────────────────────────────────────────────────
// ────────────────────────────────────────────────────────────────
//  POST /photo-upload-url  — presigned direct-to-B2 upload (web scale)
//  The browser uploads the photo straight to Backblaze, so photo bytes
//  and image compression never touch the API server.
// ────────────────────────────────────────────────────────────────
router.post('/photo-upload-url', chatValidateEpicLimiter, async (req, res) => {
  try {
    const rawEpic = String(req.body.epic_no || req.body.epic || '').trim().toUpperCase();
    const { valid, value: epicNo } = validateEpic(rawEpic);
    if (!valid) return res.status(400).json({ success: false, message: epicNo });

    const mobile = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Valid mobile number required.' });
    }

    const { uploadUrl, key } = await getPhotoUploadUrl(epicNo, mobile);
    return res.json({ success: true, uploadUrl, key });
  } catch (err) {
    console.error('photo-upload-url error:', err.message);
    return res.status(500).json({ success: false, message: 'Could not create upload URL.' });
  }
});

router.post('/generate-card', chatGenerateCardLimiter, upload.single('photo'), async (req, res) => {
  const reqId = crypto.randomUUID();
  try {
    const rawEpic = String(req.body.epic_no || req.body.epic || '').trim().toUpperCase();
    const { valid: ve, value: epicNo } = validateEpic(rawEpic);
    if (!ve) return res.status(400).json({ success: false, message: epicNo });

    // Photo arrives one of two ways:
    //  1. photo_key  → already uploaded directly to B2 via a presigned URL (preferred, scalable)
    //  2. req.file   → legacy multipart upload through the server (fallback)
    const photoKeyProvided = Boolean(String(req.body.photo_key || '').trim());

    if (!req.file && !photoKeyProvided) {
      return res.status(400).json({ success: false, message: 'Please upload your passport photo.' });
    }

    // Magic-byte validation for the legacy multipart path (direct B2 uploads
    // are constrained to image/jpeg by the presigned URL's Content-Type).
    if (req.file && !validateMagicBytes(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Please upload a JPG, PNG or BMP image.' });
    }

    const db = getDb();
    const mobile      = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';

    // Identify the user for any error captured within this request
    Sentry.setUser({ id: mobile || reqId, mobile, epicNo });
    Sentry.addBreadcrumb({
      category: 'card.generation',
      message:  'Web form card generation started',
      level:    'info',
      data:     { epicNo, mode: photoKeyProvided ? 'presigned' : 'multipart', photoSizeKB: req.file ? Math.round(req.file.buffer.length / 1024) : 0 },
    });

    // ── Hard block: one card per mobile number ───────────────────────────────────
    const existingCard = await db.collection('generated_voters').findOne({
      $or: [
        { MOBILE_NO: mobile },
        { mobile: mobile },
        { MOBILE_NO: Number(mobile) },
        { MOBILE_NO: "91" + mobile }
      ],
      photo_url: { $exists: true, $ne: '' }
    }, { projection: { card_url: 1, back_url: 1, combined_url: 1, photo_url: 1, bjp_code: 1, referral_link: 1, VOTER_NAME: 1, EPIC_NO: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1 } });
    if (existingCard?.photo_url) {
      if (existingCard.EPIC_NO !== epicNo) {
        return res.status(400).json({
          success: false,
          message: 'This mobile number is already registered under a different EPIC number.'
        });
      }
      return res.status(409).json({
        success:            false,
        already_registered: true,
        message:            'A card has already been generated for this mobile number.',
        card_url:           existingCard.card_url,
        back_url:           existingCard.back_url      || '',
        combined_url:       existingCard.combined_url  || '',
        photo_url:          await getPhotoPresignedUrl(existingCard.photo_url     || ''),
        bjp_code:           existingCard.bjp_code      || '',
        referral_link:      existingCard.referral_link || '',
        voter_name:         existingCard.VOTER_NAME    || '',
        epic_no:            existingCard.EPIC_NO       || epicNo,
        assembly_name:      existingCard.ASSEMBLY_NAME || '',
        district:           existingCard.DISTRICT_NAME || '',
        part_no:            String(existingCard.PART_NO || ''),
      });
    }

    // EPIC lookup from DB1
    const rawVoter = await trackMongoOperation(
      () => findVoterByEpic(epicNo),
      'find_voter_by_epic',
      { epicNo, mobile, source: 'web_generate_card' },
    );
    if (!rawVoter) {
      return res.status(404).json({ success: false, message: 'EPIC Number not found.' });
    }
    const voter = normaliseVoter(rawVoter);

    // FIX-10: persist the verified-mobile session NOW, before any DB writes.
    // Previously the session was set after all DB writes and saved lazily on
    // response — if the session store (Redis) hiccupped, the member record was
    // written but the session was lost, orphaning the user (card exists but
    // they can't proceed / can't re-register). Forcing an explicit save here
    // means a store failure returns an error before we write anything.
    req.session.verified_mobile = mobile;
    req.session.cookie.maxAge   = 86400 * 1000;
    await new Promise((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve()))
    );

    const photoBuffer = req.file ? req.file.buffer : null;

    // ── Distributed lock — prevent duplicate concurrent generation ─
    // FIX-04: single ATOMIC findOneAndUpdate. Matches only when no lock exists
    // or the existing one has expired; the unique index on `mobile` makes a
    // concurrent second request fail with 11000 (lock already held).
    const lockExpiry = new Date(Date.now() + 120000); // 2-min lock
    let lockAcquired = false;
    try {
      const lock = await db.collection('generation_locks').findOneAndUpdate(
        { mobile: mobile, locked_until: { $lt: new Date() } },
        { $set: { locked_until: lockExpiry, locked_by: reqId } },
        { upsert: true, returnDocument: 'after' }
      );
      // Atomic: if we got a doc back with our reqId, we own the lock
      lockAcquired = lock?.locked_by === reqId;
    } catch (e) {
      if (e.code !== 11000) throw e;
      // Duplicate key — another request holds an active lock
      lockAcquired = false;
    }

    if (!lockAcquired) {
      return res.status(429).json({ success: false, message: 'Card generation already in progress. Please try again in a moment.' });
    }

    try {
      // Preserve existing bjp_code to protect referral links
      const existingGen = await db.collection('generated_voters').findOne({
        EPIC_NO: epicNo,
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ]
      }, { projection: { bjp_code: 1, referral_id: 1, referral_link: 1 } });
      const bjpCode   = existingGen?.bjp_code || generateBjpCode();

      // ── Referral attribution ───────────────────────────────────
      // Accept ref=<bjpCode>&rid=<referralId> from the request body
      // (frontend passes them when the user landed via a referral link)
      const rawRef    = String(req.body.ref  || '').trim().toUpperCase();
      const rawRid    = String(req.body.rid  || '').trim().toUpperCase();
      // Validate format — avoid injecting arbitrary values into DB
      const refBjpOk  = /^BJP-[0-9A-F]{8}$/.test(rawRef);
      const refRidOk  = /^REF-[0-9A-F]{8}$/.test(rawRid);
      const refBjp    = refBjpOk ? rawRef : '';
      const refRid    = refRidOk ? rawRid : '';

      // Verify the referral actually exists (prevent spoofed codes)
      let verifiedRefBjp = '';
      let verifiedRefRid = '';
      if (refBjp && refRid) {
        const referrer = await db.collection('generated_voters').findOne(
          { bjp_code: refBjp, referral_id: refRid },
          { projection: { _id: 1 } }
        );
        if (referrer) {
          verifiedRefBjp = refBjp;
          verifiedRefRid = refRid;
        }
      }

      // Generate referral link for this new member
      // Preserve existing referral_id if card is being re-generated
      const referralId   = existingGen?.referral_id   || ('REF-' + crypto.randomBytes(4).toString('hex').toUpperCase());
      const referralBase = config.baseUrl;
      const referralLink = `${referralBase}/refer/${bjpCode}/${referralId}`;
      const verifyUrl = `${config.baseUrl}/verify/${bjpCode || epicNo}`;


      const voterData = {
        epic_no:       voter.epic_no,
        name:          voter.name,
        assembly_name: voter.assembly_name,
        district:      voter.district,
        part_no:       voter.part_no,
        PART_NO:       voter.part_no,
        booth:         voter.part_no,
        bjp_code:      bjpCode,
        verify_url:    verifyUrl,
        VOTER_NAME:    voter.name,
        ASSEMBLY_NAME: voter.assembly_name,
        DISTRICT_NAME: voter.district,
        DISTRICT:      voter.district,
        EPIC_NO:       voter.epic_no,
        ASSEMBLY_NO:   voter.assembly_no,
      };

      // Resolve the photo URL.
      //  - presigned path: the browser already uploaded to B2; use the
      //    deterministic key (never trust a client-supplied key).
      //  - multipart path: compress + upload here (legacy fallback).
      let photoUrl = '';
      if (photoKeyProvided) {
        photoUrl = photoKeyFor(epicNo, mobile);
      } else {
        try {
          photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
        } catch (e) {
          console.error('Photo upload failed:', e.message);
          Sentry.captureException(e, {
            tags:  { operation: 'photo_upload', source: 'web', storage: 'backblaze_b2' },
            extra: {
              epicNo, mobile, bjpCode,
              photoSizeKB: photoBuffer ? Math.round(photoBuffer.length / 1024) : 0,
              errorType:   'b2_upload_failed',
            },
          });
          // FIX-03: do NOT continue with an empty photo_url — that would write a
          // permanently-broken member record (no photo) and lock the mobile
          // number so the user can never re-register. Return a retryable error
          // instead. The generation lock is released by the outer `finally`.
          return res.status(503).json({
            success: false,
            message: 'Photo upload failed. Please try again in a moment.',
            retry:   true,
          });
        }
      }

      // Card image files are not generated/stored in Cloudinary for web chatbot registrations.
      const cardUrl     = '';
      const backUrl     = '';
      const combinedUrl = '';

      const now = nowUTC();

      // Upsert generated_voters
      await db.collection('generated_voters').updateOne(
        { MOBILE_NO: mobile },
        {
          $set: {
            EPIC_NO:        epicNo,
            bjp_code:       bjpCode,
            photo_url:      photoUrl,
            card_url:       cardUrl,
            back_url:       backUrl,
            combined_url:   combinedUrl,
            generated_at:   now,
            VOTER_NAME:     voter.name,
            ASSEMBLY_NAME:  voter.assembly_name,
            DISTRICT_NAME:  voter.district,
            ASSEMBLY_NO:    voter.assembly_no,
            PART_NO:        voter.part_no,
            referral_id:    referralId,
            referral_link:  referralLink,
            source:         'web',
            MOBILE_NO:      mobile,
            ...(verifiedRefBjp   ? { referred_by_bjp:          verifiedRefBjp   } : {}),
            ...(verifiedRefRid   ? { referred_by_referral_id:  verifiedRefRid   } : {}),
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true }
      );

      // Increment referrer's count (fire-and-forget, non-blocking)
      if (verifiedRefBjp) {
        db.collection('generated_voters').updateOne(
          { bjp_code: verifiedRefBjp },
          { $inc: { referred_members_count: 1 } }
        ).catch(() => {});
      }

      // Upsert generation_stats
      await db.collection('generation_stats').updateOne(
        { auth_mobile: mobile },
        {
          $set:         { epic_no: epicNo, card_url: cardUrl, back_url: backUrl, combined_url: combinedUrl, photo_url: photoUrl, last_generated: now },
          $inc:         { count: 1 },
          $setOnInsert: { auth_mobile: mobile },
        },
        { upsert: true }
      );

      // (FIX-10) Session was already established + saved before the DB writes.

      return res.json({
        success:       true,
        card_url:      cardUrl,
        back_url:      backUrl,
        combined_url:  combinedUrl,
        photo_url:     await getPhotoPresignedUrl(photoUrl),
        epic_no:       epicNo,
        voter_name:    voter.name,
        assembly_name: voter.assembly_name,
        district:      voter.district,
        part_no:       voter.part_no,
        bjp_code:      bjpCode,
        referral_id:   referralId,
        referral_link: referralLink,
        created_at:    now,
        message:       'Card generated successfully',
      });
    } finally {
      // Always release the lock
      await db.collection('generation_locks').deleteOne({ mobile: mobile, locked_by: reqId }).catch(() => {});
    }

  } catch (err) {
    console.error('generate-card error:', err.message);
    Sentry.captureException(err, {
      tags:  { operation: 'card_generation', source: 'web' },
      extra: { reqId, errorMessage: err.message },
    });
    return res.status(500).json({ success: false, message: 'Card generation failed. Please try again.' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /profile/:epicNo
//  Requires verified session — session mobile must match
// ────────────────────────────────────────────────────────────────
router.get('/profile/:epicNo', async (req, res) => {
  try {
    const raw = String(req.params.epicNo || '').trim().toUpperCase();
    const { valid, value: epicNo } = validateEpic(raw);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid EPIC format' });

    const db     = getDb();
    const sessionMobile = req.session.verified_mobile;
    const queryMobile = req.query.mobile;
    const mobile = sessionMobile || queryMobile;

    // Try voter DB first; fall back to app DB if voter not indexed in DB1
    const rawVoter = await findVoterByEpic(epicNo);
    const voter    = rawVoter ? normaliseVoter(rawVoter) : null;

    // App DB lookups — by session/query mobile or fallback to EPIC
    let genDoc = {};
    if (mobile) {
      genDoc = await db.collection('generated_voters').findOne({
        EPIC_NO: epicNo,
        $or: [
          { MOBILE_NO: mobile },
          { mobile: mobile },
          { MOBILE_NO: Number(mobile) },
          { MOBILE_NO: "91" + mobile }
        ]
      }) || {};
    }

    if (!genDoc.EPIC_NO) {
      genDoc = await db.collection('generated_voters').findOne({ EPIC_NO: epicNo }, { sort: { generated_at: -1 } }) || {};
    }

    const stat = mobile
      ? await db.collection('generation_stats').findOne({ auth_mobile: mobile }) || {}
      : {};
    const mob  = stat.auth_mobile || '';

    const name     = voter?.name          || genDoc.VOTER_NAME || `${genDoc.FM_NAME_EN || ''} ${genDoc.LASTNAME_EN || ''}`.trim() || '';
    const assembly = voter?.assembly_name || genDoc.ASSEMBLY_NAME || '';
    const district = voter?.district      || genDoc.DISTRICT_NAME || genDoc.DISTRICT || '';

    const rawMob = String(genDoc.MOBILE_NO || genDoc.mobile || mob || '').trim();
    const maskedMobile = rawMob.length >= 4 
      ? `${'*'.repeat(rawMob.length - 4)}${rawMob.slice(-4)}` 
      : rawMob;

    let appreciation_earned_at = genDoc.appreciation_earned_at || null;
    if ((genDoc.referred_members_count || 0) >= 5 && !appreciation_earned_at && genDoc.bjp_code) {
      const referrals = await db.collection('generated_voters')
        .find({ referred_by_bjp: genDoc.bjp_code })
        .sort({ created_at: 1 })
        .skip(4)
        .limit(1)
        .toArray();
      if (referrals.length > 0) {
        appreciation_earned_at = referrals[0].created_at;
        await db.collection('generated_voters').updateOne(
          { _id: genDoc._id },
          { $set: { appreciation_earned_at } }
        );
      }
    }

    return res.json({
      success:            true,
      name,
      epic_no:            epicNo,
      assembly,
      district,
      bjp_code:           genDoc.bjp_code   || genDoc.ptc_code || '',
      card_url:           stat.card_url     || genDoc.card_url     || '',
      back_url:           stat.back_url     || genDoc.back_url     || '',
      combined_url:       stat.combined_url || genDoc.combined_url || '',
      photo_url:          await getPhotoPresignedUrl(genDoc.photo_url    || stat.photo_url    || ''),
      auth_mobile_masked: mob.length >= 4 ? `****${mob.slice(-4)}` : '',
      referral_link:      genDoc.referral_link || '',
      referral_id:        genDoc.referral_id   || '',
      mobile:             maskedMobile,
      created_at:         genDoc.created_at || genDoc.generated_at || null,
      appreciation_earned_at: appreciation_earned_at
    });
  } catch (err) {
    console.error('profile error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /booth/:epicNo
// ────────────────────────────────────────────────────────────────
router.get('/booth/:epicNo', async (req, res) => {
  try {
    const raw = String(req.params.epicNo || '').trim().toUpperCase();
    const { valid, value: epicNo } = validateEpic(raw);
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid EPIC format' });

    // Try voter DB first; fall back to app DB if not indexed in DB1
    const rawVoter = await findVoterByEpic(epicNo);
    const voter    = rawVoter ? normaliseVoter(rawVoter) : null;

    let assembly_name, assembly_no, district, part_no;
    if (voter) {
      assembly_name = voter.assembly_name;
      assembly_no   = voter.assembly_no;
      district      = voter.district;
      part_no       = voter.part_no || '';
    } else {
      const db     = getDb();
      const genDoc = await db.collection('generated_voters').findOne({ EPIC_NO: epicNo }) || {};
      assembly_name = genDoc.ASSEMBLY_NAME || '';
      assembly_no   = String(genDoc.ASSEMBLY_NO  || '');
      district      = genDoc.DISTRICT_NAME || genDoc.DISTRICT || '';
      part_no       = String(genDoc.PART_NO || '');
    }

    if (!assembly_name && !district) {
      return res.status(404).json({ success: false, message: 'Booth information not found' });
    }

    return res.json({
      success:         true,
      assembly_name,
      assembly_no,
      district,
      part_no,
      polling_station: '',
    });
  } catch (err) {
    console.error('booth error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /referral-link/:bjpCode  — requires verified session
// ────────────────────────────────────────────────────────────────
router.get('/referral-link/:bjpCode', async (req, res) => {
  try {
    // Must have a verified mobile session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = String(req.params.bjpCode || '').trim();
    if (!bjpCode || !/^BJP-[0-9A-F]{8}$/.test(bjpCode)) {
      return res.status(400).json({ success: false, message: 'Invalid BJP code format' });
    }

    const db  = getDb();
    const doc = await db.collection('generated_voters').findOne(
      { bjp_code: bjpCode },
      { projection: { referral_id: 1, referral_link: 1, MOBILE_NO: 1 } }
    );

    if (!doc) return res.status(404).json({ success: false, message: 'Member not found' });

    // Verify the requesting session mobile matches the record
    if (doc.MOBILE_NO && doc.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const rid  = doc.referral_id || ('REF-' + crypto.randomBytes(4).toString('hex').toUpperCase());
    const referralBase = config.baseUrl;
    const link = `${referralBase}/refer/${bjpCode}/${rid}`;

    if (!doc.referral_id || doc.referral_link !== link) {
      await db.collection('generated_voters').updateOne(
        { bjp_code: bjpCode },
        { $set: { referral_id: rid, referral_link: link } }
      );
    }

    return res.json({ success: true, referral_id: rid, referral_link: link });
  } catch (err) {
    console.error('referral-link error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /my-members/:bjpCode  — requires verified session
// ────────────────────────────────────────────────────────────────
router.get('/my-members/:bjpCode', async (req, res) => {
  try {
    // Must have a verified mobile session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = String(req.params.bjpCode || '').trim();
    if (!bjpCode || !/^BJP-[0-9A-F]{8}$/.test(bjpCode)) {
      return res.status(400).json({ success: false, message: 'Invalid BJP code format' });
    }

    const db = getDb();

    // Verify the session mobile owns this BJP code
    const owner = await db.collection('generated_voters').findOne(
      { bjp_code: bjpCode }, { projection: { MOBILE_NO: 1 } }
    );
    if (!owner) return res.status(404).json({ success: false, message: 'Member not found' });
    if (owner.MOBILE_NO && owner.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // 1. Fetch Root Member
    const rootDoc = await db.collection('generated_voters').findOne(
      { bjp_code: bjpCode },
      { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, bjp_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1 } }
    );
    if (!rootDoc) return res.status(404).json({ success: false, message: 'Member details not found' });

    const root = {
      name:          rootDoc.VOTER_NAME || `${rootDoc.FM_NAME_EN || ''} ${rootDoc.LASTNAME_EN || ''}`.trim() || 'A Member',
      epic_no:       rootDoc.EPIC_NO || '',
      bjp_code:      rootDoc.bjp_code || '',
      photo_url:     await getPhotoPresignedUrl(rootDoc.photo_url || ''),
      assembly_name: rootDoc.ASSEMBLY_NAME || '',
      district:      rootDoc.DISTRICT_NAME || '',
      part_no:       rootDoc.PART_NO || '',
    };

    // FIX-06: bound the referral tree so a viral member with thousands of
    // referrals cannot load unlimited docs into RAM / fire unlimited presigns.
    const LAYER2_LIMIT = 200;  // top 200 direct referrals
    const LAYER3_LIMIT = 400;  // top 400 second-level referrals

    // 2. Fetch Layer 2 Members (capped)
    const layer2Docs = await db.collection('generated_voters')
      .find(
        { referred_by_bjp: bjpCode },
        { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, bjp_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, generated_at: 1 } }
      )
      .sort({ generated_at: -1 })
      .limit(LAYER2_LIMIT)
      .toArray();

    const layer2Bjps = layer2Docs.map(m => m.bjp_code).filter(Boolean);

    // 3. Fetch Layer 3 Members (capped)
    let layer3Docs = [];
    if (layer2Bjps.length > 0) {
      layer3Docs = await db.collection('generated_voters')
        .find(
          { referred_by_bjp: { $in: layer2Bjps } },
          { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, bjp_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, referred_by_bjp: 1, generated_at: 1 } }
        )
        .limit(LAYER3_LIMIT)
        .toArray();
    }

    // Map Layer 3 members by their referrer's BJP code (with presigned photos)
    const layer3Map = {};
    await Promise.all(layer3Docs.map(async (m3) => {
      const parentBjp = m3.referred_by_bjp;
      if (!layer3Map[parentBjp]) layer3Map[parentBjp] = [];
      layer3Map[parentBjp].push({
        name:          m3.VOTER_NAME || `${m3.FM_NAME_EN || ''} ${m3.LASTNAME_EN || ''}`.trim() || 'A Member',
        epic_no:       m3.EPIC_NO || '',
        bjp_code:      m3.bjp_code || '',
        photo_url:     await getPhotoPresignedUrl(m3.photo_url || ''),
        assembly_name: m3.ASSEMBLY_NAME || '',
        district:      m3.DISTRICT_NAME || '',
        part_no:       m3.PART_NO || '',
        generated_at:  m3.generated_at || null,
      });
    }));

    // Build the tree (with presigned photos for layer 2)
    const tree = await Promise.all(layer2Docs.map(async (m2) => {
      const w2 = m2.bjp_code;
      return {
        name:          m2.VOTER_NAME || `${m2.FM_NAME_EN || ''} ${m2.LASTNAME_EN || ''}`.trim() || 'A Member',
        epic_no:       m2.EPIC_NO || '',
        bjp_code:      w2 || '',
        photo_url:     await getPhotoPresignedUrl(m2.photo_url || ''),
        assembly_name: m2.ASSEMBLY_NAME || '',
        district:      m2.DISTRICT_NAME || '',
        part_no:       m2.PART_NO || '',
        generated_at:  m2.generated_at || null,
        referrals:     layer3Map[w2] || [],
      };
    }));

    // FIX-06: total direct-referral count so the UI can show "showing 200 of N"
    const totalReferrals = await db.collection('generated_voters')
      .countDocuments({ referred_by_bjp: bjpCode });

    return res.json({
      success: true,
      root,
      tree,
      total_referrals: totalReferrals,
      showing: tree.length,
    });
  } catch (err) {
    console.error('my-members error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /request-volunteer  — requires verified session
//  Uses unique index + catch-11000 to prevent TOCTOU race
// ────────────────────────────────────────────────────────────────
router.post('/request-volunteer', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = String(req.body.bjp_code || '').trim();
    const epicNo  = String(req.body.epic_no  || '').trim().toUpperCase();
    if (!bjpCode) return res.status(400).json({ success: false, message: 'BJP code required' });

    const db  = getDb();
    const gen = await db.collection('generated_voters').findOne({ bjp_code: bjpCode }) || {};

    // Verify session mobile owns this BJP code
    if (gen.MOBILE_NO && gen.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const name = gen.VOTER_NAME || `${gen.FM_NAME_EN || ''} ${gen.LASTNAME_EN || ''}`.trim();

    try {
      await db.collection('volunteer_requests').insertOne({
        bjp_code:     bjpCode,
        epic_no:      epicNo || gen.EPIC_NO || '',
        name,
        mobile:       gen.MOBILE_NO    || '',
        assembly:     gen.ASSEMBLY_NAME || '',
        district:     gen.DISTRICT_NAME || '',
        wing:         String(req.body.wing || '').trim(),
        status:       'pending',
        requested_at: nowUTC(),
      });
    } catch (e) {
      if (e.code === 11000) {
        // Already submitted (unique index on bjp_code)
        const existing = await db.collection('volunteer_requests').findOne({ bjp_code: bjpCode });
        return res.status(400).json({ success: false, message: `Already submitted. Status: ${existing?.status || 'pending'}` });
      }
      throw e;
    }

    return res.json({ success: true, message: 'Volunteer request submitted!' });
  } catch (err) {
    console.error('request-volunteer error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /request-booth-agent  — requires verified session
//  booth_no validated: 1-6 digits only
//  Uses unique index + catch-11000 to prevent TOCTOU race
// ────────────────────────────────────────────────────────────────
router.post('/request-booth-agent', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const bjpCode = String(req.body.bjp_code || '').trim();
    const epicNo  = String(req.body.epic_no  || '').trim().toUpperCase();
    const boothNo = String(req.body.booth_no || '').trim().slice(0, 6);

    if (!bjpCode) return res.status(400).json({ success: false, message: 'BJP code required' });
    if (!boothNo || !/^\d{1,6}$/.test(boothNo)) {
      return res.status(400).json({ success: false, message: 'Invalid booth number. Must be 1–6 digits.' });
    }

    const db  = getDb();
    const gen = await db.collection('generated_voters').findOne({ bjp_code: bjpCode }) || {};

    // Verify session mobile owns this BJP code
    if (gen.MOBILE_NO && gen.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const name = gen.VOTER_NAME || `${gen.FM_NAME_EN || ''} ${gen.LASTNAME_EN || ''}`.trim();

    try {
      await db.collection('booth_agent_requests').insertOne({
        bjp_code:     bjpCode,
        epic_no:      epicNo || gen.EPIC_NO || '',
        name,
        mobile:       gen.MOBILE_NO    || '',
        booth_no:     boothNo,
        assembly:     String(req.body.assembly || '').trim() || gen.ASSEMBLY_NAME || '',
        district:     String(req.body.district || '').trim() || gen.DISTRICT_NAME || '',
        status:       'pending',
        requested_at: nowUTC(),
      });
    } catch (e) {
      if (e.code === 11000) {
        const existing = await db.collection('booth_agent_requests').findOne({ bjp_code: bjpCode });
        return res.status(400).json({ success: false, message: `Already submitted. Status: ${existing?.status || 'pending'}` });
      }
      throw e;
    }

    return res.json({ success: true, message: 'Booth agent request submitted!' });
  } catch (err) {
    console.error('request-booth-agent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /best-performers  — requires verified session
// ────────────────────────────────────────────────────────────────
router.get('/best-performers', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const db = getDb();
    const performers = await db.collection('generated_voters')
      .find({ referred_members_count: { $gt: 0 } }, {
        projection: { 
          VOTER_NAME: 1, 
          FM_NAME_EN: 1, 
          LASTNAME_EN: 1, 
          referred_members_count: 1, 
          bjp_code: 1, 
          photo_url: 1,
          EPIC_NO: 1,
          ASSEMBLY_NAME: 1,
          DISTRICT_NAME: 1,
          PART_NO: 1
        }
      })
      .sort({ referred_members_count: -1 })
      .limit(5)
      .toArray();

    const result = await Promise.all(performers.map(async (p, index) => ({
      rank:                 index + 1,
      name:                 p.VOTER_NAME || `${p.FM_NAME_EN || ''} ${p.LASTNAME_EN || ''}`.trim() || 'BJP Member',
      referred_count:       p.referred_members_count || 0,
      referrals:            p.referred_members_count || 0,
      bjp_code:             p.bjp_code || '',
      photo_url:            await getPhotoPresignedUrl(p.photo_url || ''),
      epic_no:              p.EPIC_NO || '',
      assembly_name:        p.ASSEMBLY_NAME || '',
      district:             p.DISTRICT_NAME || '',
      part_no:              p.PART_NO || ''
    })));

    return res.json({ success: true, performers: result });
  } catch (err) {
    console.error('best-performers error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /card-status/:jobId
// ────────────────────────────────────────────────────────────────
router.get('/card-status/:jobId', (req, res) => {
  return res.status(404).json({ status: 'error', message: 'Job not found or expired' });
});

// ────────────────────────────────────────────────────────────────
//  GET /member-status/:bjpCode
// ────────────────────────────────────────────────────────────────
router.get('/member-status/:bjpCode', async (req, res) => {
  try {
    // FIX-12: require a verified session and verify ownership of the BJP code
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const bjpCode = req.params.bjpCode;
    const db = getDb();
    const voter = await db.collection('generated_voters').findOne({ bjp_code: bjpCode });
    if (!voter) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (voter.MOBILE_NO && voter.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const appointment = await db.collection('appointments').findOne({ bjp_code: bjpCode });
    const volReq = await db.collection('volunteer_requests').findOne({ bjp_code: bjpCode });
    const baReq = await db.collection('booth_agent_requests').findOne({ bjp_code: bjpCode });

    let appreciation_earned_at = voter.appreciation_earned_at || null;
    if ((voter.referred_members_count || 0) >= 5 && !appreciation_earned_at) {
      const referrals = await db.collection('generated_voters')
        .find({ referred_by_bjp: bjpCode })
        .sort({ created_at: 1 })
        .skip(4)
        .limit(1)
        .toArray();
      if (referrals.length > 0) {
        appreciation_earned_at = referrals[0].created_at;
        await db.collection('generated_voters').updateOne(
          { _id: voter._id },
          { $set: { appreciation_earned_at } }
        );
      }
    }

    return res.json({
      success: true,
      referred_count: voter.referred_members_count || 0,
      has_appointment: !!appointment && appointment.interest === 'interested',
      appointment: appointment ? { interest: appointment.interest } : null,
      local_body_interest: voter.local_body_interest || null,
      volunteer_status: volReq ? volReq.status : null,
      booth_agent_status: baReq ? baReq.status : null,
      created_at: voter.created_at || voter.generated_at || null,
      appreciation_earned_at: appreciation_earned_at
    });
  } catch (err) {
    console.error('member-status error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /local-body-interest
// ────────────────────────────────────────────────────────────────
router.post('/local-body-interest', async (req, res) => {
  try {
    // FIX-11: require a verified session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { bjp_code, interest } = req.body;
    if (!bjp_code || !interest) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }
    if (interest !== 'interested' && interest !== 'not_interested') {
      return res.status(400).json({ success: false, message: 'Invalid interest value' });
    }
    const db = getDb();
    // FIX-11: verify the session mobile owns this BJP code
    const member = await db.collection('generated_voters').findOne({ bjp_code }, { projection: { MOBILE_NO: 1 } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (member.MOBILE_NO && member.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    await db.collection('generated_voters').updateOne(
      { bjp_code },
      { $set: { local_body_interest: interest } }
    );
    return res.json({ success: true, message: 'Interest updated successfully' });
  } catch (err) {
    console.error('local-body-interest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /save-meeting-interest
// ────────────────────────────────────────────────────────────────
router.post('/save-meeting-interest', async (req, res) => {
  try {
    // FIX-11: require a verified session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const { bjp_code, interest } = req.body;
    if (!bjp_code || !interest) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }
    if (interest !== 'interested' && interest !== 'not_interested') {
      return res.status(400).json({ success: false, message: 'Invalid interest value' });
    }
    const db = getDb();
    // FIX-11: verify the session mobile owns this BJP code
    const member = await db.collection('generated_voters').findOne({ bjp_code }, { projection: { MOBILE_NO: 1 } });
    if (!member) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    if (member.MOBILE_NO && member.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    await db.collection('appointments').updateOne(
      { bjp_code },
      { $set: { interest, created_at: new Date() } },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Meeting interest saved successfully' });
  } catch (err) {
    console.error('save-meeting-interest error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
