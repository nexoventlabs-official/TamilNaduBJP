/**
 * SMS OTP service — uses 2factor.in API (same as Python app.py).
 * SECURITY: OTP values are NEVER logged in any environment.
 */
const axios = require('axios');
const config = require('../config');

/**
 * Send OTP via 2factor.in API.
 * @param {string} mobile - 10-digit Indian mobile number
 * @param {string} otp    - 6-digit OTP
 * @returns {{ success: boolean, message: string }}
 */
async function sendOtp(mobile, otp) {
  const apiKey   = config.smsApiKey;
  const template = config.smsTemplateName;

  if (!apiKey) {
    if (config.nodeEnv === 'production') {
      console.error('[SMS] SMS_API_KEY not configured in production');
      return { success: false, message: 'SMS API key not configured.' };
    }
    // Dev mock: succeed so the OTP gets stored and the flow is testable.
    // The OTP is logged to server console — dev only, never in production.
    console.log(`[SMS Mock] OTP for ...${mobile.slice(-4)}: ${otp}`);
    return { success: true, message: 'OTP sent (dev mock)' };
  }

  try {
    // 2factor "send-your-own-OTP" endpoint.
    //  - default template:  /SMS/{mobile}/{otp}
    //  - DLT-approved tmpl:  /SMS/{mobile}/{otp}/{template_name}  (sender id bound to template)
    // The OTP value is substituted into the template's OTP variable.
    const base = `https://2factor.in/API/V1/${apiKey}/SMS/${mobile}/${otp}`;
    const url  = template ? `${base}/${encodeURIComponent(template)}` : base;

    const resp = await axios.get(url, { timeout: 15000 });

    if (resp.status === 200 && resp.data && resp.data.Status === 'Success') {
      // Details holds the 2factor session id — useful for tracing, not secret.
      return { success: true, message: 'OTP sent successfully', sessionId: resp.data.Details };
    }

    // Log status/details only — never log the OTP itself
    console.warn('[SMS] Unexpected response:', resp.data?.Status || resp.status, '-', resp.data?.Details || '');
    return { success: false, message: 'Could not send OTP. Please try again.' };
  } catch (err) {
    // 2factor returns Status:'Error' with a Details message on failure (e.g.
    // invalid template, insufficient balance) — surface it in logs (not OTP).
    const details = err.response?.data?.Details;
    console.error('[SMS] Send error:', details || err.message);
    return { success: false, message: 'Could not send OTP. Please try again.' };
  }
}

module.exports = { sendOtp };
