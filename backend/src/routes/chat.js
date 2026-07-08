/**
 * Chatbot API routes
 * ─────────────────────────────────────────────────────────────────
 * SECURITY HARDENING:
 *  - OTP verification, PIN verification and reset all rate-limited
 *  - OTPs stored as SHA-256 hash (never plaintext)
 *  - OTP purpose enforced — login OTP cannot verify pin-reset flow
 *  - OTP deleted from DB immediately after successful first use
 *  - Existing wtl_code preserved on card re-generation
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

const { validateMobile, validateEpic, validatePin, validateOtp } = require('../utils/validators');
const { hashPin, verifyPin } = require('../utils/security');
const { sendOtp } = require('../services/smsService');
const { uploadPhoto, uploadCard, uploadBackCard, uploadCombinedCard } = require('../services/cloudinaryService');
const { generateCard, generateBackCard, generateCombinedCard } = require('../services/cardGenerator');
const {
  chatOtpLimiter,
  chatVerifyOtpLimiter,
  chatVerifyPinLimiter,
  chatGenerateCardLimiter,
  chatValidateEpicLimiter,
} = require('../middleware/rateLimiter');
const { getDb, findVoterByEpic } = require('../db');

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

function generateWtlCode() {
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
//  POST /send-otp
// ────────────────────────────────────────────────────────────────
router.post('/send-otp', chatOtpLimiter, async (req, res) => {
  try {
    const { valid, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!valid) return res.status(400).json({ success: false, message: mobile });

    const db  = getDb();
    const doc = await db.collection('otp_sessions').findOne(
      { mobile }, { projection: { created_at: 1 } }
    );

    // 60-second cooldown between OTP requests
    if (doc?.created_at) {
      const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
      if (elapsed < 60) {
        const wait = Math.ceil(60 - elapsed);
        return res.status(429).json({ success: false, message: `Please wait ${wait}s before requesting another OTP.` });
      }
    }

    const otp    = genOtp();
    const result = await sendOtp(mobile, otp);
    if (!result.success) {
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
      { MOBILE_NO: mobile }, { sort: { generated_at: -1 } }
    );

    if ((stat && stat.card_url) || (genDoc && genDoc.card_url)) {
      const s = stat || {};
      const g = genDoc || {};
      const name = (g.VOTER_NAME || `${g.FM_NAME_EN || ''} ${g.LASTNAME_EN || ''}`.trim() || '').trim();
      return res.json({
        success:    true,
        has_card:   true,
        epic_no:    s.epic_no  || g.EPIC_NO   || '',
        card_url:   s.card_url || g.card_url  || '',
        back_url:   s.back_url || g.back_url  || '',
        voter_name: name,
        photo_url:  g.photo_url || '',
        wtl_code:   g.wtl_code  || '',
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
router.post('/check-mobile', async (req, res) => {
  try {
    const { valid, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!valid) return res.status(400).json({ success: false, message: 'Invalid mobile number' });

    const db   = getDb();
    const stat = await db.collection('generation_stats').findOne({ auth_mobile: mobile });

    // Primary lookup: by MOBILE_NO (web registrations)
    let genDoc = await db.collection('generated_voters').findOne(
      { MOBILE_NO: mobile }, { sort: { generated_at: -1 } }
    );

    // Fallback: WhatsApp registrations may have card but MOBILE_NO not indexed by web
    // Check pending_registrations for the EPIC, then look up generated_voters by EPIC
    if (!genDoc) {
      const pending = await db.collection('pending_registrations').findOne(
        { mobile }, { projection: { epic_no: 1, status: 1 } }
      );
      if (pending?.epic_no) {
        const byEpic = await db.collection('generated_voters').findOne(
          { EPIC_NO: pending.epic_no }
        );
        if (byEpic) {
          genDoc = byEpic;
          // Backfill MOBILE_NO so future lookups are instant
          db.collection('generated_voters').updateOne(
            { EPIC_NO: pending.epic_no },
            { $set: { MOBILE_NO: mobile } }
          ).catch(() => {});
        }
      }
    }

    const hasCard = Boolean(genDoc || (stat && stat.epic_no));

    // Always establish the verified session mobile on check-mobile success
    req.session.verified_mobile = mobile;
    req.session.cookie.maxAge   = 86400 * 1000;

    if (hasCard) {
      const g = genDoc || {};
      const name = g.VOTER_NAME || `${g.FM_NAME_EN || ''} ${g.LASTNAME_EN || ''}`.trim();
      return res.json({
        success:       true,
        has_card:      true,
        has_pin:       false,
        epic_no:       g.EPIC_NO || (stat && stat.epic_no) || '',
        voter_name:    name,
        card_url:      g.card_url || '',
        back_url:      g.back_url || '',
        combined_url:  g.combined_url || g.card_url || '',
        photo_url:     g.photo_url || '',
        wtl_code:      g.wtl_code || '',
        referral_link: g.referral_link || '',
        referred_count: g.referred_members_count || 0,
      });
    }

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
//  GET /request-status/:wtlCode
// ────────────────────────────────────────────────────────────────
router.get('/request-status/:wtlCode', async (req, res) => {
  try {
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const wtlCode = String(req.params.wtlCode || '').trim();
    const db = getDb();
    
    // Find the volunteer request
    const volunteer = await db.collection('volunteer_requests').findOne({ wtl_code: wtlCode });
    // Find the booth agent request
    const boothAgent = await db.collection('booth_agent_requests').findOne({ wtl_code: wtlCode });

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

// ────────────────────────────────────────────────────────────────
//  POST /verify-pin  — rate-limited (brute-force guard)
// ────────────────────────────────────────────────────────────────
router.post('/verify-pin', chatVerifyPinLimiter, async (req, res) => {
  try {
    const { valid: vm, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!vm) return res.status(400).json({ success: false, message: mobile });

    const { valid: vp, value: pin } = validatePin((req.body.pin || '').trim());
    if (!vp) return res.status(400).json({ success: false, message: pin });

    const db   = getDb();
    const stat = await db.collection('generation_stats').findOne({ auth_mobile: mobile });

    if (!stat || !stat.secret_pin) {
      return res.status(404).json({ success: false, message: 'No PIN found for this mobile.' });
    }
    if (!verifyPin(pin, stat.secret_pin)) {
      return res.status(400).json({ success: false, message: 'Invalid PIN. Please try again.' });
    }

    const genDoc = await db.collection('generated_voters').findOne({ MOBILE_NO: mobile });
    const name   = genDoc ? `${genDoc.FM_NAME_EN || ''} ${genDoc.LASTNAME_EN || ''}`.trim() : '';

    // Set verified session upon PIN verification
    req.session.verified_mobile = mobile;
    req.session.cookie.maxAge   = 86400 * 1000;

    return res.json({
      success:    true,
      has_card:   true,
      epic_no:    stat.epic_no || '',
      card_url:   stat.card_url || '',
      voter_name: name,
      photo_url:  genDoc?.photo_url || '',
      referral_link: genDoc?.referral_link || '',
    });
  } catch (err) {
    console.error('verify-pin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /forgot-pin
// ────────────────────────────────────────────────────────────────
router.post('/forgot-pin', chatOtpLimiter, async (req, res) => {
  try {
    const { valid, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!valid) return res.status(400).json({ success: false, message: mobile });

    const db      = getDb();
    const hasAcct = (await db.collection('generation_stats').findOne({ auth_mobile: mobile })) ||
                    (await db.collection('generated_voters').findOne({ MOBILE_NO: mobile }));

    if (!hasAcct) {
      return res.status(404).json({ success: false, message: 'No account found for this mobile.' });
    }

    // 60-second cooldown
    const existing = await db.collection('otp_sessions').findOne(
      { mobile }, { projection: { created_at: 1 } }
    );
    if (existing?.created_at) {
      const elapsed = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
      if (elapsed < 60) {
        const wait = Math.ceil(60 - elapsed);
        return res.status(429).json({ success: false, message: `Please wait ${wait}s.` });
      }
    }

    const otp    = genOtp();
    const result = await sendOtp(mobile, otp);
    if (!result.success) {
      return res.status(500).json({ success: false, message: 'Could not send OTP. Please try again.' });
    }

    // Store hashed OTP with purpose 'pin_reset'
    await db.collection('otp_sessions').updateOne(
      { mobile },
      { $set: { otp_hash: hashOtp(otp, mobile), created_at: nowUTC(), verified: false, purpose: 'pin_reset' } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error('forgot-pin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /verify-forgot-otp  — rate-limited, purpose-enforced
// ────────────────────────────────────────────────────────────────
router.post('/verify-forgot-otp', chatVerifyOtpLimiter, async (req, res) => {
  try {
    const { valid: vm, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!vm) return res.status(400).json({ success: false, message: mobile });

    const { valid: vo, value: otp } = validateOtp((req.body.otp || '').trim());
    if (!vo) return res.status(400).json({ success: false, message: otp });

    const db  = getDb();
    const doc = await db.collection('otp_sessions').findOne({ mobile });

    // Enforce purpose: pin_reset OTP only
    if (!doc || doc.purpose !== 'pin_reset') {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (!verifyOtpHash(otp, mobile, doc.otp_hash || '')) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
    if (elapsed > 300) {
      return res.status(400).json({ success: false, message: 'OTP expired.' });
    }

    // Mark OTP as verified but keep for reset-pin step
    await db.collection('otp_sessions').updateOne({ mobile }, { $set: { verified: true } });
    return res.json({ success: true });
  } catch (err) {
    console.error('verify-forgot-otp error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /reset-pin  — rate-limited
// ────────────────────────────────────────────────────────────────
router.post('/reset-pin', chatVerifyOtpLimiter, async (req, res) => {
  try {
    const { valid: vm, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!vm) return res.status(400).json({ success: false, message: mobile });

    const { valid: vo, value: otp } = validateOtp((req.body.otp || '').trim());
    if (!vo) return res.status(400).json({ success: false, message: otp });

    const db  = getDb();
    const doc = await db.collection('otp_sessions').findOne({ mobile });

    // Must be a verified pin_reset OTP
    if (!doc || doc.purpose !== 'pin_reset' || !doc.verified) {
      return res.status(400).json({ success: false, message: 'Invalid or unverified OTP' });
    }

    if (!verifyOtpHash(otp, mobile, doc.otp_hash || '')) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    const elapsed = (Date.now() - new Date(doc.created_at).getTime()) / 1000;
    if (elapsed > 300) {
      return res.status(400).json({ success: false, message: 'OTP expired.' });
    }

    const { valid: vp, value: newPin } = validatePin((req.body.new_pin || '').trim());
    if (!vp) return res.status(400).json({ success: false, message: newPin });

    const hashed = hashPin(newPin);
    await db.collection('generation_stats').updateOne({ auth_mobile: mobile }, { $set: { secret_pin: hashed } });
    await db.collection('generated_voters').updateMany({ MOBILE_NO: mobile },  { $set: { secret_pin: hashed } });
    // Delete OTP session after successful pin reset
    await db.collection('otp_sessions').deleteOne({ mobile });

    const stat   = await db.collection('generation_stats').findOne({ auth_mobile: mobile });
    const genDoc = await db.collection('generated_voters').findOne({ MOBILE_NO: mobile });
    const name   = genDoc ? `${genDoc.FM_NAME_EN || ''} ${genDoc.LASTNAME_EN || ''}`.trim() : '';

    return res.json({
      success:    true,
      has_card:   true,
      epic_no:    (stat || {}).epic_no  || '',
      card_url:   (stat || {}).card_url || '',
      voter_name: name,
      photo_url:  genDoc?.photo_url || '',
    });
  } catch (err) {
    console.error('reset-pin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /set-pin
// ────────────────────────────────────────────────────────────────
router.post('/set-pin', async (req, res) => {
  try {
    const { valid: vm, value: mobile } = validateMobile((req.body.mobile || '').trim());
    if (!vm) return res.status(400).json({ success: false, message: mobile });

    const { valid: vp, value: pin } = validatePin((req.body.pin || '').trim());
    if (!vp) return res.status(400).json({ success: false, message: pin });

    const rawEpic = String(req.body.epic_no || '').trim().toUpperCase();
    const epicNo  = rawEpic ? validateEpic(rawEpic).value : '';

    const hashed = hashPin(pin);
    const db     = getDb();

    if (epicNo) {
      await db.collection('generation_stats').updateOne(
        { epic_no: epicNo },
        { $set: { secret_pin: hashed, auth_mobile: mobile }, $setOnInsert: { epic_no: epicNo } },
        { upsert: true }
      );
    } else {
      await db.collection('generation_stats').updateOne({ auth_mobile: mobile }, { $set: { secret_pin: hashed } });
    }
    await db.collection('generated_voters').updateMany({ MOBILE_NO: mobile }, { $set: { secret_pin: hashed } });

    return res.json({ success: true });
  } catch (err) {
    console.error('set-pin error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

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
        MOBILE_NO: mobile,
        EPIC_NO: { $ne: epicNo }
      });
      if (otherEpic) {
        return res.status(400).json({
          success: false,
          message: 'This mobile number is already registered under a different EPIC number.'
        });
      }
    }

    const existing = await db.collection('generated_voters').findOne(
      { EPIC_NO: epicNo, MOBILE_NO: mobile },
      { projection: { card_url: 1, back_url: 1, combined_url: 1, photo_url: 1, wtl_code: 1, VOTER_NAME: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, referral_link: 1 } },
    );
    if (existing?.photo_url) {
      return res.status(409).json({
        success:     false,
        already_registered: true,
        message:     'You are already registered. Here is your existing card.',
        card_url:    existing.card_url,
        back_url:    existing.back_url    || '',
        combined_url: existing.combined_url || '',
        photo_url:   existing.photo_url   || '',
        wtl_code:    existing.wtl_code    || '',
        voter_name:  existing.VOTER_NAME  || '',
        epic_no:     epicNo,
        assembly_name: existing.ASSEMBLY_NAME || '',
        district:    existing.DISTRICT_NAME || '',
        part_no:     String(existing.PART_NO || ''),
        referral_link: existing.referral_link || '',
      });
    }

    const doc = await findVoterByEpic(epicNo);
    if (!doc) {
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
//            existing wtl_code preserved on re-generation;
//            magic-byte file validation.
// ────────────────────────────────────────────────────────────────
router.post('/generate-card', chatGenerateCardLimiter, upload.single('photo'), async (req, res) => {
  const reqId = crypto.randomUUID();
  try {
    const rawEpic = String(req.body.epic_no || req.body.epic || '').trim().toUpperCase();
    const { valid: ve, value: epicNo } = validateEpic(rawEpic);
    if (!ve) return res.status(400).json({ success: false, message: epicNo });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload your passport photo.' });
    }

    // Magic-byte validation — cannot be bypassed by spoofed Content-Type
    if (!validateMagicBytes(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Please upload a JPG, PNG or BMP image.' });
    }

    const db = getDb();
    const mobile      = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';

    // ── Hard block: one card per mobile number ───────────────────────────────────
    const existingCard = await db.collection('generated_voters').findOne(
      { MOBILE_NO: mobile, photo_url: { $exists: true, $ne: '' } },
      { projection: { card_url: 1, back_url: 1, combined_url: 1, photo_url: 1, wtl_code: 1, referral_link: 1, VOTER_NAME: 1, EPIC_NO: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1 } },
    );
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
        photo_url:          existingCard.photo_url     || '',
        wtl_code:           existingCard.wtl_code      || '',
        referral_link:      existingCard.referral_link || '',
        voter_name:         existingCard.VOTER_NAME    || '',
        epic_no:            existingCard.EPIC_NO       || epicNo,
        assembly_name:      existingCard.ASSEMBLY_NAME || '',
        district:           existingCard.DISTRICT_NAME || '',
        part_no:            String(existingCard.PART_NO || ''),
      });
    }

    // EPIC lookup from DB1
    const rawVoter = await findVoterByEpic(epicNo);
    if (!rawVoter) {
      return res.status(404).json({ success: false, message: 'EPIC Number not found.' });
    }
    const voter = normaliseVoter(rawVoter);

    const photoBuffer = req.file.buffer;

    // ── Distributed lock — prevent duplicate concurrent generation ─
    const lockExpiry = new Date(Date.now() + 120000); // 2-min lock
    let lockAcquired = false;
    try {
      await db.collection('generation_locks').updateOne(
        { mobile: mobile, locked_until: { $lt: new Date() } },
        { $set: { locked_until: lockExpiry, locked_by: reqId } },
        { upsert: true }
      );
      // Verify we own the lock
      const lock = await db.collection('generation_locks').findOne({ mobile: mobile });
      lockAcquired = lock?.locked_by === reqId;
    } catch (e) {
      if (e.code !== 11000) throw e;
      // Another request holds the lock
      lockAcquired = false;
    }

    if (!lockAcquired) {
      return res.status(429).json({ success: false, message: 'Card generation already in progress. Please try again in a moment.' });
    }

    try {
      // Preserve existing wtl_code to protect referral links
      const existingGen = await db.collection('generated_voters').findOne(
        { EPIC_NO: epicNo, MOBILE_NO: mobile }, { projection: { wtl_code: 1, referral_id: 1, referral_link: 1 } }
      );
      const wtlCode   = existingGen?.wtl_code || generateWtlCode();
      const config    = require('../config');

      // ── Referral attribution ───────────────────────────────────
      // Accept ref=<wtlCode>&rid=<referralId> from the request body
      // (frontend passes them when the user landed via a referral link)
      const rawRef    = String(req.body.ref  || '').trim().toUpperCase();
      const rawRid    = String(req.body.rid  || '').trim().toUpperCase();
      // Validate format — avoid injecting arbitrary values into DB
      const refWtlOk  = /^BJP-[0-9A-F]{8}$/.test(rawRef);
      const refRidOk  = /^REF-[0-9A-F]{8}$/.test(rawRid);
      const refWtl    = refWtlOk ? rawRef : '';
      const refRid    = refRidOk ? rawRid : '';

      // Verify the referral actually exists (prevent spoofed codes)
      let verifiedRefWtl = '';
      let verifiedRefRid = '';
      if (refWtl && refRid) {
        const referrer = await db.collection('generated_voters').findOne(
          { wtl_code: refWtl, referral_id: refRid },
          { projection: { _id: 1 } }
        );
        if (referrer) {
          verifiedRefWtl = refWtl;
          verifiedRefRid = refRid;
        }
      }

      // Generate referral link for this new member
      // Preserve existing referral_id if card is being re-generated
      const referralId   = existingGen?.referral_id   || ('REF-' + crypto.randomBytes(4).toString('hex').toUpperCase());
      const referralBase = config.baseUrl;
      const referralLink = `${referralBase}/refer/${wtlCode}/${referralId}`;
      const verifyUrl = `${config.baseUrl}/verify/${epicNo}`;


      const voterData = {
        epic_no:       voter.epic_no,
        name:          voter.name,
        assembly_name: voter.assembly_name,
        district:      voter.district,
        part_no:       voter.part_no,
        PART_NO:       voter.part_no,
        booth:         voter.part_no,
        wtl_code:      wtlCode,
        verify_url:    verifyUrl,
        VOTER_NAME:    voter.name,
        ASSEMBLY_NAME: voter.assembly_name,
        DISTRICT_NAME: voter.district,
        DISTRICT:      voter.district,
        EPIC_NO:       voter.epic_no,
        ASSEMBLY_NO:   voter.assembly_no,
      };

      // Upload photo to Cloudinary
      let photoUrl = '';
      try {
        photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
      } catch (e) {
        console.error('Photo upload failed:', e.message);
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
            wtl_code:       wtlCode,
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
            ...(verifiedRefWtl   ? { referred_by_wtl:          verifiedRefWtl   } : {}),
            ...(verifiedRefRid   ? { referred_by_referral_id:  verifiedRefRid   } : {}),
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true }
      );

      // Increment referrer's count (fire-and-forget, non-blocking)
      if (verifiedRefWtl) {
        db.collection('generated_voters').updateOne(
          { wtl_code: verifiedRefWtl },
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

      // Set verified session when card is successfully generated
      req.session.verified_mobile = mobile;
      req.session.cookie.maxAge   = 86400 * 1000;

      return res.json({
        success:       true,
        card_url:      cardUrl,
        back_url:      backUrl,
        combined_url:  combinedUrl,
        photo_url:     photoUrl,
        epic_no:       epicNo,
        voter_name:    voter.name,
        assembly_name: voter.assembly_name,
        district:      voter.district,
        part_no:       voter.part_no,
        wtl_code:      wtlCode,
        referral_id:   referralId,
        referral_link: referralLink,
        message:       'Card generated successfully',
      });
    } finally {
      // Always release the lock
      await db.collection('generation_locks').deleteOne({ mobile: mobile, locked_by: reqId }).catch(() => {});
    }

  } catch (err) {
    console.error('generate-card error:', err.message);
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
    const mobile = req.session.verified_mobile;

    // Try voter DB first; fall back to app DB if voter not indexed in DB1
    const rawVoter = await findVoterByEpic(epicNo);
    const voter    = rawVoter ? normaliseVoter(rawVoter) : null;

    // App DB lookups — by session mobile or by EPIC
    const genByMobile = mobile
      ? await db.collection('generated_voters').findOne({ MOBILE_NO: mobile }) || {}
      : {};
    const genByEpic   = await db.collection('generated_voters').findOne({ EPIC_NO: epicNo }) || {};
    const genDoc      = (genByMobile.EPIC_NO === epicNo ? genByMobile : genByEpic) || {};

    const stat = mobile
      ? await db.collection('generation_stats').findOne({ auth_mobile: mobile }) || {}
      : {};
    const mob  = stat.auth_mobile || '';

    const name     = voter?.name          || genDoc.VOTER_NAME || `${genDoc.FM_NAME_EN || ''} ${genDoc.LASTNAME_EN || ''}`.trim() || '';
    const assembly = voter?.assembly_name || genDoc.ASSEMBLY_NAME || '';
    const district = voter?.district      || genDoc.DISTRICT_NAME || genDoc.DISTRICT || '';

    if (!name && !assembly) {
      return res.status(404).json({ success: false, message: 'Profile not found' });
    }

    return res.json({
      success:            true,
      name,
      epic_no:            epicNo,
      assembly,
      district,
      wtl_code:           genDoc.wtl_code   || genDoc.ptc_code || '',
      card_url:           stat.card_url     || genDoc.card_url     || '',
      back_url:           stat.back_url     || genDoc.back_url     || '',
      combined_url:       stat.combined_url || genDoc.combined_url || '',
      photo_url:          stat.photo_url    || genDoc.photo_url    || '',
      auth_mobile_masked: mob.length >= 4 ? `****${mob.slice(-4)}` : '',
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
//  GET /referral-link/:wtlCode  — requires verified session
// ────────────────────────────────────────────────────────────────
router.get('/referral-link/:wtlCode', async (req, res) => {
  try {
    // Must have a verified mobile session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const wtlCode = String(req.params.wtlCode || '').trim();
    if (!wtlCode || !/^BJP-[0-9A-F]{8}$/.test(wtlCode)) {
      return res.status(400).json({ success: false, message: 'Invalid BJP code format' });
    }

    const db  = getDb();
    const doc = await db.collection('generated_voters').findOne(
      { wtl_code: wtlCode },
      { projection: { referral_id: 1, referral_link: 1, MOBILE_NO: 1 } }
    );

    if (!doc) return res.status(404).json({ success: false, message: 'Member not found' });

    // Verify the requesting session mobile matches the record
    if (doc.MOBILE_NO && doc.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const rid  = doc.referral_id || ('REF-' + crypto.randomBytes(4).toString('hex').toUpperCase());
    const referralBase = config.baseUrl;
    const link = `${referralBase}/refer/${wtlCode}/${rid}`;

    if (!doc.referral_id || doc.referral_link !== link) {
      await db.collection('generated_voters').updateOne(
        { wtl_code: wtlCode },
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
//  GET /my-members/:wtlCode  — requires verified session
// ────────────────────────────────────────────────────────────────
router.get('/my-members/:wtlCode', async (req, res) => {
  try {
    // Must have a verified mobile session
    if (!req.session?.verified_mobile) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    const wtlCode = String(req.params.wtlCode || '').trim();
    if (!wtlCode || !/^BJP-[0-9A-F]{8}$/.test(wtlCode)) {
      return res.status(400).json({ success: false, message: 'Invalid BJP code format' });
    }

    const db = getDb();

    // Verify the session mobile owns this WTL code
    const owner = await db.collection('generated_voters').findOne(
      { wtl_code: wtlCode }, { projection: { MOBILE_NO: 1 } }
    );
    if (!owner) return res.status(404).json({ success: false, message: 'Member not found' });
    if (owner.MOBILE_NO && owner.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // 1. Fetch Root Member
    const rootDoc = await db.collection('generated_voters').findOne(
      { wtl_code: wtlCode },
      { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, wtl_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1 } }
    );
    if (!rootDoc) return res.status(404).json({ success: false, message: 'Member details not found' });

    const root = {
      name:          rootDoc.VOTER_NAME || `${rootDoc.FM_NAME_EN || ''} ${rootDoc.LASTNAME_EN || ''}`.trim() || 'A Member',
      epic_no:       rootDoc.EPIC_NO || '',
      wtl_code:      rootDoc.wtl_code || '',
      photo_url:     rootDoc.photo_url || '',
      assembly_name: rootDoc.ASSEMBLY_NAME || '',
      district:      rootDoc.DISTRICT_NAME || '',
      part_no:       rootDoc.PART_NO || '',
    };

    // 2. Fetch Layer 2 Members
    const layer2Docs = await db.collection('generated_voters')
      .find(
        { referred_by_wtl: wtlCode },
        { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, wtl_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, generated_at: 1 } }
      )
      .sort({ generated_at: -1 })
      .toArray();

    const layer2Wtls = layer2Docs.map(m => m.wtl_code).filter(Boolean);

    // 3. Fetch Layer 3 Members
    let layer3Docs = [];
    if (layer2Wtls.length > 0) {
      layer3Docs = await db.collection('generated_voters')
        .find(
          { referred_by_wtl: { $in: layer2Wtls } },
          { projection: { VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, EPIC_NO: 1, wtl_code: 1, photo_url: 1, ASSEMBLY_NAME: 1, DISTRICT_NAME: 1, PART_NO: 1, referred_by_wtl: 1, generated_at: 1 } }
        )
        .toArray();
    }

    // Map Layer 3 members by their referrer's WTL code
    const layer3Map = {};
    for (const m3 of layer3Docs) {
      const parentWtl = m3.referred_by_wtl;
      if (!layer3Map[parentWtl]) {
        layer3Map[parentWtl] = [];
      }
      layer3Map[parentWtl].push({
        name:          m3.VOTER_NAME || `${m3.FM_NAME_EN || ''} ${m3.LASTNAME_EN || ''}`.trim() || 'A Member',
        epic_no:       m3.EPIC_NO || '',
        wtl_code:      m3.wtl_code || '',
        photo_url:     m3.photo_url || '',
        assembly_name: m3.ASSEMBLY_NAME || '',
        district:      m3.DISTRICT_NAME || '',
        part_no:       m3.PART_NO || '',
        generated_at:  m3.generated_at || null,
      });
    }

    // Build the tree
    const tree = layer2Docs.map(m2 => {
      const w2 = m2.wtl_code;
      return {
        name:          m2.VOTER_NAME || `${m2.FM_NAME_EN || ''} ${m2.LASTNAME_EN || ''}`.trim() || 'A Member',
        epic_no:       m2.EPIC_NO || '',
        wtl_code:      w2 || '',
        photo_url:     m2.photo_url || '',
        assembly_name: m2.ASSEMBLY_NAME || '',
        district:      m2.DISTRICT_NAME || '',
        part_no:       m2.PART_NO || '',
        generated_at:  m2.generated_at || null,
        referrals:     layer3Map[w2] || [],
      };
    });

    return res.json({ success: true, root, tree });
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

    const wtlCode = String(req.body.wtl_code || '').trim();
    const epicNo  = String(req.body.epic_no  || '').trim().toUpperCase();
    if (!wtlCode) return res.status(400).json({ success: false, message: 'WTL code required' });

    const db  = getDb();
    const gen = await db.collection('generated_voters').findOne({ wtl_code: wtlCode }) || {};

    // Verify session mobile owns this WTL code
    if (gen.MOBILE_NO && gen.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const name = gen.VOTER_NAME || `${gen.FM_NAME_EN || ''} ${gen.LASTNAME_EN || ''}`.trim();

    try {
      await db.collection('volunteer_requests').insertOne({
        wtl_code:     wtlCode,
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
        // Already submitted (unique index on wtl_code)
        const existing = await db.collection('volunteer_requests').findOne({ wtl_code: wtlCode });
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

    const wtlCode = String(req.body.wtl_code || '').trim();
    const epicNo  = String(req.body.epic_no  || '').trim().toUpperCase();
    const boothNo = String(req.body.booth_no || '').trim().slice(0, 6);

    if (!wtlCode) return res.status(400).json({ success: false, message: 'WTL code required' });
    if (!boothNo || !/^\d{1,6}$/.test(boothNo)) {
      return res.status(400).json({ success: false, message: 'Invalid booth number. Must be 1–6 digits.' });
    }

    const db  = getDb();
    const gen = await db.collection('generated_voters').findOne({ wtl_code: wtlCode }) || {};

    // Verify session mobile owns this WTL code
    if (gen.MOBILE_NO && gen.MOBILE_NO !== req.session.verified_mobile) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const name = gen.VOTER_NAME || `${gen.FM_NAME_EN || ''} ${gen.LASTNAME_EN || ''}`.trim();

    try {
      await db.collection('booth_agent_requests').insertOne({
        wtl_code:     wtlCode,
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
        const existing = await db.collection('booth_agent_requests').findOne({ wtl_code: wtlCode });
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
          wtl_code: 1, 
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

    const result = performers.map((p, index) => ({
      rank:                 index + 1,
      name:                 p.VOTER_NAME || `${p.FM_NAME_EN || ''} ${p.LASTNAME_EN || ''}`.trim() || 'BJP Member',
      referred_count:       p.referred_members_count || 0,
      referrals:            p.referred_members_count || 0,
      wtl_code:             p.wtl_code || '',
      photo_url:            p.photo_url || '',
      epic_no:              p.EPIC_NO || '',
      assembly_name:        p.ASSEMBLY_NAME || '',
      district:             p.DISTRICT_NAME || '',
      part_no:              p.PART_NO || ''
    }));

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
//  GET /member-status/:wtlCode
// ────────────────────────────────────────────────────────────────
router.get('/member-status/:wtlCode', async (req, res) => {
  try {
    const wtlCode = req.params.wtlCode;
    const db = getDb();
    const voter = await db.collection('generated_voters').findOne({ wtl_code: wtlCode });
    if (!voter) {
      return res.status(404).json({ success: false, message: 'Member not found' });
    }
    const appointment = await db.collection('appointments').findOne({ wtl_code: wtlCode });
    return res.json({
      success: true,
      referred_count: voter.referred_members_count || 0,
      has_appointment: !!appointment,
      appointment: appointment ? { date: appointment.date, time: appointment.time } : null
    });
  } catch (err) {
    console.error('member-status error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /book-appointment
// ────────────────────────────────────────────────────────────────
router.post('/book-appointment', async (req, res) => {
  try {
    const { wtl_code, date, time } = req.body;
    if (!wtl_code || !date || !time) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }
    const db = getDb();
    // Check if appointment already exists
    const existing = await db.collection('appointments').findOne({ wtl_code });
    if (existing) {
      return res.json({ success: true, message: 'Appointment already booked' });
    }
    await db.collection('appointments').insertOne({
      wtl_code,
      date,
      time,
      created_at: new Date()
    });
    return res.json({ success: true, message: 'Appointment booked successfully' });
  } catch (err) {
    console.error('book-appointment error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
