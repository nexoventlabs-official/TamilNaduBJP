/**
 * Cleanup script using backend's own config + services.
 * Run from: /var/www/bjptn/backend/
 */
const cloudinary = require('cloudinary').v2;
const { MongoClient } = require('mongodb');
const config = require('./src/config');

// Configure Cloudinary from backend config
cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key:    config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure:     true,
});

const MONGO_URI = config.mongoUri;

const MOBILES = [
  '9003178446','9856280052','9886858575','7358559012',
  '9899897576','8903162114','9868686767','9782746809','9566752446'
];

const CLOUDINARY_PUBLIC_IDS = [
  'member_photos/KFD3627734_9003178446',
  'member_photos/KFD3627734_9856280052',
  'member_photos/KFD3627734_9886858575',
  'member_photos/KFD3627734_7358559012',
  'member_photos/KFD3627734_9899897576',
  'member_photos/KFD3627734_8903162114',
  'member_photos/KFD3627734_9868686767',
  'member_photos/KFD3627734_9782746809',
  'member_photos/KFD3627734_9566752446',
];

async function main() {
  // Step 1: Delete from Cloudinary
  console.log('\n🗑️  Deleting photos from Cloudinary...');
  try {
    const result = await cloudinary.api.delete_resources(CLOUDINARY_PUBLIC_IDS, {
      resource_type: 'image',
      invalidate: true,
    });
    const entries = Object.entries(result.deleted || {});
    entries.forEach(([id, status]) => {
      console.log(`  ${status === 'deleted' ? '✓' : '✗'} ${id}: ${status}`);
    });
    const deleted = entries.filter(([,v]) => v === 'deleted').length;
    console.log(`✅ Cloudinary: ${deleted}/${entries.length} photos deleted`);
  } catch (err) {
    console.error('❌ Cloudinary error:', err.message);
  }

  // Step 2: Delete from MongoDB
  console.log('\n🗑️  Deleting members from MongoDB...');
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('bjptamilnadu');

    const voters = await db.collection('generated_voters').deleteMany({ MOBILE_NO: { $in: MOBILES } });
    console.log(`✅ generated_voters:    ${voters.deletedCount} deleted`);

    const stats  = await db.collection('generation_stats').deleteMany({ auth_mobile: { $in: MOBILES } });
    console.log(`✅ generation_stats:    ${stats.deletedCount} deleted`);

    const locks  = await db.collection('generation_locks').deleteMany({ mobile: { $in: MOBILES } });
    console.log(`✅ generation_locks:    ${locks.deletedCount} deleted`);

    const volReqs = await db.collection('volunteer_requests').deleteMany({ mobile: { $in: MOBILES } });
    const baReqs  = await db.collection('booth_agent_requests').deleteMany({ mobile: { $in: MOBILES } });
    if (volReqs.deletedCount) console.log(`✅ volunteer_requests:  ${volReqs.deletedCount} deleted`);
    if (baReqs.deletedCount)  console.log(`✅ booth_agent_requests: ${baReqs.deletedCount} deleted`);

    // Verify
    const remaining = await db.collection('generated_voters').countDocuments({ MOBILE_NO: { $in: MOBILES } });
    console.log(`\n🔍 Verification: ${remaining} remaining in DB (should be 0)`);
  } catch (err) {
    console.error('❌ MongoDB error:', err.message);
  } finally {
    await client.close();
  }

  console.log('\n✅ Cleanup complete!\n');
}

main().catch(console.error);
