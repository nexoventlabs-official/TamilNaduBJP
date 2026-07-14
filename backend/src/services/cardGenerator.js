/**
 * Card Generation Engine — BJP Tamil Nadu
 * ==========================================
 * Front card : bjp_card_design.html (1576 × 998 px) — rendered website card template
 * Back card  : black_original1.png (1152 × 768 px) — used as-is (no QR, no T&C)
 * Combined   : front + back side-by-side
 *
 * Uses Puppeteer to render the live HTML card template and screenshot it.
 */

const path   = require('path');
const fs     = require('fs');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer');
const QRCode    = require('qrcode');
const sharp = require('sharp');

// ── Asset paths ─────────────────────────────────────────────────
// Prefer the backend's own copy in backend/public (self-contained),
// then fall back to the frontend source, then the built dist.
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const BACKEND_PUBLIC  = path.join(__dirname, '..', '..', 'public');
const FRONTEND_PUBLIC = path.join(__dirname, '..', '..', '..', 'frontend', 'public');
const DIST_DIR        = path.join(__dirname, '..', '..', '..', 'dist');

function resolveTemplate(fileName) {
  for (const dir of [BACKEND_PUBLIC, FRONTEND_PUBLIC, DIST_DIR]) {
    const p = path.join(dir, fileName);
    if (fs.existsSync(p)) return p;
  }
  // Default to the backend path even if missing, so error messages are clear
  return path.join(BACKEND_PUBLIC, fileName);
}

let FRONT_TEMPLATE_PATH = resolveTemplate('bjp_card_design.html');
let BACK_TEMPLATE_PATH  = resolveTemplate('bjp_back_card.html');

function assetPath(name) {
  return path.join(ASSETS_DIR, name);
}

// ── Browser helper ────────────────────────────────────────────────
let _browser = null;

async function getBrowser() {
  if (_browser && _browser.connected) return _browser;

  let executablePath;
  let launchArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process',
  ];

  // On Linux (Render/production) use @sparticuz/chromium which ships its own binary
  if (process.platform === 'linux') {
    try {
      // @sparticuz/chromium v3+ uses a default export
      const chromium = require('@sparticuz/chromium').default;
      chromium.graphicsMode = false;
      executablePath = await chromium.executablePath(); // returns Promise<string>
      launchArgs = [...chromium.args, '--no-zygote', '--single-process'];
      console.log(`[Card] Using @sparticuz/chromium: ${executablePath}`);
    } catch (e) {
      console.warn('[Card] @sparticuz/chromium not available, trying puppeteer:', e.message);
    }
  }

  // Windows / macOS dev OR Linux fallback: use puppeteer's bundled Chrome
  if (!executablePath) {
    try {
      const { executablePath: ep } = require('puppeteer');
      const p = ep();
      if (p && fs.existsSync(p)) {
        executablePath = p;
        console.log(`[Card] Using puppeteer bundled Chrome: ${executablePath}`);
      }
    } catch (_) {}
  }

  console.log(`[Card] Launching browser${executablePath ? '' : ' (puppeteer default)'}`);

  _browser = await puppeteer.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: launchArgs,
  });

  _browser.on('disconnected', () => {
    console.log('[Card] Browser disconnected — will relaunch on next request');
    _browser = null;
  });
  return _browser;
}

function inferImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 8) return 'image/jpeg';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]))) return 'image/png';
  if (buffer.slice(0, 6).equals(Buffer.from([0x47,0x49,0x46,0x38,0x39,0x61])) || buffer.slice(0, 6).equals(Buffer.from([0x47,0x49,0x46,0x38,0x37,0x61]))) return 'image/gif';
  return 'image/jpeg';
}

// ── Helpers ──────────────────────────────────────────────────────
function clean(v, n = 120) {
  return String(v || '').trim().replace(/[{}$\\]/g, '').slice(0, n);
}

