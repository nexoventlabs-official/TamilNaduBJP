/**
 * Cleanup batch 2 — 7 extra test registrations on EPIC KFD3627734
 * Keep: 7623498076 (real member)
 * Delete: all others
 */
const cloudinary = require('cloudinary').v2;
const { MongoClient } = require('mongodb');
const config = require('./src/config');

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key:    config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
  secure:     true,
});

const MONGO_URI = config.mongoUri;

const MOBILES_TO_DELETE = [
  '8930393883','8898552255','8906552233',
  '9797987987','9978879779','9003178446','9879676987'
];

const CLOUDINARY_IDS = MOBILES_TO_DELETE.map(m => `member_photos/KFD3627734_${m}`);

async function main() {
  console.log(`\n🗑️  Cleaning up ${MOBILES_TO_DELETE.length} extra test registrations...\n`);

  // Delete from Cloudinary
  console.log('📷 Deleting Cloudinary photos...');
  try {
    const res = await cloudinary.api.delete_resources(CLOUDINARY_IDS, { resource_type: 'image', invalidate: true });
    Object.entries(res.deleted || {}).forEach(([id, status]) =>
      console.log(`  ${status === 'deleted' ? '✓' : '✗'} ${id}: ${status}`)
    );
  } catch (e) { console.error('Cloudinary error:', e.message); }

  // Delete from MongoDB
  console.log('\n🗄️  Deleting from MongoDB...');
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db('bjptamilnadu');
    const r1 = await db.collection('generated_voters').deleteMany({ MOBILE_NO: { $in: MOBILES_TO_DELETE } });
    const r2 = await db.collection('generation_stats').deleteMany({ auth_mobile: { $in: MOBILES_TO_DELETE } });
    const r3 = await db.collection('generation_locks').deleteMany({ mobile: { $in: MOBILES_TO_DELETE } });
    console.log(`  ✓ generated_voters: ${r1.deletedCount}`);
    console.log(`  ✓ generation_stats: ${r2.deletedCount}`);
    console.log(`  ✓ generation_locks: ${r3.deletedCount}`);

    // Verify real member still exists
    const realMember = await db.collection('generated_voters').findOne({ MOBILE_NO: '7623498076' });
    console.log(`\n✅ Real member (7623498076) still in DB: ${!!realMember} | photo: ${realMember?.photo_url ? 'YES' : 'MISSING'}`);
    console.log(`   Name: ${realMember?.VOTER_NAME}, bjp_code: ${realMember?.bjp_code}`);

    // Check total for this EPIC
    const remaining = await db.collection('generated_voters').countDocuments({ EPIC_NO: 'KFD3627734' });
    console.log(`   Total KFD3627734 registrations remaining: ${remaining} (should be 1)`);
  } finally {
    await client.close();
  }
  console.log('\n✅ Done!\n');
}

main().catch(console.error);
