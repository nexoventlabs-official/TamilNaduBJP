/**
 * Migration Script: Transfer existing Cloudinary photos to Backblaze B2.
 */
const { MongoClient } = require('mongodb');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const axios = require('axios');
const config = require('./src/config');

// S3 SGP/B2 configurations
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

async function main() {
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(config.mongoUri);
  await client.connect();
  const db = client.db(config.mongoDb);
  console.log('MongoDB connected successfully!');

  // Find all generated voters with a Cloudinary photo url
  const query = {
    photo_url: { $regex: /res\.cloudinary\.com/i }
  };
  const voters = await db.collection('generated_voters').find(query).toArray();
  console.log(`Found ${voters.length} records with Cloudinary photo URLs.`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < voters.length; i++) {
    const voter = voters[i];
    const epic = voter.EPIC_NO || voter.epic_no || 'UNKNOWN';
    const mobile = voter.MOBILE_NO || voter.mobile || '';
    const oldUrl = voter.photo_url;
    
    // Construct new S3 Key
    const suffix = mobile ? `_${mobile}` : '';
    const key = `member_photos/${epic.toUpperCase()}${suffix}.jpg`.replace(/[/\\]/g, '_');

    console.log(`[${i + 1}/${voters.length}] Migrating: EPIC ${epic} (Mobile: ${mobile})`);
    console.log(`  Cloudinary URL: ${oldUrl}`);

    try {
      // 1. Download image from Cloudinary
      const response = await axios.get(oldUrl, { responseType: 'arraybuffer', timeout: 15000 });
      const buffer = Buffer.from(response.data);

      // 2. Upload to Backblaze B2 via S3
      await s3.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: 'image/jpeg'
      }));

      // 3. Update MongoDB generated_voters
      await db.collection('generated_voters').updateOne(
        { _id: voter._id },
        { $set: { photo_url: key } }
      );

      // 4. Update MongoDB generation_stats if it exists for this EPIC
      if (epic !== 'UNKNOWN') {
        await db.collection('generation_stats').updateOne(
          { epic_no: epic },
          { $set: { photo_url: key } }
        );
      }

      console.log(`  ✅ Successfully migrated to B2 Key: ${key}`);
      successCount++;
    } catch (err) {
      console.error(`  ❌ Failed to migrate EPIC ${epic}:`, err.message);
      failCount++;
    }
  }

  console.log('\n--- Migration Finished ---');
  console.log(`Success: ${successCount}`);
  console.log(`Failed:  ${failCount}`);

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
