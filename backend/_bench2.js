process.env.USE_VOTERS_ALL = 'true';
const fs = require('fs');
const { connectDB, getVoterDb, findVoterByEpic } = require('./src/db');
const redis = require('./src/redis');
function pct(a,p){const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length*p/100)]||0;}
const out = [];
function log(m){ out.push(m); fs.writeFileSync('/tmp/bench.out', out.join('\n')+'\n'); }
(async () => {
  await connectDB();
  await new Promise(r=>setTimeout(r,1500));
  const vdb = getVoterDb();
  const docs = await vdb.collection('voters_all').aggregate([{ $sample: { size: 1000 } }, { $project: { EPIC_NO: 1 } }]).toArray();
  const epics = docs.map(d => String(d.EPIC_NO).trim().toUpperCase()).filter(Boolean);
  log('sampled EPICs: ' + epics.length);
  console.log = () => {}; console.warn = () => {};
  async function run(n) {
    const batch = []; for (let i=0;i<n;i++) batch.push(epics[i % epics.length]);
    if (redis.isReady() && batch.length) { try { await redis.client.del(...batch.map(e=>`epic:${e}`)); } catch(_){} }
    const lat=[]; const t0=Date.now();
    await Promise.all(batch.map(async e=>{ const s=Date.now(); try{ await findVoterByEpic(e);}catch(_){}; lat.push(Date.now()-s); }));
    const total=Date.now()-t0;
    log(`concurrency ${String(n).padStart(4)} | wall ${String(total).padStart(6)}ms | ${(n/(total/1000)).toFixed(0).padStart(6)}/s | p50 ${pct(lat,50)}ms | p95 ${pct(lat,95)}ms`);
  }
  for (const n of [50,100,200,500,1000]) { await run(n); }
  process.exit(0);
})().catch(e=>{ try{fs.writeFileSync('/tmp/bench.out','ERR '+e.message+'\n');}catch(_){}; process.exit(1); });
