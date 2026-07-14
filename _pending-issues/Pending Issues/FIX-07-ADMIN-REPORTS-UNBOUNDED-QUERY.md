# FIX-07 — Admin Reports Drilldown Loads All Records into RAM

**Severity:** HIGH  
**File:** `backend/src/routes/admin.js` — Lines 1048–1164  
**Estimated Fix Time:** 45 minutes  
**Downtime Required:** None (hot reload via PM2)

---

## What Is the Issue?

The admin reports endpoint supports drilldown by district, assembly, booth, and date. When a filter is applied, it fetches all matching records as a flat array with no pagination or limit:

```javascript
// District drilldown — no limit
const docs = await db.collection('generated_voters')
  .find(match)
  .sort({ generated_at: -1 })
  .toArray();  // loads every member in that district into RAM

// Assembly drilldown — no limit
const docs = await db.collection('generated_voters')
  .find(match)
  .sort({ generated_at: -1 })
  .toArray();  // loads every member in that assembly into RAM
```

This pattern repeats for booth and date filters (lines 1120, 1161).

At 1 lakh total registrations, a district like Chennai could have 15,000–25,000 member records. Each document is ~2KB. Loading 25,000 records = ~50MB in RAM, serialised to a ~30MB JSON response — all from a single admin page click.

---

## How It Affects the Drive

- An admin clicking "View Chennai Members" allocates 50MB of RAM per click
- If two admins do this simultaneously, 100MB is allocated
- With 4 PM2 workers, the Node process hits `max_memory_restart: 1500M` and restarts
- During the restart, all active member registrations on that worker fail
- The admin panel is most heavily used during campaign events — exactly when registrations peak
- Every export/drilldown during a rally can disrupt the registration flow
- As membership grows, this gets progressively worse — at 5 lakh members, a Chennai query = 250MB

---

## The Fix

Add server-side pagination to all drilldown queries. Return records in pages of 500, not all at once.

**File:** `backend/src/routes/admin.js`

**Pattern to apply to all four drilldown types (district, assembly, booth, date):**

```javascript
// BEFORE
const docs = await db.collection('generated_voters')
  .find(match)
  .sort({ generated_at: -1 })
  .toArray();
```

```javascript
// AFTER
const PAGE_SIZE = 500;
const page = Math.max(1, parseInt(req.query.page || '1'));
const skip = (page - 1) * PAGE_SIZE;

const [docs, total] = await Promise.all([
  db.collection('generated_voters')
    .find(match)
    .sort({ generated_at: -1 })
    .skip(skip)
    .limit(PAGE_SIZE)
    .toArray(),
  db.collection('generated_voters').countDocuments(match),
]);

// Include pagination info in the response
// total_pages: Math.ceil(total / PAGE_SIZE)
// current_page: page
// total_records: total
```

The admin frontend will need to add page navigation (Previous / Next) or an "Export All" button that downloads a CSV directly rather than loading into the browser.

For CSV export specifically, use a MongoDB cursor with streaming instead of `.toArray()`:
```javascript
// For full export — stream to CSV, never load all into RAM
const cursor = db.collection('generated_voters').find(match).sort({ generated_at: -1 });
res.setHeader('Content-Type', 'text/csv');
res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
res.write('Name,Member Code,Mobile,District,Assembly,Booth,Registered At\n');
for await (const doc of cursor) {
  res.write(`"${doc.VOTER_NAME || ''}","${doc.bjp_code || ''}","${doc.MOBILE_NO || ''}","${doc.DISTRICT_NAME || ''}","${doc.ASSEMBLY_NAME || ''}","${doc.PART_NO || ''}","${doc.generated_at || ''}"\n`);
}
res.end();
```

---

## Deploy Steps

```bash
cd /var/www/bjptn
git pull origin main
pm2 reload bjptn-backend
```

---

## How Success Looks

**1. Admin reports load fast regardless of member count**
- Drilldown to any district returns in under 500ms
- Response JSON is under 1MB (500 records × ~2KB)
- PM2 memory does not spike during report loading

**2. PM2 workers stay stable during admin report usage**
```bash
pm2 list
# No restarts (↺ = 0) after admin report drilldown
```

**3. Paginated response structure**
```json
{
  "success": true,
  "headers": ["Name", "Member Code", "Mobile", ...],
  "data": [ ... ],
  "total_records": 18432,
  "current_page": 1,
  "total_pages": 37
}
```

**4. Full export works without crashing**
- "Export CSV" button streams the file directly to the browser
- Server memory stays flat during export
- A 50,000-member district export completes without PM2 restart
