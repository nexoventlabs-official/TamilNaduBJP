'use strict';

const { getDb } = require('../db');

/**
 * Write an admin action to the audit log (FIX-09).
 * Never throws — audit failure must not break the main operation.
 */
async function writeAuditLog({
  adminUsername,
  action,
  targetBjpCode = null,
  targetMobile = null,
  previousState = null,
  newState = null,
  ip = null,
  meta = {},
}) {
  try {
    const db = getDb();
    await db.collection('admin_audit_log').insertOne({
      timestamp:     new Date(),
      adminUsername: adminUsername || 'unknown',
      action,
      targetBjpCode,
      targetMobile:  targetMobile ? `****${String(targetMobile).slice(-4)}` : null,
      previousState,
      newState,
      ip,
      meta,
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit entry:', err.message);
  }
}

module.exports = { writeAuditLog };
