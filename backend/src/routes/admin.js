/**
 * Admin API routes — faithful port of app.py's admin_bp blueprint.
 * All routes under /admin/* are handled here.
 */
const express = require('express');
const router  = express.Router();
const axios   = require('axios');

const { requireAdminAuth } = require('../middleware/auth');
const { adminLoginLimiter } = require('../middleware/rateLimiter');
const { LoginAttemptTracker } = require('../utils/security');
const { sanitizeSearch } = require('../utils/validators');
const { getPhotoPresignedUrl } = require('../services/backblazeService');
const config = require('../config');
const { getDb, getVoterDb, getVoterTotalCount, findVoterByEpic } = require('../db');

const loginTracker = new LoginAttemptTracker();

// ── In-memory stats cache (mirrors Python's _cache) ──────────────
const _cache = new Map();
function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() / 1000 > entry.expires) { _cache.delete(key); return null; }
  return entry.value;
}
function cacheSet(key, value, ttlSeconds = 60) {
  _cache.set(key, { value, expires: Date.now() / 1000 + ttlSeconds });
}

const _staticColCounts = new Map();
async function getCollectionSize(voterDb, colName) {
  let count = _staticColCounts.get(colName);
  if (count === undefined) {
    count = await voterDb.collection(colName).estimatedDocumentCount();
    _staticColCounts.set(colName, count);
  }
  return count;
}

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/login
// ────────────────────────────────────────────────────────────────
router.post('/api/login', adminLoginLimiter, async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  const { locked, retryAfter } = loginTracker.isLocked(ip);
  if (locked) {
    return res.status(429).json({
      success: false,
      message: `Too many failed attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.`,
    });
  }

  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required.' });
  }

  if (username === config.admin.username && password === config.admin.password) {
    loginTracker.reset(ip);
    req.session.adminLoggedIn = true;
    req.session.adminUsername = username;
    req.session.cookie.maxAge = 86400 * 1000;
    // Explicitly save session before responding so the Set-Cookie header
    // is guaranteed to be sent even if the store is async
    return req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err.message);
        return res.status(500).json({ success: false, message: 'Session error. Please try again.' });
      }
      return res.json({ success: true, message: 'Login successful.' });
    });
  }

  loginTracker.recordAttempt(ip, username, false);
  const Sentry = require('@sentry/node');
  Sentry.captureMessage(`Failed admin login attempt: '${username}' from IP ${ip}`, {
    level: 'warning',
    extra: { ip, username }
  });
  return res.status(401).json({ success: false, message: 'Invalid credentials.' });
});

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/logout
// ────────────────────────────────────────────────────────────────
router.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true, message: 'Logged out.' }));
});


