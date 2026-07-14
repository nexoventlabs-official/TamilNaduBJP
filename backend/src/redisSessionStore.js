/**
 * Minimal express-session store backed by ioredis.
 * ─────────────────────────────────────────────────────────────────
 * connect-redis v9 only speaks the node-redis API, so it breaks on
 * ioredis (`ERR syntax error` on SET). This store uses ioredis'
 * native command signatures directly.
 */
const session = require('express-session');

class RedisSessionStore extends session.Store {
  constructor({ client, prefix = 'sess:', ttl = 86400 } = {}) {
    super();
    this.client = client;
    this.prefix = prefix;
    this.ttl = ttl;
  }

  _key(sid) {
    return this.prefix + sid;
  }

  _ttl(sess) {
    if (sess && sess.cookie && sess.cookie.expires) {
      const ms = new Date(sess.cookie.expires).getTime() - Date.now();
      return Math.max(1, Math.ceil(ms / 1000));
    }
    return this.ttl;
  }

  get(sid, cb) {
    this.client.get(this._key(sid))
      .then((data) => {
        if (!data) return cb(null, null);
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { return cb(e); }
        cb(null, parsed);
      })
      .catch(cb);
  }

  set(sid, sess, cb) {
    let val;
    try { val = JSON.stringify(sess); } catch (e) { return cb && cb(e); }
    this.client.set(this._key(sid), val, 'EX', this._ttl(sess))
      .then(() => cb && cb(null))
      .catch((e) => cb && cb(e));
  }

  touch(sid, sess, cb) {
    this.client.expire(this._key(sid), this._ttl(sess))
      .then(() => cb && cb(null))
      .catch((e) => cb && cb(e));
  }

  destroy(sid, cb) {
    this.client.del(this._key(sid))
      .then(() => cb && cb(null))
      .catch((e) => cb && cb(e));
  }
}

module.exports = RedisSessionStore;
