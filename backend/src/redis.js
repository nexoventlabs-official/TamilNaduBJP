/**
 * Shared Redis client (ioredis)
 * ─────────────────────────────────────────────────────────────────
 * Used for:
 *   - Voter/EPIC cache (replaces the unbounded in-memory Map)
 *   - Rate limiting across instances (rate-limit-redis)
 *   - Session storage (connect-redis)
 *
 * The app degrades gracefully when REDIS_URL is unset or Redis is
 * unreachable: cache falls back to a bounded in-memory Map and
 * sessions fall back to MongoDB.
 */

const Redis  = require('ioredis');
const config = require('./config');

let client = null;
let ready  = false;

if (config.redisUrl) {
  client = new Redis(config.redisUrl, {
    // Fail fast so cache/limiter fall back instead of hanging when Redis is down
    maxRetriesPerRequest: 2,
    enableOfflineQueue:   true,
    connectTimeout:       10000,
    retryStrategy(times) {
      // Exponential-ish backoff, capped at 3s
      return Math.min(times * 300, 3000);
    },
  });

  client.on('ready',        () => { ready = true;  console.log('[Redis] Connected & ready'); });
  client.on('error',        (e) => { ready = false; console.error('[Redis] Error:', e.message); });
  client.on('end',          () => { ready = false; console.warn('[Redis] Connection closed'); });
  client.on('reconnecting', () => { console.warn('[Redis] Reconnecting…'); });
} else {
  console.warn('[Redis] REDIS_URL not set — using in-memory cache + MongoDB sessions (single-instance only)');
}

/** True only when a client exists AND the connection is ready. */
function isReady() {
  return !!client && ready;
}

module.exports = { client, isReady };
