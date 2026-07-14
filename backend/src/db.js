/**
 * Dual-database setup
 * ─────────────────────────────────────────────────────────────────
 * DB1 — voter_db (DigitalOcean)   READ-ONLY  — 5.8 cr voter roll
 * DB2 — bjptamilnadu (Atlas)      READ/WRITE — generated cards,
 *        generation_stats, otp_sessions, volunteer/booth requests
 *
 * IMPORTANT: Never write to DB1. All writes must go to DB2.
 * Use getVoterDb() for EPIC lookups and getDb() for everything else.
 */

const mongoose = require('mongoose');
const config   = require('./config');
const redis    = require('./redis');

// ── Two separate Mongoose connections ────────────────────────────
const appConn   = mongoose.createConnection(); // DB2 — app data (Atlas)
const voterConn = mongoose.createConnection(); // DB1 — voter roll (DigitalOcean, read-only)

let appConnected   = false;
let voterConnected = false;

// ── Connect both DBs ─────────────────────────────────────────────
const connectDB = async () => {
  // ── DB2: App data (Atlas) — primary read/write connection ──────
  try {
    await appConn.openUri(config.mongoUri, {
      dbName:                   config.mongoDb,
      tls:                      config.mongoUri.startsWith('mongodb+srv://'),
      tlsAllowInvalidCertificates: false,
      maxPoolSize:              50,
      minPoolSize:              5,
      serverSelectionTimeoutMS: 10000,
    });
    appConnected = true;
    console.log(`[DB2] App DB connected (db: ${config.mongoDb})`);
    setTimeout(() => ensureAppIndexes(), 1000);
  } catch (err) {
    console.error('[DB2] App DB connection error:', err.message);
    process.exit(1);
  }

  // ── DB1: Voter roll — read-only ─────────────────
  let voterUri = config.mongoVoterUrl;
  const isLocalVoter = !config.mongoVoterUrl || process.env.USE_LOCAL_VOTER_DB === 'true';
  if (isLocalVoter) {
    voterUri = 'mongodb://127.0.0.1:27017/voter_db';
  }

  if (!voterUri) {
    console.warn('[DB1] Voter database URI not set — voter EPIC lookups will fail.');
    return;
  }
  try {
    await voterConn.openUri(voterUri, {
      dbName:                   config.mongoVoterDbName,
      maxPoolSize:              10,
      minPoolSize:              2,
      serverSelectionTimeoutMS: 15000,
    });
    voterConnected = true;
    console.log(`[DB1] Voter DB connected (db: ${config.mongoVoterDbName}) — READ-ONLY [${isLocalVoter ? 'LOCAL' : 'REMOTE'}]`);
  } catch (err) {
    // Non-fatal: app still works, just EPIC validation will be unavailable
    console.error('[DB1] Voter DB connection error:', err.message);
  }
};