// ── Dedicated session-check endpoint (used by AdminLayout) ───────
router.get('/api/session', (req, res) => {
  if (req.session?.adminLoggedIn) {
    return res.json({ success: true, username: req.session.adminUsername });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated.' });
});

// ── All routes below require admin auth ──────────────────────────
router.use(requireAdminAuth);

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/stats  (mirrors get_dashboard_stats)
// ────────────────────────────────────────────────────────────────
router.get('/api/stats', async (req, res) => {
  const cached = cacheGet('dashboard_stats_v2');
  if (cached) return res.json(cached);

  try {
    const db = getDb();

    // DB1 — total voters across all ass_* collections (cached 10 min)
    const totalVoters = await getVoterTotalCount();

    // DB2 — app data counts
    const generatedCount = await db.collection('generated_voters').estimatedDocumentCount();

    const statsAgg = await db.collection('generation_stats').aggregate([
      {
        $group: {
          _id: null,
          total_generated:   { $sum: { $cond: [{ $gt: ['$count', 0] }, 1, 0] } },
          total_generations: { $sum: '$count' },
          cards_on_cloud:    { $sum: { $cond: [{ $and: [{ $ne: ['$card_url', ''] }, { $ne: ['$card_url', null] }] }, 1, 0] } },
          last_generation:   { $max: '$last_generated' },
        },
      },
    ]).toArray();

    const sa = statsAgg[0] || {};

    const referralsAgg = await db.collection('generated_voters').aggregate([
      { $group: { _id: null, total: { $sum: '$referred_members_count' } } },
    ]).toArray();

    const [pendingVols, confirmedVols, pendingBA, confirmedBA, topReferrals] = await Promise.all([
      db.collection('volunteer_requests').countDocuments({ status: 'pending' }),
      db.collection('volunteer_requests').countDocuments({ status: 'confirmed' }),
      db.collection('booth_agent_requests').countDocuments({ status: 'pending' }),
      db.collection('booth_agent_requests').countDocuments({ status: 'confirmed' }),
      db.collection('generated_voters')
        .find({ referred_members_count: { $gt: 0 } })
        .sort({ referred_members_count: -1 })
        .limit(5)
        .project({ VOTER_NAME: 1, FM_NAME_EN: 1, LASTNAME_EN: 1, wtl_code: 1, MOBILE_NO: 1, DISTRICT_NAME: 1, ASSEMBLY_NAME: 1, referred_members_count: 1, photo_url: 1 })
        .toArray()
    ]);

    const result = {
      // ── Fields matched to DashboardPage.jsx ─────────────────────
      total_voters:           totalVoters,                      // 5.8cr from DB1
      users_generated:        sa.total_generated  || 0,         // unique users who generated
      total_generations:      sa.total_generations || 0,        // total card gen count
      cards_on_cloud:         sa.cards_on_cloud    || 0,        // cards with Cloudinary URL
      generated_voters:       generatedCount,                   // generated_voters collection size
      total_referrals:        referralsAgg[0]?.total || 0,
      pending_volunteers:     pendingVols,
      confirmed_volunteers:   confirmedVols,
      pending_booth_agents:   pendingBA,
      confirmed_booth_agents: confirmedBA,
      db_connected:           true,
      top_referrals: topReferrals.map(r => ({
        name: r.VOTER_NAME || `${r.FM_NAME_EN || ''} ${r.LASTNAME_EN || ''}`.trim() || 'Unknown',
        code: r.wtl_code || '',
        mobile: r.MOBILE_NO || '',
        district: r.DISTRICT_NAME || '',
        assembly: r.ASSEMBLY_NAME || '',
        photo_url: r.photo_url || '',
        referrals: r.referred_members_count || 0
      }))
    };

    cacheSet('dashboard_stats_v2', result, 60);
    return res.json(result);
  } catch (err) {
    console.error('stats error:', err);
    return res.json({
      total_voters: 0, users_generated: 0, total_generations: 0,
      cards_on_cloud: 0, generated_voters: 0, db_connected: false,
      total_referrals: 0, pending_volunteers: 0, confirmed_volunteers: 0,
      pending_booth_agents: 0, confirmed_booth_agents: 0,
    });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/external-stats  (mirrors _get_external_stats)
// ────────────────────────────────────────────────────────────────
router.get('/api/external-stats', async (req, res) => {
  const cached = cacheGet('external_stats');
  if (cached) return res.json(cached);

  const result = {
    db1_size_mb: 0, db2_size_mb: 0, db2_objects: 0,
    cloudinary_credits: 'N/A', sms_balance: 'N/A',
  };

  try {
    const db    = getDb();
    const stats = await db.command({ dbStats: 1 });
    const mb    = Math.round((stats.dataSize || 0) / 1024 / 1024 * 100) / 100;
    result.db1_size_mb = mb;
    result.db2_size_mb = mb;
    result.db2_objects = await db.collection('generated_voters').estimatedDocumentCount();
  } catch {}

  try { result.cloudinary_credits = await getUsageStats(); } catch {}

  if (config.smsApiKey) {
    try {
      const resp = await axios.get(`https://2factor.in/API/V1/${config.smsApiKey}/BAL/SMS`, { timeout: 3000 });
      result.sms_balance = resp.data?.Details || 'N/A';
    } catch {}
  }

  cacheSet('external_stats', result, 300);
  return res.json(result);
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/voters
//  Queries across all ass_* collections in DB1
// ────────────────────────────────────────────────────────────────
router.get('/api/voters', async (req, res) => {
  try {
    const search   = sanitizeSearch(req.query.search || '');
    const assembly = String(req.query.assembly || '').trim(); // e.g. "33" → uses ass_33
    const district = String(req.query.district || '').trim();
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage  = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 5), 100);

    const db      = getDb();
    const voterDb = getVoterDb();

    // Build filter
    const filt = {};
    if (district) filt.DISTRICT_NAME = district;

    // ── Optimization: Exact EPIC Search Bypass ──
    const cleanSearch = search.trim().toUpperCase();
    const isEpicPattern = /^[A-Z0-9\/\-]+$/.test(cleanSearch) && cleanSearch.length >= 6;
    if (isEpicPattern && !assembly && !district) {
      const doc = await findVoterByEpic(cleanSearch);
      if (doc) {
        const voter = docToVoter(doc);
        const stat = await db.collection('generation_stats').findOne({ epic_no: voter.epic_no }) || {};
        voter.gen_count      = stat.count || 0;
        voter.last_generated = stat.last_generated ? String(stat.last_generated).slice(0, 19).replace('T', ' ') : '';
        voter.photo_url      = await getPhotoPresignedUrl(stat.photo_url  || '');
        voter.card_url       = stat.card_url   || '';
        voter.auth_mobile    = stat.auth_mobile || '';
        
        const assemblies = await getAssemblyListCached(voterDb);
        return res.json({
          voters: [voter],
          total: 1,
          per_page: perPage,
          page: 1,
          total_pages: 1,
          assemblies,
          districts: [],
          cursor_mode: false
        });
      } else {
        const assemblies = await getAssemblyListCached(voterDb);
        return res.json({
          voters: [],
          total: 0,
          per_page: perPage,
          page: 1,
          total_pages: 1,
          assemblies,
          districts: [],
          cursor_mode: false
        });
      }
    }

    if (search) {
      // Escape regex special chars to prevent ReDoS
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filt.$or = [
        { EPIC_NO:    { $regex: escaped, $options: 'i' } },
        { VOTER_NAME: { $regex: escaped, $options: 'i' } },
      ];
    }

    // Determine which ass_* collections to query
    let targetCols;
    if (assembly) {
      // Direct assembly number → single collection
      targetCols = [`ass_${assembly}`];
    } else {
      const allCols = await voterDb.listCollections({ name: /^ass_\d+$/ }).toArray();
      targetCols = allCols.map(c => c.name);
    }

    // Count total across targeted collections
    let total = 0;
    if (Object.keys(filt).length === 0 && !assembly) {
      // Use cached total count for unfiltered full scan
      total = await getVoterTotalCount();
    } else {
      const counts = await Promise.all(
        targetCols.map(col => voterDb.collection(col).countDocuments(filt))
      );
      total = counts.reduce((s, c) => s + c, 0);
    }

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const saferPage  = Math.min(page, totalPages);
    const offset     = (saferPage - 1) * perPage;

    // Fetch page of docs — for single-collection queries this is straightforward
    // For multi-collection we collect from collections in order
    let docs = [];
    if (targetCols.length === 1) {
      docs = await voterDb.collection(targetCols[0]).find(filt).skip(offset).limit(perPage).toArray();
    } else {
      // Multi-collection: iterate in order, skip/limit across collections
      let remaining = offset;
      let needed    = perPage;
      for (const col of targetCols) {
        if (needed <= 0) break;
        const colCount = Object.keys(filt).length === 0 ? await getCollectionSize(voterDb, col) : await voterDb.collection(col).countDocuments(filt);
        if (remaining >= colCount) { remaining -= colCount; continue; }
        const colDocs = await voterDb.collection(col).find(filt).skip(remaining).limit(needed).toArray();
        docs.push(...colDocs);
        needed    -= colDocs.length;
        remaining  = 0;
      }
    }

    const voters = docs.map(docToVoter);

    // Attach generation stats from DB2
    const epicNos  = voters.map(v => v.epic_no).filter(Boolean);
    const statsMap = {};
    if (epicNos.length) {
      const statsDocs = await db.collection('generation_stats').find({ epic_no: { $in: epicNos } }).toArray();
      for (const s of statsDocs) statsMap[s.epic_no] = s;
    }
    for (const v of voters) {
      const s = statsMap[v.epic_no] || {};
      v.gen_count      = s.count || 0;
      v.last_generated = s.last_generated ? String(s.last_generated).slice(0, 19).replace('T', ' ') : '';
      v.photo_url      = await getPhotoPresignedUrl(s.photo_url  || '');
      v.card_url       = s.card_url   || '';
      v.auth_mobile    = s.auth_mobile || '';
    }

    // Cached assembly list — derive from collection names
    const assemblies = await getAssemblyListCached(voterDb);
    const districts  = await getDistinctCached(voterDb, targetCols[0] || 'ass_1', 'DISTRICT_NAME');

    return res.json({
      voters, total, per_page: perPage, page: saferPage, total_pages: totalPages,
      assemblies, districts, cursor_mode: false,
    });
  } catch (err) {
    console.error('admin voters error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/voters/:epicNo
// ────────────────────────────────────────────────────────────────
router.get('/api/voters/:epicNo', async (req, res) => {
  try {
    const epicNo = req.params.epicNo.trim().toUpperCase();
    const db     = getDb();
    // Search across all ass_* collections
    const doc    = await findVoterByEpic(epicNo);

    if (!doc) return res.status(404).json({ success: false, message: 'Voter not found.' });

    const voter  = docToVoter(doc);
    const stat   = await db.collection('generation_stats').findOne({ epic_no: epicNo }) || {};
    const genDoc = await db.collection('generated_voters').findOne({ EPIC_NO: epicNo }) || {};

    voter.gen_count      = stat.count || 0;
    voter.last_generated = stat.last_generated ? String(stat.last_generated).slice(0, 19).replace('T', ' ') : '';
    voter.photo_url      = await getPhotoPresignedUrl(stat.photo_url  || genDoc.photo_url  || '');
    voter.card_url       = stat.card_url   || genDoc.card_url   || '';
    voter.wtl_code       = genDoc.wtl_code || '';
    const mob            = stat.auth_mobile || '';
    voter.auth_mobile_masked = mob.length >= 4 ? `****${mob.slice(-4)}` : '';

    return res.json({ success: true, voter });
  } catch (err) {
    console.error('admin voter detail error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/generated-voters
// ────────────────────────────────────────────────────────────────
router.get('/api/generated-voters', async (req, res) => {
  try {
    const search   = sanitizeSearch(req.query.search || '');
    const assembly = String(req.query.assembly || '').trim();
    const page     = Math.max(1, parseInt(req.query.page, 10) || 1);
    const perPage  = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 5), 100);

    const db   = getDb();
    const filt = {};

    if (assembly) filt.ASSEMBLY_NAME = assembly;
    if (search) {
      // Escape regex special chars to prevent ReDoS
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filt.$or = [
        { EPIC_NO:    { $regex: escaped, $options: 'i' } },
        { FM_NAME_EN: { $regex: escaped, $options: 'i' } },
        { LASTNAME_EN:{ $regex: escaped, $options: 'i' } },
        { wtl_code:   { $regex: escaped, $options: 'i' } },
        { MOBILE_NO:  { $regex: escaped, $options: 'i' } },
      ];
    }

    const total      = Object.keys(filt).length
      ? await db.collection('generated_voters').countDocuments(filt)
      : await db.collection('generated_voters').estimatedDocumentCount();
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const saferPage  = Math.min(page, totalPages);

    const docs   = await db.collection('generated_voters')
      .find(filt).sort({ generated_at: -1 })
      .skip((saferPage - 1) * perPage).limit(perPage).toArray();

    const voters = docs.map(genDocToDict);

    const assemblies = await getDistinctCached(db, 'generated_voters', 'ASSEMBLY_NAME');
    const districts  = await getDistinctCached(db, 'generated_voters', 'DISTRICT_NAME');

    await presignPhotoUrls(voters);

    return res.json({
      voters, total, page: saferPage, per_page: perPage,
      total_pages: totalPages, assemblies, districts, cursor_mode: false,
    });
  } catch (err) {
    console.error('admin generated-voters error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/generated-voters/:wtlCode
// ────────────────────────────────────────────────────────────────
router.get('/api/generated-voters/:wtlCode', async (req, res) => {
  try {
    const db  = getDb();
    const doc = await db.collection('generated_voters').findOne({ wtl_code: req.params.wtlCode });

    if (!doc) return res.status(404).json({ success: false, message: 'Not found.' });

    const voter    = genDocToDict(doc);
    voter.photo_url = await getPhotoPresignedUrl(voter.photo_url || '');
    const referred = await db.collection('generated_voters')
      .find({ referred_by_wtl: req.params.wtlCode }).sort({ generated_at: -1 }).toArray();
    const referredFormatted = referred.map(genDocToDict);
    await presignPhotoUrls(referredFormatted);
    const volReq  = await db.collection('volunteer_requests').findOne({ wtl_code: req.params.wtlCode }) || null;
    const baReq   = await db.collection('booth_agent_requests').findOne({ wtl_code: req.params.wtlCode }) || null;
    const meetReq = await db.collection('appointments').findOne({ wtl_code: req.params.wtlCode }) || null;

    return res.json({
      success: true,
      voter,
      referred: referredFormatted,
      volunteer_req:   serialiseDoc(volReq),
      booth_agent_req: serialiseDoc(baReq),
      meet_req:        serialiseDoc(meetReq),
    });
  } catch (err) {
    console.error('admin generated-voter detail error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/volunteer-requests
// ────────────────────────────────────────────────────────────────
router.get('/api/volunteer-requests', async (req, res) => {
  try {
    const { search, status, page, perPage, filt } = buildListParams(req);
    if (status) filt.status = status;
    const db = getDb();
    const { items, total, totalPages } = await paginatedList(db, 'volunteer_requests', filt, { requested_at: -1 }, page, perPage);

    // Enriched with voter details (name fallbacks + photo url)
    const wtlCodes = items.map(x => x.wtl_code).filter(Boolean);
    const voters = await db.collection('generated_voters')
      .find({ wtl_code: { $in: wtlCodes } })
      .toArray();

    const voterMap = new Map(voters.map(v => [
      v.wtl_code,
      {
        name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim(),
        photo_url: v.photo_url || ''
      }
    ]));

    const enrichedItems = items.map(item => {
      const profile = voterMap.get(item.wtl_code) || {};
      return {
        ...item,
        name: item.name || profile.name || '—',
        photo_url: profile.photo_url || ''
      };
    });

    await presignPhotoUrls(enrichedItems);
    return res.json({ items: enrichedItems, requests: enrichedItems, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    console.error('volunteer-requests error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/volunteer-requests/:wtlCode/confirm
// ────────────────────────────────────────────────────────────────
router.post('/api/volunteer-requests/:wtlCode/confirm', async (req, res) => {
  try {
    const db = getDb();
    // Verify the member exists before confirming
    const member = await db.collection('generated_voters').findOne(
      { wtl_code: req.params.wtlCode }
    );
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

    await db.collection('volunteer_requests').updateOne(
      { wtl_code: req.params.wtlCode },
      {
        $set: {
          status: 'confirmed',
          reviewed_at: new Date(),
          reviewed_by: config.admin.username,
          wing: req.body.wing || 'General Wing',
          name: member.VOTER_NAME || `${member.FM_NAME_EN || ''} ${member.LASTNAME_EN || ''}`.trim()
        },
        $setOnInsert: {
          requested_at: new Date()
        }
      },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('confirm-volunteer error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/volunteer-requests/:wtlCode/reject
// ────────────────────────────────────────────────────────────────
router.post('/api/volunteer-requests/:wtlCode/reject', async (req, res) => {
  try {
    const db = getDb();
    const r  = await db.collection('volunteer_requests').updateOne(
      { wtl_code: req.params.wtlCode, status: 'pending' },
      { $set: { status: 'rejected', reviewed_at: new Date(), reviewed_by: config.admin.username } }
    );
    return res.json({ success: Boolean(r.modifiedCount) });
  } catch (err) {
    console.error('reject-volunteer error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/confirmed-volunteers
// ────────────────────────────────────────────────────────────────
router.get('/api/confirmed-volunteers', async (req, res) => {
  try {
    const { search, page, perPage } = buildListParams(req);
    const filt = { status: 'confirmed' };
    if (search) {
      filt.$or = [{ name: { $regex: search, $options: 'i' } }, { wtl_code: { $regex: search, $options: 'i' } }];
    }
    const db = getDb();
    const { items, total, totalPages } = await paginatedList(db, 'volunteer_requests', filt, { reviewed_at: -1 }, page, perPage);

    // Enriched with voter details (name fallbacks + photo url)
    const wtlCodes = items.map(x => x.wtl_code).filter(Boolean);
    const voters = await db.collection('generated_voters')
      .find({ wtl_code: { $in: wtlCodes } })
      .toArray();

    const voterMap = new Map(voters.map(v => [
      v.wtl_code,
      {
        name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim(),
        photo_url: v.photo_url || '',
        epic_no: v.EPIC_NO || v.epic_no || '',
        mobile: v.MOBILE_NO || '',
        assembly: v.ASSEMBLY_NAME || ''
      }
    ]));

    const enrichedItems = items.map(item => {
      const profile = voterMap.get(item.wtl_code) || {};
      return {
        ...item,
        name: item.name || profile.name || '—',
        photo_url: profile.photo_url || '',
        epic_no: item.epic_no || profile.epic_no || '—',
        mobile: item.mobile || profile.mobile || '—',
        assembly: item.assembly || profile.assembly || '—',
        confirmed_at: item.reviewed_at || item.confirmed_at || null
      };
    });

    await presignPhotoUrls(enrichedItems);
    return res.json({ items: enrichedItems, volunteers: enrichedItems, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    console.error('confirmed-volunteers error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/booth-agent-requests
// ────────────────────────────────────────────────────────────────
router.get('/api/booth-agent-requests', async (req, res) => {
  try {
    const { search, status, page, perPage, filt } = buildListParams(req);
    if (status) filt.status = status;
    const db = getDb();
    const { items, total, totalPages } = await paginatedList(db, 'booth_agent_requests', filt, { requested_at: -1 }, page, perPage);

    // Enriched with voter details (name fallbacks + photo url)
    const wtlCodes = items.map(x => x.wtl_code).filter(Boolean);
    const voters = await db.collection('generated_voters')
      .find({ wtl_code: { $in: wtlCodes } })
      .toArray();

    const voterMap = new Map(voters.map(v => [
      v.wtl_code,
      {
        name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim(),
        photo_url: v.photo_url || ''
      }
    ]));

    const enrichedItems = items.map(item => {
      const profile = voterMap.get(item.wtl_code) || {};
      return {
        ...item,
        name: item.name || profile.name || '—',
        photo_url: profile.photo_url || ''
      };
    });

    await presignPhotoUrls(enrichedItems);
    return res.json({ items: enrichedItems, requests: enrichedItems, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    console.error('booth-agent-requests error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/booth-agent-requests/:wtlCode/confirm
// ────────────────────────────────────────────────────────────────
router.post('/api/booth-agent-requests/:wtlCode/confirm', async (req, res) => {
  try {
    const db = getDb();
    // Verify the member exists before confirming
    const member = await db.collection('generated_voters').findOne(
      { wtl_code: req.params.wtlCode }
    );
    if (!member) return res.status(404).json({ success: false, message: 'Member not found.' });

    await db.collection('booth_agent_requests').updateOne(
      { wtl_code: req.params.wtlCode },
      {
        $set: {
          status: 'confirmed',
          reviewed_at: new Date(),
          reviewed_by: config.admin.username,
          district: req.body.district || member.DISTRICT_NAME || '',
          assembly: req.body.assembly || member.ASSEMBLY_NAME || '',
          booth_no: req.body.booth_no || member.part_no || '',
          name: member.VOTER_NAME || `${member.FM_NAME_EN || ''} ${member.LASTNAME_EN || ''}`.trim()
        },
        $setOnInsert: {
          requested_at: new Date()
        }
      },
      { upsert: true }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('confirm-booth-agent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  POST /admin/api/booth-agent-requests/:wtlCode/reject
// ────────────────────────────────────────────────────────────────
router.post('/api/booth-agent-requests/:wtlCode/reject', async (req, res) => {
  try {
    const db = getDb();
    const r  = await db.collection('booth_agent_requests').updateOne(
      { wtl_code: req.params.wtlCode, status: 'pending' },
      { $set: { status: 'rejected', reviewed_at: new Date(), reviewed_by: config.admin.username } }
    );
    return res.json({ success: Boolean(r.modifiedCount) });
  } catch (err) {
    console.error('reject-booth-agent error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/confirmed-booth-agents
// ────────────────────────────────────────────────────────────────
router.get('/api/confirmed-booth-agents', async (req, res) => {
  try {
    const { search, page, perPage } = buildListParams(req);
    const filt = { status: 'confirmed' };
    if (search) {
      filt.$or = [{ name: { $regex: search, $options: 'i' } }, { wtl_code: { $regex: search, $options: 'i' } }];
    }
    const db = getDb();
    const { items, total, totalPages } = await paginatedList(db, 'booth_agent_requests', filt, { reviewed_at: -1 }, page, perPage);

    // Enriched with voter details (name fallbacks + photo url)
    const wtlCodes = items.map(x => x.wtl_code).filter(Boolean);
    const voters = await db.collection('generated_voters')
      .find({ wtl_code: { $in: wtlCodes } })
      .toArray();

    const voterMap = new Map(voters.map(v => [
      v.wtl_code,
      {
        name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim(),
        photo_url: v.photo_url || '',
        epic_no: v.EPIC_NO || v.epic_no || '',
        mobile: v.MOBILE_NO || '',
        assembly: v.ASSEMBLY_NAME || ''
      }
    ]));

    const enrichedItems = items.map(item => {
      const profile = voterMap.get(item.wtl_code) || {};
      return {
        ...item,
        name: item.name || profile.name || '—',
        photo_url: profile.photo_url || '',
        epic_no: item.epic_no || profile.epic_no || '—',
        mobile: item.mobile || profile.mobile || '—',
        assembly: item.assembly || profile.assembly || '—',
        confirmed_at: item.reviewed_at || item.confirmed_at || null
      };
    });

    await presignPhotoUrls(enrichedItems);
    return res.json({ items: enrichedItems, agents: enrichedItems, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    console.error('confirmed-booth-agents error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ── Shared helpers ────────────────────────────────────────────────

/**
 * docToVoter — maps DB1 ass_* document to a standard voter dict.
 *
 * Actual DB1 schema (consistent across all ass_* collections):
 *   EPIC_NO, VOTER_NAME, ASSEMBLY_NO, ASSEMBLY_NAME,
 *   DISTRICT, GENDER, MOBILE_NUMBER, ID
 *
 * Also handles generated_voters docs from DB2 which may have
 * additional stored fields.
 */
function docToVoter(doc) {
  if (!doc) return null;
  // DB1 has VOTER_NAME; DB2 generated_voters stores VOTER_NAME too
  const name = doc.VOTER_NAME || `${doc.FM_NAME_EN || ''} ${doc.LASTNAME_EN || ''}`.trim() || '';
  return {
    epic_no:       doc.EPIC_NO                          || '',
    name,
    assembly:      String(doc.ASSEMBLY_NO               || ''),
    assembly_name: doc.ASSEMBLY_NAME                    || '',
    district:      doc.DISTRICT || doc.DISTRICT_NAME    || '',
    age:           doc.AGE                              || '',
    sex:           doc.GENDER                           || '',
    gender:        doc.GENDER                           || '',
    mobile:        doc.MOBILE_NUMBER || doc.MOBILE_NO   || '',
    relation_name: '',
    part_no:       String(doc.PART_NO || ''),
    section_no:    String(doc.SECTION_NO || ''),
    house_no:      doc.C_HOUSE_NO || doc.HOUSE_NO       || '',
    dob:           doc.DOB                              || '',
    id:            String(doc._id                       || ''),
    // Keep raw fields for card generator compatibility
    EPIC_NO:       doc.EPIC_NO                          || '',
    VOTER_NAME:    name,
    ASSEMBLY_NO:   String(doc.ASSEMBLY_NO               || ''),
    ASSEMBLY_NAME: doc.ASSEMBLY_NAME                    || '',
    DISTRICT:      doc.DISTRICT || doc.DISTRICT_NAME    || '',
    DISTRICT_NAME: doc.DISTRICT || doc.DISTRICT_NAME    || '',
    GENDER:        doc.GENDER                           || '',
    MOBILE_NO:     doc.MOBILE_NUMBER || doc.MOBILE_NO   || '',
  };
}

/** Mirrors Python's _gen_doc_to_dict */
function genDocToDict(doc) {
  if (!doc) return null;
  const base = docToVoter(doc) || {};
  base.wtl_code               = doc.wtl_code || '';
  base.photo_url              = doc.photo_url || '';
  base.card_url               = doc.card_url  || '';
  base.back_url               = doc.back_url  || '';
  base.combined_url           = doc.combined_url || '';
  base.secret_pin             = doc.secret_pin   ? '[set]' : '';
  base.referral_id            = doc.referral_id  || '';
  base.referral_link          = doc.referral_link || '';
  base.referred_by_wtl        = doc.referred_by_wtl || '';
  base.referred_members_count = doc.referred_members_count || 0;
  base.source                 = doc.source       || '';
  base.generated_at           = doc.generated_at ? (doc.generated_at instanceof Date ? doc.generated_at.toISOString() : new Date(doc.generated_at).toISOString()) : '';
  base.created_at             = doc.created_at   ? (doc.created_at instanceof Date ? doc.created_at.toISOString() : new Date(doc.created_at).toISOString()) : '';
  base.id                     = String(doc._id   || '');
  base.volunteer_status       = doc.volunteer_status    || '';
  base.booth_agent_status     = doc.booth_agent_status  || '';
  base.MOBILE_NO              = doc.MOBILE_NO || '';
  base.local_body_interest    = doc.local_body_interest || null;
  return base;
}

/** Batch-presign photo_url fields in an array of objects */
async function presignPhotoUrls(items) {
  await Promise.all(items.map(async (item) => {
    if (item && item.photo_url) {
      item.photo_url = await getPhotoPresignedUrl(item.photo_url);
    }
  }));
  return items;
}

function serialiseDoc(doc) {
  if (!doc) return null;
  const out = { ...doc };
  out._id = String(out._id || '');
  if (out.requested_at) out.requested_at = out.requested_at instanceof Date ? out.requested_at.toISOString() : new Date(out.requested_at).toISOString();
  if (out.reviewed_at)  out.reviewed_at  = out.reviewed_at instanceof Date ? out.reviewed_at.toISOString() : new Date(out.reviewed_at).toISOString();
  // Never send sensitive fields to the admin client
  delete out.secret_pin;
  delete out.otp;
  delete out.otp_hash;
  return out;
}

/** Parse common list query params + build filter skeleton. */
function buildListParams(req) {
  const search  = sanitizeSearch(req.query.search  || '');
  const status  = String(req.query.status  || '').trim();
  const page    = Math.max(1, parseInt(req.query.page,     10) || 1);
  const perPage = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 5), 100);
  const filt    = {};
  if (search) {
    // Escape regex special chars to prevent ReDoS
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filt.$or = [
      { name:     { $regex: escaped, $options: 'i' } },
      { wtl_code: { $regex: escaped, $options: 'i' } },
      { epic_no:  { $regex: escaped, $options: 'i' } },
      { mobile:   { $regex: escaped, $options: 'i' } },
    ];
  }
  return { search, status, page, perPage, filt };
}

async function paginatedList(db, collection, filt, sort, page, perPage) {
  const total      = await db.collection(collection).countDocuments(filt);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const saferPage  = Math.min(page, totalPages);

  const docs = await db.collection(collection)
    .find(filt).sort(sort)
    .skip((saferPage - 1) * perPage).limit(perPage)
    .toArray();

  const items = docs.map(serialiseDoc);
  return { items, total, totalPages };
}

/** Get distinct values with short cache. */
const _distinctCache = new Map();
async function getDistinctCached(db, collection, field) {
  const key = `${collection}:${field}`;
  const hit = _distinctCache.get(key);
  if (hit && Date.now() - hit.ts < 300000) return hit.values;
  const values = (await db.collection(collection).distinct(field)).filter(Boolean).sort();
  _distinctCache.set(key, { values, ts: Date.now() });
  return values;
}

/**
 * getAssemblyListCached — derives assembly numbers from collection
 * names in DB1 (ass_1 … ass_234) and returns them sorted numerically.
 * Cached for 1 hour since collections never change.
 */
let _assemblyListCache = null;
let _assemblyListTime  = 0;
async function getAssemblyListCached(voterDb) {
  if (_assemblyListCache && Date.now() - _assemblyListTime < 3600000) return _assemblyListCache;
  try {
    const cols = await voterDb.listCollections({ name: /^ass_\d+$/ }).toArray();
    const nums = cols.map(c => c.name.replace('ass_', '')).sort((a, b) => Number(a) - Number(b));
    _assemblyListCache = nums;
    _assemblyListTime  = Date.now();
    return nums;
  } catch {
    return [];
  }
}

//  GET /admin/api/reports
// ────────────────────────────────────────────────────────────────
router.get('/api/reports', async (req, res) => {
  try {
    const db = getDb();
    const type = req.query.type || 'district';
    const districtFilter = req.query.district || '';
    const assemblyFilter = req.query.assembly || '';
    const boothFilter = req.query.booth || '';
    const startDate = req.query.startDate || '';
    const endDate = req.query.endDate || '';
    const format = req.query.format || 'json';

    let data = [];
    let headers = [];

    // Common Date Range matching helper
    const buildDateMatch = () => {
      const matchObj = {};
      if (startDate || endDate) {
        matchObj.generated_at = {};
        if (startDate) {
          matchObj.generated_at.$gte = new Date(startDate);
        }
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          matchObj.generated_at.$lte = end;
        }
      }
      return matchObj;
    };

    if (type === 'district') {
      const match = buildDateMatch();
      if (districtFilter) {
        match.DISTRICT_NAME = new RegExp(`^${districtFilter.trim()}$`, 'i');
        const docs = await db.collection('generated_voters')
          .find(match)
          .sort({ generated_at: -1 })
          .toArray();
        headers = ['Name', 'Member Code', 'Mobile', 'District', 'Assembly', 'Booth Number', 'Registered At'];
        data = docs.map(d => ({
          'Name': d.VOTER_NAME || `${d.FM_NAME_EN || ''} ${d.LASTNAME_EN || ''}`.trim() || 'Unknown',
          'Member Code': d.wtl_code || '',
          'Mobile': d.MOBILE_NO || '',
          'District': d.DISTRICT_NAME || '',
          'Assembly': d.ASSEMBLY_NAME || '',
          'Booth Number': d.PART_NO || '',
          'Registered At': d.generated_at ? new Date(d.generated_at).toLocaleString() : ''
        }));
      } else {
        const agg = [
          ...(Object.keys(match).length ? [{ $match: match }] : []),
          { $group: { _id: "$DISTRICT_NAME", count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ];
        const results = await db.collection('generated_voters').aggregate(agg).toArray();
        headers = ['District', 'Total Members'];
        data = results.map(r => ({
          'District': r._id || 'Unknown',
          'Total Members': r.count
        }));
      }
    } else if (type === 'assembly') {
      const match = buildDateMatch();
      if (districtFilter) {
        match.DISTRICT_NAME = new RegExp(`^${districtFilter.trim()}$`, 'i');
      }
      if (assemblyFilter) {
        match.ASSEMBLY_NAME = new RegExp(`^${assemblyFilter.trim()}$`, 'i');
        const docs = await db.collection('generated_voters')
          .find(match)
          .sort({ generated_at: -1 })
          .toArray();
        headers = ['Name', 'Member Code', 'Mobile', 'District', 'Assembly', 'Booth Number', 'Registered At'];
        data = docs.map(d => ({
          'Name': d.VOTER_NAME || `${d.FM_NAME_EN || ''} ${d.LASTNAME_EN || ''}`.trim() || 'Unknown',
          'Member Code': d.wtl_code || '',
          'Mobile': d.MOBILE_NO || '',
          'District': d.DISTRICT_NAME || '',
          'Assembly': d.ASSEMBLY_NAME || '',
          'Booth Number': d.PART_NO || '',
          'Registered At': d.generated_at ? new Date(d.generated_at).toLocaleString() : ''
        }));
      } else {
        const agg = [
          ...(Object.keys(match).length ? [{ $match: match }] : []),
          { $group: { _id: { assembly: "$ASSEMBLY_NAME", district: "$DISTRICT_NAME" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ];
        const results = await db.collection('generated_voters').aggregate(agg).toArray();
        headers = ['District', 'Assembly', 'Total Members'];
        data = results.map(r => ({
          'District': r._id.district || 'Unknown',
          'Assembly': r._id.assembly || 'Unknown',
          'Total Members': r.count
        }));
      }
    } else if (type === 'booth') {
      const match = buildDateMatch();
      if (districtFilter) {
        match.DISTRICT_NAME = new RegExp(`^${districtFilter.trim()}$`, 'i');
      }
      if (assemblyFilter) {
        match.ASSEMBLY_NAME = new RegExp(`^${assemblyFilter.trim()}$`, 'i');
      }
      if (boothFilter && boothFilter !== 'all') {
        match.PART_NO = { $in: [boothFilter, Number(boothFilter)] };
        const docs = await db.collection('generated_voters')
          .find(match)
          .sort({ generated_at: -1 })
          .toArray();
        headers = ['Name', 'Member Code', 'Mobile', 'District', 'Assembly', 'Booth Number', 'Registered At'];
        data = docs.map(d => ({
          'Name': d.VOTER_NAME || `${d.FM_NAME_EN || ''} ${d.LASTNAME_EN || ''}`.trim() || 'Unknown',
          'Member Code': d.wtl_code || '',
          'Mobile': d.MOBILE_NO || '',
          'District': d.DISTRICT_NAME || '',
          'Assembly': d.ASSEMBLY_NAME || '',
          'Booth Number': d.PART_NO || '',
          'Registered At': d.generated_at ? new Date(d.generated_at).toLocaleString() : ''
        }));
      } else {
        const agg = [
          ...(Object.keys(match).length ? [{ $match: match }] : []),
          { $group: { _id: { booth: "$PART_NO", assembly: "$ASSEMBLY_NAME", district: "$DISTRICT_NAME" }, count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ];
        const results = await db.collection('generated_voters').aggregate(agg).toArray();
        headers = ['District', 'Assembly', 'Booth Number', 'Total Members'];
        data = results.map(r => ({
          'District': r._id.district || 'Unknown',
          'Assembly': r._id.assembly || 'Unknown',
          'Booth Number': r._id.booth || 'Unknown',
          'Total Members': r.count
        }));
      }
    } else if (type === 'date') {
      const match = buildDateMatch();
      if (districtFilter) {
        match.DISTRICT_NAME = new RegExp(`^${districtFilter.trim()}$`, 'i');
      }
      if (assemblyFilter) {
        match.ASSEMBLY_NAME = new RegExp(`^${assemblyFilter.trim()}$`, 'i');
      }
      if (boothFilter && boothFilter !== 'all') {
        match.PART_NO = { $in: [boothFilter, Number(boothFilter)] };
      }
      if (startDate || endDate || districtFilter || assemblyFilter || (boothFilter && boothFilter !== 'all')) {
        const docs = await db.collection('generated_voters')
          .find(match)
          .sort({ generated_at: -1 })
          .toArray();
        headers = ['Name', 'Member Code', 'Mobile', 'District', 'Assembly', 'Booth Number', 'Registered At'];
        data = docs.map(d => ({
          'Name': d.VOTER_NAME || `${d.FM_NAME_EN || ''} ${d.LASTNAME_EN || ''}`.trim() || 'Unknown',
          'Member Code': d.wtl_code || '',
          'Mobile': d.MOBILE_NO || '',
          'District': d.DISTRICT_NAME || '',
          'Assembly': d.ASSEMBLY_NAME || '',
          'Booth Number': d.PART_NO || '',
          'Registered At': d.generated_at ? new Date(d.generated_at).toLocaleString() : ''
        }));
      } else {
        const agg = [
          ...(Object.keys(match).length ? [{ $match: match }] : []),
          {
            $project: {
              dateStr: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: { $ifNull: ["$generated_at", new Date()] }
                }
              }
            }
          },
          { $group: { _id: "$dateStr", count: { $sum: 1 } } },
          { $sort: { _id: -1 } }
        ];
        const results = await db.collection('generated_voters').aggregate(agg).toArray();
        headers = ['Date', 'Total Members Registered'];
        data = results.map(r => ({
          'Date': r._id,
          'Total Members Registered': r.count
        }));
      }
    } else if (type === 'performers' || type === 'referrals') {
      const match = { referred_members_count: { $gt: 0 }, ...buildDateMatch() };
      if (districtFilter) {
        match.DISTRICT_NAME = new RegExp(`^${districtFilter.trim()}$`, 'i');
      }
      if (assemblyFilter) {
        match.ASSEMBLY_NAME = new RegExp(`^${assemblyFilter.trim()}$`, 'i');
      }
      if (boothFilter && boothFilter !== 'all') {
        match.PART_NO = { $in: [boothFilter, Number(boothFilter)] };
      }
      const docs = await db.collection('generated_voters')
        .find(match)
        .sort({ referred_members_count: -1 })
        .toArray();
      headers = ['Name', 'Member Code', 'Mobile', 'Referred Count', 'District', 'Assembly', 'Booth Number'];
      data = docs.map(d => ({
        'Name': d.VOTER_NAME || `${d.FM_NAME_EN || ''} ${d.LASTNAME_EN || ''}`.trim() || 'Unknown',
        'Member Code': d.wtl_code || '',
        'Mobile': d.MOBILE_NO || '',
        'Referred Count': d.referred_members_count || 0,
        'District': d.DISTRICT_NAME || '',
        'Assembly': d.ASSEMBLY_NAME || '',
        'Booth Number': d.PART_NO || ''
      }));
    }

    if (format === 'excel' || format === 'csv') {
      const csvHeader = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');
      const csvRows = data.map(row => 
        headers.map(h => {
          const val = String(row[h] !== undefined && row[h] !== null ? row[h] : '');
          return `"${val.replace(/"/g, '""')}"`;
        }).join(',')
      );
      const csvContent = '\uFEFF' + [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=report_${type}_${Date.now()}.csv`);
      return res.send(csvContent);
    }

    return res.json({ success: true, headers, data });
  } catch (err) {
    console.error('Reports error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/local-body
// ────────────────────────────────────────────────────────────────
router.get('/api/local-body', async (req, res) => {
  try {
    const db = getDb();
    const search  = sanitizeSearch(req.query.search  || '');
    const interest = String(req.query.interest  || 'all').trim();
    const page    = Math.max(1, parseInt(req.query.page,     10) || 1);
    const perPage = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 5), 100);

    const query = {};

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { VOTER_NAME: { $regex: escaped, $options: 'i' } },
        { FM_NAME_EN: { $regex: escaped, $options: 'i' } },
        { LASTNAME_EN: { $regex: escaped, $options: 'i' } },
        { wtl_code:    { $regex: escaped, $options: 'i' } },
        { EPIC_NO:     { $regex: escaped, $options: 'i' } },
        { MOBILE_NO:   { $regex: escaped, $options: 'i' } },
      ];
    }

    if (interest === 'interested') {
      query.local_body_interest = 'interested';
    } else if (interest === 'not_interested') {
      query.local_body_interest = 'not_interested';
    } else if (interest === 'not_answered') {
      query.local_body_interest = { $in: [null, undefined] };
    }

    const total = await db.collection('generated_voters').countDocuments(query);
    const voters = await db.collection('generated_voters')
      .find(query)
      .sort({ generated_at: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .toArray();

    const formatted = voters.map(v => ({
      name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim() || 'Unknown',
      epic_no: v.EPIC_NO || '',
      mobile: v.MOBILE_NO || '',
      assembly: v.ASSEMBLY_NAME || '',
      wtl_code: v.wtl_code || '',
      photo_url: v.photo_url || '',
      generated_at: v.generated_at,
      local_body_interest: v.local_body_interest || 'not_answered'
    }));

    await presignPhotoUrls(formatted);
    return res.json({ success: true, total, data: formatted });
  } catch (err) {
    console.error('Local-body api error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ────────────────────────────────────────────────────────────────
//  GET /admin/api/meet-requests
// ────────────────────────────────────────────────────────────────
router.get('/api/meet-requests', async (req, res) => {
  try {
    const db = getDb();
    const search  = sanitizeSearch(req.query.search  || '');
    const page    = Math.max(1, parseInt(req.query.page,     10) || 1);
    const perPage = Math.min(Math.max(parseInt(req.query.per_page, 10) || 20, 5), 100);

    const query = { interest: 'interested' };

    let searchCodes = null;
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchQ = {
        $or: [
          { VOTER_NAME: { $regex: escaped, $options: 'i' } },
          { FM_NAME_EN: { $regex: escaped, $options: 'i' } },
          { LASTNAME_EN: { $regex: escaped, $options: 'i' } },
          { wtl_code:    { $regex: escaped, $options: 'i' } },
          { EPIC_NO:     { $regex: escaped, $options: 'i' } },
          { MOBILE_NO:   { $regex: escaped, $options: 'i' } },
        ]
      };
      const matchingVoters = await db.collection('generated_voters').find(searchQ, { projection: { wtl_code: 1 } }).toArray();
      searchCodes = matchingVoters.map(mv => mv.wtl_code).filter(Boolean);
      query.wtl_code = { $in: searchCodes };
    }

    const total = await db.collection('appointments').countDocuments(query);
    const appointments = await db.collection('appointments')
      .find(query)
      .sort({ created_at: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .toArray();

    const wtlCodes = appointments.map(a => a.wtl_code).filter(Boolean);
    const voters = await db.collection('generated_voters')
      .find({ wtl_code: { $in: wtlCodes } })
      .toArray();

    const voterMap = new Map(voters.map(v => [
      v.wtl_code,
      v
    ]));

    const formatted = appointments.map(a => {
      const v = voterMap.get(a.wtl_code) || {};
      return {
        wtl_code: a.wtl_code,
        created_at: a.created_at,
        interest: a.interest || 'interested',
        name: v.VOTER_NAME || `${v.FM_NAME_EN || ''} ${v.LASTNAME_EN || ''}`.trim() || 'Unknown',
        epic_no: v.EPIC_NO || '',
        mobile: v.MOBILE_NO || '',
        assembly: v.ASSEMBLY_NAME || '',
        photo_url: v.photo_url || '',
        referred_count: v.referred_members_count || 0
      };
    });

    await presignPhotoUrls(formatted);
    return res.json({ success: true, total, data: formatted });
  } catch (err) {
    console.error('Meet requests api error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
