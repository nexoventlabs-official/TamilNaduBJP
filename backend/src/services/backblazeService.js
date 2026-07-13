/**
 * Backblaze B2 S3 API Integration Service
 * Drop-in replacement for cloudinaryService.js.
 */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const sharp = require('sharp');
const Sentry = require('@sentry/node');
const config = require('../config');

// Initialize S3 client for Backblaze B2
const s3 = new S3Client({
  endpoint: `https://${config.b2.endpoint}`,
  region: config.b2.region || 'us-east-005',
  credentials: {
    accessKeyId: config.b2.keyId,
    secretAccessKey: config.b2.appKey
  },
  forcePathStyle: true
});

const BUCKET_NAME = config.b2.bucketName || 'bjpmembers';

/**
 * Compress a photo buffer to a web-optimised JPEG.
 * Resizes to max 500px wide (preserving aspect ratio), 85% quality.
 */
async function compressPhoto(buffer) {
  try {
    return await sharp(buffer)
      .resize({ width: 500, withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer();
  } catch (e) {
    console.warn('Photo compression failed, using original buffer:', e.message);
    return buffer;
  }
}

/**
 * Upload a passport photo buffer to Backblaze.
 * Returns the relative file key (e.g. 'member_photos/EPIC_MOBILE.jpg').
 */
async function uploadPhoto(buffer, epicNo, mobile) {
  const suffix = mobile ? `_${mobile}` : '';
  const key = `member_photos/${epicNo.toUpperCase()}${suffix}.jpg`.replace(/[/\\]/g, '_');

  try {
    // Compress before upload for faster serving
    const compressed = await compressPhoto(buffer);

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: compressed,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable'
    }));

    // Store the relative path key in the database
    return key;
  } catch (error) {
    console.error('[B2] Photo upload failed:', error.message);
    Sentry.captureException(error, {
      tags: { operation: 'file_upload', storage: 'backblaze_b2', file_type: 'photo' },
      extra: {
        epicNo,
        mobile,
        fileSizeKB:   Math.round((buffer?.length || 0) / 1024),
        bucketName:   BUCKET_NAME,
        errorMessage: error.message,
        errorCode:    error.code || error.$metadata?.httpStatusCode,
      },
    });
    throw error;
  }
}

/**
 * Generate a secure pre-signed GET URL for a photo key.
 * Valid for 7 days (604,800 seconds).
 */
async function getPhotoPresignedUrl(photoUrlOrKey) {
  if (!photoUrlOrKey) return '';

  // If it's already a full HTTP URL from another domain, return as-is
  if (photoUrlOrKey.startsWith('http') && !photoUrlOrKey.includes('backblazeb2.com')) {
    return photoUrlOrKey;
  }

  // Extract the flat filename key to use the permanent backend proxy URL
  try {
    let fileName = photoUrlOrKey;
    if (photoUrlOrKey.startsWith('http')) {
      const url = new URL(photoUrlOrKey);
      fileName = url.pathname.split('/').pop();
    } else {
      fileName = photoUrlOrKey.split('/').pop().split('\\').pop();
    }
    if (fileName) {
      return `${config.baseUrl}/api/verify/photo/file/${fileName}`;
    }
  } catch (err) {
    console.warn('Error parsing key for proxy file URL:', err.message);
  }

  // Fallback to S3 presigned URL
  let key = photoUrlOrKey;
  if (photoUrlOrKey.startsWith('http')) {
    try {
      const url = new URL(photoUrlOrKey);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'file') pathParts.shift();
      if (pathParts[0] === BUCKET_NAME) pathParts.shift();
      key = pathParts.join('/');
    } catch (_) {
      return photoUrlOrKey;
    }
  }

  key = key.replace(/^\/+/, '');

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 604800 });
    return url;
  } catch (err) {
    console.error(`Error generating pre-signed URL for key ${key}:`, err.message);
    return `https://f005.backblazeb2.com/file/${BUCKET_NAME}/${key}`;
  }
}

/**
 * Fetch a photo from Backblaze B2 as a readable stream.
 */
async function getPhotoStream(photoUrlOrKey) {
  if (!photoUrlOrKey) throw new Error('Photo key is empty');

  let key = photoUrlOrKey;
  if (photoUrlOrKey.startsWith('http')) {
    try {
      const url = new URL(photoUrlOrKey);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts[0] === 'file') pathParts.shift();
      if (pathParts[0] === BUCKET_NAME) pathParts.shift();
      key = pathParts.join('/');
    } catch (_) {
      // ignore
    }
  }
  key = key.replace(/^\/+/, '');

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  const response = await s3.send(command);
  return response.Body;
}

// ── Drop-in Stubs for card generation (cards generated entirely client-side for Web) ─
async function uploadCard(buffer, epicNo, mobile) { return ''; }
async function uploadBackCard(buffer, epicNo, mobile) { return ''; }
async function uploadCombinedCard(buffer, epicNo, mobile) { return ''; }

module.exports = {
  uploadPhoto,
  getPhotoPresignedUrl,
  getPhotoStream,
  uploadCard,
  uploadBackCard,
  uploadCombinedCard
};