// ── Indexes for DB2 only (never touch DB1) ───────────────────────
async function ensureAppIndexes() {
  try {
    const db = appConn.db;

    // Drop old conflicting indexes if they exist
    await db.collection('generated_voters').dropIndex('EPIC_NO_1').catch(() => {});
    await db.collection('generated_voters').dropIndex('MOBILE_NO_1').catch(() => {});
    await db.collection('generation_stats').dropIndex('epic_no_1').catch(() => {});
    await db.collection('generation_stats').dropIndex('auth_mobile_1').catch(() => {});

    // Recreate indexes with new uniqueness constraints
    await db.collection('generated_voters').createIndex({ MOBILE_NO: 1 },      { unique: true, background: true });
    await db.collection('generated_voters').createIndex({ EPIC_NO: 1 },        { background: true });
    await db.collection('generated_voters').createIndex({ bjp_code: 1 },        { unique: true, sparse: true, background: true });
    await db.collection('generated_voters').createIndex({ ptc_code: 1 },        { unique: true, sparse: true, background: true });
    await db.collection('generated_voters').createIndex({ referred_by_bjp: 1 }, { background: true });
    await db.collection('generated_voters').createIndex({ referred_by_ptc: 1 }, { background: true });

    await db.collection('generation_stats').createIndex({ auth_mobile: 1 }, { unique: true, background: true });
    await db.collection('generation_stats').createIndex({ epic_no: 1 },     { background: true });

    await db.collection('otp_sessions').createIndex({ mobile: 1 },     { unique: true, background: true });
    await db.collection('otp_sessions').createIndex({ created_at: 1 }, { expireAfterSeconds: 600, background: true });

    // Unique indexes prevent TOCTOU races on volunteer/booth requests
    await db.collection('volunteer_requests').createIndex(   { bjp_code: 1 }, { unique: true, sparse: true, background: true });
    await db.collection('volunteer_requests').createIndex(   { ptc_code: 1 }, { unique: true, sparse: true, background: true });
    await db.collection('booth_agent_requests').createIndex( { bjp_code: 1 }, { unique: true, sparse: true, background: true });
    await db.collection('booth_agent_requests').createIndex( { ptc_code: 1 }, { unique: true, sparse: true, background: true });

    // Deduplication for processed WhatsApp message IDs (TTL 24 h)
    await db.collection('processed_wamids').createIndex({ wamid: 1 },  { unique: true, background: true });
    await db.collection('processed_wamids').createIndex({ ts: 1 },     { expireAfterSeconds: 86400, background: true });

    // Generation locks for card generation race-condition guard (TTL 5 min)
    await db.collection('generation_locks').dropIndex('epic_no_1').catch(() => {});
    await db.collection('generation_locks').createIndex({ mobile: 1 },       { unique: true, background: true });
    await db.collection('generation_locks').createIndex({ locked_until: 1 }, { expireAfterSeconds: 300, background: true });

    console.log('[DB2] MongoDB indexes ensured.');
  } catch (err) {
    console.warn('[DB2] Index setup warning:', err.message);
  }
}

/**
 * getDb() — returns DB2 (Atlas, app data). Use for ALL writes and
 * for reading generated_voters, generation_stats, otp_sessions,
 * volunteer_requests, booth_agent_requests.
 */
const getDb = () => {
  if (!appConnected) throw new Error('[DB2] App database not connected');
  return appConn.db;
};

/**
 * getVoterDb() — returns DB1 (DigitalOcean, voter roll). Use ONLY
 * for reading voter collections (EPIC validation). Never write.
 *
 * Data is sharded across assembly collections: ass_1 … ass_234
 */
const getVoterDb = () => {
  if (!voterConnected) throw new Error('[DB1] Voter database not connected');
  return voterConn.db;
};

/**
 * getVoterTotalCount() — sum estimatedDocumentCount across all
 * ass_* collections in DB1. Cached for 10 minutes.
 */
let _voterCountCache = null;
let _voterCountTime  = 0;
const VOTER_COUNT_TTL = 10 * 60 * 1000;

const getVoterTotalCount = async () => {
  return 56496752; // Static total document count across 233 collections in read-only voter rolls DB1
};

/**
 * findVoterByEpic(epicNo) — fast parallel search across all 234 assembly collections
 * 
 * Strategy:
 *   - Query all ass_1 through ass_234 collections in parallel
 *   - Return on FIRST MATCH (don't wait for all to complete)
 *   - Timeout: 3.5 seconds (WhatsApp allows up to 5s, safety margin 1.5s)
 *   - Cache: 1 hour TTL (same EPIC looked up again = instant return)
 * 
 * Why all 234? EPICs are spread across regions, no way to predict which collection.
 * Why parallel? If we queried sequentially, timeout would be impossible.
 * Why first-match? ~90% of time EPIC found in first 20-30 queries, no need to wait for rest.
 */
// ── Voter cache ──────────────────────────────────────────────────
// Primary: Redis (shared across instances, bounded, survives restarts).
// Fallback: a *bounded* in-memory Map (max 50k entries) used only when
// Redis is unavailable — prevents the unbounded-growth OOM risk.
const EPIC_CACHE_TTL     = 60 * 60 * 1000; // 1 hour (ms)
const EPIC_CACHE_TTL_SEC = 60 * 60;        // 1 hour (s, for Redis EX)
const EPIC_MEM_MAX       = 50000;          // hard cap on in-memory fallback
const _epicCache = new Map();
const _epicKey = (epicNo) => `epic:${epicNo}`;