function toTitle(s) {
  return String(s || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ── Concurrency control + timeouts (FIX-07) ───────────────────────
// Cap simultaneous Puppeteer page renders to protect RAM (8 GB, no swap).
// Tune via MAX_CARD_CONCURRENCY. Screenshots and overall generation are
// bounded by timeouts so a hung render can never leak a zombie page.
const MAX_CONCURRENT_GENERATIONS = Math.max(1, parseInt(process.env.MAX_CARD_CONCURRENCY || '4', 10));
const SCREENSHOT_TIMEOUT_MS      = 15000;
const CARD_GENERATION_TIMEOUT_MS = 30000;

let _activeGenerations = 0;
const _waitQueue = [];

function _acquireSlot() {
  return new Promise((resolve) => {
    if (_activeGenerations < MAX_CONCURRENT_GENERATIONS) {
      _activeGenerations++;
      resolve();
    } else {
      _waitQueue.push(resolve);
    }
  });
}

function _releaseSlot() {
  if (_waitQueue.length > 0) {
    const next = _waitQueue.shift();
    next(); // hand the slot directly to the next waiter
  } else {
    _activeGenerations = Math.max(0, _activeGenerations - 1);
  }
}

async function _withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────
//  FRONT CARD  —  bjp_card_design.html rendered as screenshot
// ─────────────────────────────────────────────────────────────────
async function _generateCard(voter, photoBuffer = null) {
  const templatePath = FRONT_TEMPLATE_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Front template not found: ${templatePath}`);
  }

  const epicNo   = clean(voter.epic_no || voter.EPIC_NO || '').toUpperCase();
  const rawName  = clean(voter.name || voter.VOTER_NAME || voter.voter_name || '');
  // Match web template: name shown UPPERCASE, stripped of trailing dashes/spaces
  const name     = rawName.replace(/[\s\-–—]+$/, '').replace(/\s+/g, ' ').trim().toUpperCase() || '-';
  const assembly = (clean(voter.assembly_name || voter.ASSEMBLY_NAME || '').trim().toUpperCase()) || '-';
  const booth    = clean(voter.part_no || voter.PART_NO || voter.booth || voter.booth_no || '') || '-';
  const district = (clean(voter.district || voter.DISTRICT || voter.DISTRICT_NAME || '').trim().toUpperCase()) || '-';
  const bjpCode  = clean(voter.bjp_code || voter.ptc_code || '');
  const memberId = bjpCode || `BJP-${epicNo.slice(-6)}`;

  // Generate QR code pointing to the referral URL for this member
  let qrData = voter.referral_link || '';
  const baseUrl = process.env.BASE_URL || 'https://tnbjp.org';
  if (qrData) {
    qrData = qrData.replace(/https?:\/\/[^\/]+/, baseUrl);
  } else if (bjpCode && voter.referral_id) {
    qrData = `${baseUrl}/refer/${bjpCode}/${voter.referral_id}`;
  } else {
    qrData = `${baseUrl}/verify/${bjpCode || epicNo}`;
  }
  const qrDataUrl = await QRCode.toDataURL(qrData, {
    errorCorrectionLevel: 'H',
    width: 200,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1600, height: 1100, deviceScaleFactor: 2 });

    // Inline leader images as base64 so file:// protocol can resolve them
    const publicDir = path.dirname(templatePath);
    const modiPath    = path.join(publicDir, 'modi_transparent.png');
    const nayanarPath = path.join(publicDir, 'nayanar_transparent.png');
    const sigPath     = path.join(publicDir, 'signature.png');
    let html = fs.readFileSync(templatePath, 'utf8');
    if (fs.existsSync(modiPath)) {
      const b64 = fs.readFileSync(modiPath).toString('base64');
      html = html.replace(/url\('modi_transparent\.png'\)/g, `url('data:image/png;base64,${b64}')`);
    }
    if (fs.existsSync(nayanarPath)) {
      const b64 = fs.readFileSync(nayanarPath).toString('base64');
      html = html.replace(/url\('nayanar_transparent\.png'\)/g, `url('data:image/png;base64,${b64}')`);
    }
    if (fs.existsSync(sigPath)) {
      const b64 = fs.readFileSync(sigPath).toString('base64');
      html = html.replace(/src="signature\.png"/g, `src="data:image/png;base64,${b64}"`);
    }
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const photoDataUrl = photoBuffer
      ? `data:${inferImageMimeType(photoBuffer)};base64,${photoBuffer.toString('base64')}`
      : null;

    await page.evaluate(async ({ photoDataUrl, name, epicNo, assembly, booth, district, memberId, qrDataUrl }) => {
      const setText = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
      };

      setText('v-name', name);
      setText('v-epic', epicNo);
      setText('v-asm', assembly);
      setText('v-booth', booth);
      setText('v-dist', district);
      setText('v-mid', memberId);
      setText('v-mid-big', memberId);

      // Update QR code image
      const qrImg = document.getElementById('qr-img');
      if (qrImg && qrDataUrl) {
        qrImg.src = qrDataUrl;
        await new Promise((resolve) => {
          if (qrImg.complete && qrImg.naturalWidth !== 0) return resolve();
          qrImg.onload  = () => resolve();
          qrImg.onerror = () => resolve();
        });
      }

      const photoImg = document.getElementById('member-photo-img');
      const svg = document.querySelector('#photo-box svg');
      const span = document.querySelector('#photo-box span');

      if (photoImg) {
        if (photoDataUrl) {
          photoImg.src = photoDataUrl;
          photoImg.style.display = 'block';
          if (svg) svg.style.display = 'none';
          if (span) span.style.display = 'none';
          await new Promise((resolve) => {
            if (photoImg.complete && photoImg.naturalWidth !== 0) return resolve();
            photoImg.onload = () => resolve();
            photoImg.onerror = () => resolve();
          });
        } else {
          photoImg.style.display = 'none';
          if (svg) svg.style.display = '';
          if (span) span.style.display = '';
        }
      }

      const wrap = document.querySelector('.card-wrap');
      if (wrap) {
        wrap.style.transform = 'none';
        wrap.style.marginBottom = '0';
      }

      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    }, { photoDataUrl, name, epicNo, assembly, booth, district, memberId, qrDataUrl });

    const cardHandle = await page.$('#card');
    if (!cardHandle) {
      throw new Error('Could not locate #card element in front template');
    }

    const screenshotBuffer = await _withTimeout(
      cardHandle.screenshot({ type: 'png' }),
      SCREENSHOT_TIMEOUT_MS,
      'Front card screenshot',
    );
    return screenshotBuffer;
  } finally {
    await page.close().catch(() => {}); // always close, even on timeout/error
  }
}

// ─────────────────────────────────────────────────────────────────
//  BACK CARD  —  bjp_back_card.html rendered via Puppeteer
// ─────────────────────────────────────────────────────────────────
async function _generateBackCard(voter) {
  if (!fs.existsSync(BACK_TEMPLATE_PATH)) {
    throw new Error(`Back template not found: ${BACK_TEMPLATE_PATH}`);
  }

  // Inline the logo as a data URL so file:// protocol can resolve it
  const logoPath = path.join(path.dirname(BACK_TEMPLATE_PATH), 'bjplogo.webp');
  let logoDataUrl = '';
  if (fs.existsSync(logoPath)) {
    const logoBuffer = fs.readFileSync(logoPath);
    logoDataUrl = `data:image/webp;base64,${logoBuffer.toString('base64')}`;
  }

  let html = fs.readFileSync(BACK_TEMPLATE_PATH, 'utf8');
  if (logoDataUrl) {
    html = html.replace(/src="\/bjplogo\.webp"/g, `src="${logoDataUrl}"`);
  }

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1152, height: 768, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const cardHandle = await page.$('.back-card');
    if (!cardHandle) throw new Error('Could not locate .back-card element in back template');

    return await _withTimeout(
      cardHandle.screenshot({ type: 'png' }),
      SCREENSHOT_TIMEOUT_MS,
      'Back card screenshot',
    );
  } finally {
    await page.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────
//  COMBINED  —  front + back side by side
// ─────────────────────────────────────────────────────────────────
async function generateCombinedCard(frontBuffer, backBuffer) {
  const frontImage = sharp(frontBuffer);
  const backImage = sharp(backBuffer);

  const frontMetadata = await frontImage.metadata();
  const backMetadata  = await backImage.metadata();

  const scaledBackHeight = frontMetadata.height;
  const scaledBackWidth = Math.round((backMetadata.width * scaledBackHeight) / backMetadata.height);

  const resizedBack = await backImage.resize(scaledBackWidth, scaledBackHeight).toBuffer();
  const combinedWidth = frontMetadata.width + 20 + scaledBackWidth;

  return sharp({
    create: {
      width: combinedWidth,
      height: scaledBackHeight,
      channels: 3,
      background: '#111111',
    },
  })
    .composite([
      { input: frontBuffer, left: 0, top: 0 },
      { input: resizedBack, left: frontMetadata.width + 20, top: 0 },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}

// ── Public entry points — semaphore-guarded + timeout-bounded (FIX-07) ─
async function generateCard(voter, photoBuffer = null) {
  await _acquireSlot();
  try {
    return await _withTimeout(
      _generateCard(voter, photoBuffer),
      CARD_GENERATION_TIMEOUT_MS,
      'Card generation',
    );
  } finally {
    _releaseSlot();
  }
}

async function generateBackCard(voter) {
  await _acquireSlot();
  try {
    return await _withTimeout(
      _generateBackCard(voter),
      CARD_GENERATION_TIMEOUT_MS,
      'Back card generation',
    );
  } finally {
    _releaseSlot();
  }
}

module.exports = { generateCard, generateBackCard, generateCombinedCard };
