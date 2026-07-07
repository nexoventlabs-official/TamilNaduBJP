/**
 * One-time script: re-generate back card for all existing members
 * and update back_url + combined_url in MongoDB.
 *
 * Run: node scripts/regen-back-cards.js
 * Dry run: node scripts/regen-back-cards.js --dry-run
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');
const { generateBackCard, generateCombinedCard } = require('../src/services/cardGenerator');
const { uploadBackCard, uploadCombinedCard } = require('../src/services/cloudinaryService');
const sharp = require('sharp');

const DRY_RUN = process.argv.includes('--dry-run');

async function fetchFrontBuffer(cardUrl) {
  const res = await fetch(cardUrl);
  if (!res.ok) throw new Error(`Failed to fetch front card: ${res.status}`);
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function run() {
  const client = await MongoClient.connect(process.env.MONGO_URI);
  const db = client.db(process.env.MONGO_DB);

  const col = db.collection('generated_voters');
  const docs = await col.find({ card_url: { $exists: true, $ne: '' } }).toArray();

  console.log(`Found ${docs.length} generated voter records.`);
  if (DRY_RUN) console.log('DRY RUN — no writes will happen.');

  let ok = 0, fail = 0;

  for (const doc of docs) {
    const epic = doc.epic_no || doc.EPIC_NO || '';
    try {
      process.stdout.write(`  [${epic}] generating back card...`);

      const backBuffer = await generateBackCard({});

      let combinedUrl = doc.card_url;
      let backUrl = '';

      if (!DRY_RUN) {
        backUrl = await uploadBackCard(backBuffer, epic);

        // Re-combine if front card URL is accessible
        try {
          const frontBuffer = await fetchFrontBuffer(doc.card_url);
          const combinedBuffer = await generateCombinedCard(frontBuffer, backBuffer);
          combinedUrl = await uploadCombinedCard(combinedBuffer, epic);
        } catch (e) {
          console.warn(` (combined skipped: ${e.message})`);
        }

        await col.updateOne(
          { _id: doc._id },
          { $set: { back_url: backUrl, combined_url: combinedUrl, back_regen: new Date() } }
        );
      }

      process.stdout.write(` ✅\n`);
      ok++;
    } catch (e) {
      process.stdout.write(` ❌ ${e.message}\n`);
      fail++;
    }
  }

  await client.close();
  console.log(`\nDone. ${ok} updated, ${fail} failed.`);
}

run().catch((e) => { console.error(e); process.exit(1); });
