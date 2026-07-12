/**
 * Cloudinary upload service — mirrors Python's upload_photo_to_cloudinary
 * and upload_card_to_cloudinary.
 */
const cloudinary = require('cloudinary').v2;
const config = require('../config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key:    config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure:     true,
});

/**
 * Upload a Buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {string} publicId - filename (no folder prefix)
 * @param {string} folder   - Cloudinary folder
 * @param {object} options  - extra upload options
 * @returns {Promise<string>} secure_url
 */
function uploadBuffer(buffer, publicId, folder, options = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id:     publicId,
        folder:        folder,
        overwrite:     true,
        invalidate:    true,
        resource_type: 'image',
        ...options
      },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

/** Upload member passport photo. */
async function uploadPhoto(buffer, epicNo, mobile) {
  if (process.env.DISABLE_CLOUDINARY === 'true') {
    return `https://res.cloudinary.com/fake/image/upload/v1234567/member_photos/${epicNo}_photo.jpg`;
  }
  const suffix = mobile ? `_${mobile}` : '';
  const id = `${epicNo.toUpperCase()}${suffix}`.replace(/[/\\]/g, '_');
  
  // Compress and resize image in the Cloudinary cloud on upload:
  // - limit dimensions to max 500x600
  // - auto-convert to web-friendly JPG format
  // - auto-compress quality to keep file size tiny (~30 KB to 50 KB)
  const uploadOptions = {
    transformation: [
      { width: 500, height: 600, crop: 'limit' },
      { quality: 'auto' },
      { fetch_format: 'jpg' }
    ]
  };
  return uploadBuffer(buffer, id, config.cloudinary.photoFolder, uploadOptions);
}

/** Upload generated front card. */
async function uploadCard(buffer, epicNo, mobile) {
  if (process.env.DISABLE_CLOUDINARY === 'true') {
    return `https://res.cloudinary.com/fake/image/upload/v1234567/generated_cards/${epicNo}_card.jpg`;
  }
  const suffix = mobile ? `_${mobile}` : '';
  const id = `${epicNo.toUpperCase()}${suffix}`.replace(/[/\\]/g, '_');
  return uploadBuffer(buffer, id, config.cloudinary.cardsFolder);
}

/** Upload generated back card (public_id = {epicNo}_{mobile}_back). */
async function uploadBackCard(buffer, epicNo, mobile) {
  if (process.env.DISABLE_CLOUDINARY === 'true') {
    return `https://res.cloudinary.com/fake/image/upload/v1234567/generated_cards/${epicNo}_back.jpg`;
  }
  const suffix = mobile ? `_${mobile}` : '';
  const id = `${epicNo.toUpperCase()}${suffix}_back`.replace(/[/\\]/g, '_');
  return uploadBuffer(buffer, id, config.cloudinary.cardsFolder);
}

/** Upload combined front+back card (public_id = {epicNo}_{mobile}_combined). */
async function uploadCombinedCard(buffer, epicNo, mobile) {
  if (process.env.DISABLE_CLOUDINARY === 'true') {
    return `https://res.cloudinary.com/fake/image/upload/v1234567/generated_cards/${epicNo}_combined.jpg`;
  }
  const suffix = mobile ? `_${mobile}` : '';
  const id = `${epicNo.toUpperCase()}${suffix}_combined`.replace(/[/\\]/g, '_');
  return uploadBuffer(buffer, id, config.cloudinary.cardsFolder);
}

/**
 * Fetch Cloudinary usage stats (for admin external-stats).
 */
async function getUsageStats() {
  try {
    const usage = await cloudinary.api.usage();
    return String(Math.round((usage.credits?.usage || 0) * 100) / 100);
  } catch {
    return 'N/A';
  }
}

module.exports = { uploadPhoto, uploadCard, uploadBackCard, uploadCombinedCard, getUsageStats };
