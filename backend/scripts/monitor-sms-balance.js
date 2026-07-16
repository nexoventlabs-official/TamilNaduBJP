/**
 * 2factor SMS Balance Monitor → Sentry
 * ─────────────────────────────────────────────────────────────────
 * Run by cron. Two jobs (same script):
 *   1) Frequent check (e.g. every 30 min): fires Sentry alerts when the
 *      balance is 75/80/85/90/95/100% depleted (each threshold once).
 *   2) Daily 11:00 AM IST: logs the current balance to Sentry (info).
 *      (pass DAILY_REPORT=1)
 *
 * "Depleted %" is measured against a baseline = the balance at the last
 * top-up. When you PURCHASE more credits, the live balance rises above the
 * stored baseline → the monitor detects the top-up, resets the baseline to
 * the new (higher) balance, and clears the fired thresholds. So after a
 * purchase the alerts automatically start fresh from the new balance.
 *
 * State is stored in MongoDB: collection `sms_balance_monitor`, _id 'sms_balance'.
 */
require('dotenv').config();
const Sentry = require('@sentry/node');
const axios = require('axios');
const { MongoClient } = require('mongodb');

const THRESHOLDS = [75, 80, 85, 90, 95, 100]; // % of baseline consumed
const DAILY = process.env.DAILY_REPORT === '1';

async function getSmsBalance() {
  const key = process.env.SMS_API_KEY;
  if (!key) throw new Error('SMS_API_KEY not set');
  const { data } = await axios.get(`https://2factor.in/API/V1/${key}/BAL/SMS`, { timeout: 15000 });
  if (!data || data.Status !== 'Success') {
    throw new Error('2factor balance API error: ' + JSON.stringify(data));
  }
  const bal = parseInt(data.Details, 10);
  if (Number.isNaN(bal)) throw new Error('Unparseable balance: ' + data.Details);
  return bal;
}

(async () => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      release: 'sms-balance-monitor',
      tracesSampleRate: 0,
    });
  }

  const mc = new MongoClient(process.env.MONGO_URI);
  await mc.connect();
  const db = mc.db(process.env.MONGO_DB || 'bjptamilnadu');
  const col = db.collection('sms_balance_monitor');

  const current = await getSmsBalance();

  let state = await col.findOne({ _id: 'sms_balance' });
  if (!state) {
    state = { _id: 'sms_balance', baseline: current, alerted: [] };
    await col.insertOne({ ...state, lastCurrent: current, updatedAt: new Date() });
    Sentry.captureMessage(`2factor SMS balance monitor initialised — baseline ${current} credits`, {
      level: 'info', tags: { monitor: 'sms_balance', event: 'init' },
    });
  }

  let baseline = state.baseline || current;
  let alerted  = Array.isArray(state.alerted) ? state.alerted : [];

  // ── Top-up detection: live balance rose above baseline → credits purchased ──
  if (current > baseline) {
    Sentry.captureMessage(`✅ 2factor SMS credits topped up: ${baseline} → ${current}. Depletion alerts reset.`, {
      level: 'info', tags: { monitor: 'sms_balance', event: 'topup' },
      extra: { previousBaseline: baseline, newBalance: current },
    });
    baseline = current;
    alerted = [];
  }

  const depleted = baseline > 0 ? Math.floor(((baseline - current) / baseline) * 100) : 100;

  // ── Fire alerts for newly-crossed depletion thresholds ──
  const newlyCrossed = THRESHOLDS.filter((t) => depleted >= t && !alerted.includes(t));
  for (const t of newlyCrossed) {
    const level = t >= 100 ? 'error' : t >= 90 ? 'warning' : 'warning';
    const msg = t >= 100
      ? `🚨 2factor SMS balance EXHAUSTED — 0 credits left. OTP delivery WILL FAIL. Top up immediately.`
      : `⚠️ 2factor SMS balance ${t}% consumed — ${current} credits left (of ${baseline} baseline). Please top up.`;
    Sentry.captureMessage(msg, {
      level,
      tags: { monitor: 'sms_balance', threshold: String(t) },
      extra: { current, baseline, depletedPercent: depleted },
    });
    alerted.push(t);
  }

  // ── Daily 11:00 AM IST report ──
  if (DAILY) {
    Sentry.captureMessage(`📊 2factor daily balance — ${current} SMS credits remaining (${depleted}% of ${baseline} baseline consumed)`, {
      level: 'info',
      tags: { monitor: 'sms_balance', report: 'daily' },
      extra: { current, baseline, depletedPercent: depleted },
    });
  }

  await col.updateOne(
    { _id: 'sms_balance' },
    { $set: { baseline, alerted, lastCurrent: current, depletedPercent: depleted, updatedAt: new Date() } },
    { upsert: true },
  );
  await mc.close();

  if (process.env.SENTRY_DSN) await Sentry.flush(8000);
  console.log(`[sms-balance] ${new Date().toISOString()} current=${current} baseline=${baseline} depleted=${depleted}% alerted=[${alerted}] daily=${DAILY}`);
  process.exit(0);
})().catch(async (e) => {
  try {
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(e, { tags: { monitor: 'sms_balance' } });
      await Sentry.flush(5000);
    }
  } catch (_) { /* ignore */ }
  console.error('[sms-balance] ERROR:', e.message);
  process.exit(1);
});