// Read from cache: Redis first, then bounded in-memory fallback.
async function _cacheGet(epicNo) {
  if (redis.isReady()) {
    try {
      const raw = await redis.client.get(_epicKey(epicNo));
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.warn(`[Redis] cache get failed for ${epicNo}: ${e.message}`);
    }
  }
  const mem = _epicCache.get(epicNo);
  if (mem && Date.now() - mem.timestamp < EPIC_CACHE_TTL) return mem.data;
  if (mem) _epicCache.delete(epicNo); // expired
  return null;
}

// Write to cache: Redis (with TTL) and the bounded in-memory fallback.
async function _cacheSet(epicNo, data) {
  if (redis.isReady()) {
    try {
      await redis.client.set(_epicKey(epicNo), JSON.stringify(data), 'EX', EPIC_CACHE_TTL_SEC);
    } catch (e) {
      console.warn(`[Redis] cache set failed for ${epicNo}: ${e.message}`);
    }
  }
  // Bounded in-memory fallback — evict oldest entry when at capacity
  if (_epicCache.size >= EPIC_MEM_MAX) {
    const oldestKey = _epicCache.keys().next().value;
    if (oldestKey !== undefined) _epicCache.delete(oldestKey);
  }
  _epicCache.set(epicNo, { data, timestamp: Date.now() });
}

const findVoterByEpic = async (epicNo) => {
  if (!voterConnected) return null;

  // Check cache first — same EPIC = instant response
  const cached = await _cacheGet(epicNo);
  if (cached) {
    console.log(`[DB1] Cache HIT for ${epicNo} ⚡`);
    return cached;
  }

  console.log(`[DB1] Cache MISS for ${epicNo} — querying all 234 collections`);
  const db = voterConn.db;
  
  try {
    // Build list of all collection names (ass_1 through ass_234)
    const allCollections = [];
    for (let i = 1; i <= 234; i++) {
      allCollections.push(`ass_${i}`);
    }

    console.log(`[DB1] Querying ${allCollections.length} collections for ${epicNo} in parallel`);

    // Query all collections in parallel, but return on FIRST MATCH
    // This is much faster than waiting for all 234 to complete
    let result = null;
    let firstMatchResolve;
    const firstMatchPromise = new Promise(resolve => {
      firstMatchResolve = resolve;
    });

    // Launch all queries in parallel
    const queryPromises = allCollections.map(collName =>
      db.collection(collName)
        .findOne({ EPIC_NO: epicNo })
        .then(doc => {
          if (doc && !result) {
            result = doc;
            firstMatchResolve(doc); // Signal first match found
          }
          return doc;
        })
        .catch(() => null) // Swallow collection-not-exist or query errors
    );

    const timeoutMs = 8000; // 8 seconds — WhatsApp allows up to 10s for data_exchange
    
    try {
      // Race: first match OR timeout
      await Promise.race([
        firstMatchPromise, // Resolves when any query returns a match
        Promise.all(queryPromises), // Resolves when all queries complete
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`EPIC lookup timeout after ${timeoutMs}ms`)), timeoutMs)
        )
      ]);
    } catch (err) {
      console.warn(`[DB1] EPIC lookup for ${epicNo}: ${err.message}`);
    }

    // Only cache SUCCESSFUL results — never cache null.
    // Caching null would cause false "not found" errors for up to 1 hour
    // if a lookup fails due to a timeout, race condition, or transient DB error.
    if (result) {
      await _cacheSet(epicNo, result);
      console.log(`[DB1] ✓ Found ${epicNo}: ${result.VOTER_NAME || result.FM_NAME_EN || 'Unknown'} — cached ✅`);
    } else {
      console.log(`[DB1] ✗ EPIC ${epicNo} not found in any collection (not cached — will retry next request)`);
    }
    
    return result;
  } catch (err) {
    console.error(`[DB1] Unexpected error in findVoterByEpic(${epicNo}):`, err.message);
    return null;
  }
};

module.exports = { connectDB, getDb, getVoterDb, getVoterTotalCount, findVoterByEpic, mongoose: appConn };
