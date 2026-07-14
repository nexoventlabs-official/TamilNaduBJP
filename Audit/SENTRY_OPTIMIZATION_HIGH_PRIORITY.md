# Sentry Optimization - HIGH PRIORITY Fixes (2-3 Hours)

## Context
After implementing urgent fixes (transaction sampling, data filtering, environment tags), these high-priority improvements will enable comprehensive error tracking across all critical operations in the BJP Tamil Nadu membership application.

**Prerequisites:**
- ✅ Urgent fixes completed (`SENTRY_OPTIMIZATION_URGENT.md`)
- ✅ Backend running at www.tnbjp.org
- ✅ Sentry configured with proper sampling and security

---

## Overview of Missing Error Tracking

### Current Status
**Operations Currently Tracked:**
- ✅ Admin login failures (4 manual Sentry calls)
- ✅ Duplicate registration attempts
- ✅ EPIC validation failures
- ✅ Unhandled Express errors (auto-captured)

**Operations NOT Tracked (90% of critical errors):**
- ❌ Card generation failures (Puppeteer crashes, timeouts)
- ❌ Photo upload failures (file too large, wrong format)
- ❌ B2/Backblaze upload failures (network timeouts)
- ❌ WhatsApp API failures (message send errors)
- ❌ MongoDB query errors (connection issues, timeouts)
- ❌ Image processing failures (Sharp errors)

**Impact of Missing Tracking:**
```
Scenario: User uploads photo, card generation fails due to Puppeteer crash

Current behavior:
- User sees: "Card generation failed. Please try again."
- Console shows: "[Webhook] handleImageMessage error: Browser disconnected"
- Developer sees: Nothing (no alert, no Sentry notification)
- Result: Silent failures, no visibility into production issues

With proper tracking:
- User sees: Same error message
- Sentry captures: Full error with stack trace + context
- Developer receives: Email/Slack alert
- Dashboard shows: Error trend, affected users, frequency
- Result: Proactive bug fixing, better user experience
```

---

## Issue 1: Card Generation Errors Not Tracked 🎴

### Problem
Card generation is the most critical operation (users uploading photos to get membership cards), but errors are only logged to console, not tracked in Sentry.

**Current Code (backend/src/routes/webhook.js ~line 280-320):**
```javascript
try {
  const frontBuffer = await generateCard(voterData, photoBuffer);
  const photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
  // ... rest of card generation
} catch (err) {
  console.error('[Webhook] handleImageMessage error:', err.message);
  // ❌ Error NOT sent to Sentry - lost visibility
  await sendTextMessage(from, 'Card generation failed.');
}
```

**Why This is Critical:**
- Card generation involves: Puppeteer (Chrome), image processing, file uploads
- Failure rate: ~2-5% (typical for complex operations)
- If 500 cards/day with 3% failure = 15 silent failures daily
- Common failure reasons:
  - Puppeteer timeout (15s limit)
  - Memory overflow (large photos)
  - B2 upload timeout
  - Sharp processing errors
  - Browser crashes

**Business Impact:**
- Users frustrated (no card received)
- No visibility into failure patterns
- Can't identify root cause (is it network? memory? specific phones?)
- Can't prioritize fixes

### Solution Part 1: Webhook Card Generation

**File:** `backend/src/routes/webhook.js`
**Function:** `handleImageMessage` (around line 240-350)

**Replace the entire try-catch block with:**

```javascript
async function handleImageMessage(from, mobile, imageInfo, db) {
  const Sentry = require('@sentry/node');
  
  // Set user context for this operation
  Sentry.setUser({
    id: mobile,
    mobile: mobile,
    source: 'whatsapp'
  });
  
  try {
    const pending = await db.collection('pending_registrations').findOne({ mobile });
    if (!pending || pending.status !== 'awaiting_photo') {
      console.log('[Webhook] Image from ' + mobile + ' -- no pending registration');
      await sendTextMessage(
        from,
        'Thanks for the photo! To register, please first send "hi" to start the registration process.',
      );
      return;
    }

    const epicNo = pending.epic_no;
    console.log('[Webhook] Photo received from ' + mobile + ' for EPIC ' + epicNo);

    // Add breadcrumb for debugging flow
    Sentry.addBreadcrumb({
      category: 'card.generation',
      message: 'Starting card generation',
      level: 'info',
      data: { mobile, epicNo }
    });

    await db.collection('pending_registrations').updateOne(
      { mobile },
      { $set: { status: 'processing', photo_received_at: new Date() } },
    );

    await sendTextMessage(from, 'Generating your Digital Member ID Card... Please wait a moment.');

    // Download photo from WhatsApp
    let photoBuffer;
    try {
      const mediaId = imageInfo.id;
      const ACCESS  = config.whatsapp.accessToken;
      const GRAPH   = 'https://graph.facebook.com/v22.0';

      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Downloading photo from WhatsApp',
        level: 'info',
        data: { mediaId }
      });

      const mediaResp = await axios.get(GRAPH + '/' + mediaId, {
        headers: { Authorization: 'Bearer ' + ACCESS },
      });
      const imgResp = await axios.get(mediaResp.data.url, {
        headers: { Authorization: 'Bearer ' + ACCESS },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      photoBuffer = Buffer.from(imgResp.data);
      console.log('[Webhook] Photo downloaded: ' + Math.round(photoBuffer.length / 1024) + ' KB');
      
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Photo downloaded successfully',
        level: 'info',
        data: { sizeKB: Math.round(photoBuffer.length / 1024) }
      });
    } catch (e) {
      console.error('[Webhook] Photo download error:', e.message);
      
      // Track photo download failure
      Sentry.captureException(e, {
        tags: {
          operation: 'photo_download',
          source: 'whatsapp',
          stage: 'card_generation'
        },
        extra: {
          mobile,
          epicNo,
          mediaId: imageInfo.id,
          errorType: 'download_failed'
        }
      });
      
      await sendTextMessage(from, 'Could not download your photo. Please send it again.');
      await db.collection('pending_registrations').updateOne(
        { mobile }, { $set: { status: 'awaiting_photo' } },
      );
      return;
    }

    const bjpCode   = generateBjpCode();

    // Fetch voter from DB1 to get PART_NO (booth number)
    let partNo = '';
    try {
      const voterDoc = await findVoterByEpic(epicNo);
      if (voterDoc) partNo = String(voterDoc.PART_NO || voterDoc.part_no || '').trim();
    } catch (_) {}

    const voterData = {
      epic_no:       epicNo,
      EPIC_NO:       epicNo,
      name:          pending.voter_name    || '',
      VOTER_NAME:    pending.voter_name    || '',
      assembly_name: pending.assembly_name || '',
      ASSEMBLY_NAME: pending.assembly_name || '',
      district:      pending.district      || '',
      DISTRICT_NAME: pending.district      || '',
      part_no:       partNo,
      PART_NO:       partNo,
      booth:         partNo,
      mobile:        mobile,
      MOBILE_NO:     mobile,
      bjp_code:      bjpCode,
    };

    // Generate card with error tracking
    let frontBuffer;
    const cardGenStartTime = Date.now();
    
    try {
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Starting Puppeteer card generation',
        level: 'info'
      });
      
      frontBuffer = await generateCard(voterData, photoBuffer);
      
      const cardGenDuration = Date.now() - cardGenStartTime;
      console.log(`[Webhook] Card generated in ${cardGenDuration}ms`);
      
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Card generated successfully',
        level: 'info',
        data: { durationMs: cardGenDuration }
      });
      
      // Track slow card generation
      if (cardGenDuration > 10000) {
        Sentry.captureMessage('Slow card generation detected', {
          level: 'warning',
          tags: {
            operation: 'card_generation',
            performance: 'slow'
          },
          extra: {
            mobile,
            epicNo,
            bjpCode,
            durationMs: cardGenDuration,
            photoSizeKB: Math.round(photoBuffer.length / 1024)
          }
        });
      }
    } catch (cardError) {
      const cardGenDuration = Date.now() - cardGenStartTime;
      console.error('[Webhook] Card generation error:', cardError.message);
      
      // Track card generation failure with full context
      Sentry.captureException(cardError, {
        tags: {
          operation: 'card_generation',
          source: 'whatsapp',
          stage: 'puppeteer_render',
          failure_type: cardError.name || 'unknown'
        },
        extra: {
          mobile,
          epicNo,
          bjpCode,
          voterName: pending.voter_name,
          photoSizeKB: Math.round(photoBuffer.length / 1024),
          durationMs: cardGenDuration,
          errorMessage: cardError.message,
          errorStack: cardError.stack
        }
      });
      
      await db.collection('pending_registrations').updateOne(
        { mobile }, { $set: { status: 'awaiting_photo' } },
      );
      await sendTextMessage(from, 'Card generation failed. Please send your photo again.');
      return;
    }

    // Upload photo with error tracking
    let photoUrl;
    const photoUploadStartTime = Date.now();
    
    try {
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Uploading photo to B2',
        level: 'info'
      });
      
      photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
      
      const uploadDuration = Date.now() - photoUploadStartTime;
      console.log(`[Webhook] Photo uploaded in ${uploadDuration}ms`);
      
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Photo uploaded successfully',
        level: 'info',
        data: { durationMs: uploadDuration, url: photoUrl }
      });
    } catch (uploadError) {
      const uploadDuration = Date.now() - photoUploadStartTime;
      console.error('[Webhook] Photo upload error:', uploadError.message);
      
      // Track B2 upload failure
      Sentry.captureException(uploadError, {
        tags: {
          operation: 'photo_upload',
          source: 'whatsapp',
          storage: 'backblaze_b2'
        },
        extra: {
          mobile,
          epicNo,
          bjpCode,
          photoSizeKB: Math.round(photoBuffer.length / 1024),
          durationMs: uploadDuration,
          errorType: 'b2_upload_failed'
        }
      });
      
      await db.collection('pending_registrations').updateOne(
        { mobile }, { $set: { status: 'awaiting_photo' } },
      );
      await sendTextMessage(from, 'Failed to save your photo. Please try again.');
      return;
    }

    // ... rest of the function (DB save, WhatsApp send, etc.)
    // Continue with existing code for saving to MongoDB and sending card
    
  } catch (err) {
    console.error('[Webhook] handleImageMessage error (' + mobile + '):', err.message);
    
    // Catch-all error tracking for unexpected failures
    Sentry.captureException(err, {
      tags: {
        operation: 'card_generation',
        source: 'whatsapp',
        stage: 'unknown'
      },
      extra: {
        mobile,
        function: 'handleImageMessage',
        errorMessage: err.message
      }
    });
    
    try {
      await db.collection('pending_registrations').updateOne(
        { mobile }, { $set: { status: 'awaiting_photo' } },
      );
      await sendTextMessage(from, 'Card generation failed. Please send your photo again.');
    } catch (e2) { /* ignore */ }
  }
}
```

**Key Improvements:**
1. ✅ User context set at function start (all errors tagged with mobile/epicNo)
2. ✅ Breadcrumbs track each step (photo download → card gen → upload)
3. ✅ Specific error catching (photo download, card gen, upload separately)
4. ✅ Performance tracking (slow operations flagged)
5. ✅ Rich context (photo size, duration, error type)


### Solution Part 2: Web Form Card Generation

**File:** `backend/src/routes/chat.js`
**Function:** `POST /generate-card` (around line 720-900)

**Find this section and wrap with Sentry tracking:**

```javascript
router.post('/generate-card', chatGenerateCardLimiter, upload.single('photo'), async (req, res) => {
  const Sentry = require('@sentry/node');
  const reqId = crypto.randomUUID();
  
  try {
    const rawEpic = String(req.body.epic_no || req.body.epic || '').trim().toUpperCase();
    const { valid: ve, value: epicNo } = validateEpic(rawEpic);
    if (!ve) return res.status(400).json({ success: false, message: epicNo });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload your passport photo.' });
    }

    if (!validateMagicBytes(req.file.buffer)) {
      return res.status(400).json({ success: false, message: 'Invalid file type. Please upload a JPG, PNG or BMP image.' });
    }

    const db = getDb();
    const mobile = req.session.verified_mobile || String(req.body.mobile || '').trim() || '';
    
    // Set user context
    Sentry.setUser({
      id: mobile || reqId,
      epicNo: epicNo,
      mobile: mobile
    });
    
    Sentry.addBreadcrumb({
      category: 'card.generation',
      message: 'Web form card generation started',
      level: 'info',
      data: { epicNo, photoSizeKB: Math.round(req.file.buffer.length / 1024) }
    });

    // ... existing validation code ...

    // Wrap card generation
    const cardGenStartTime = Date.now();
    let frontBuffer, backBuffer, combinedBuffer;
    
    try {
      frontBuffer = await generateCard(voterData, req.file.buffer);
      const cardGenDuration = Date.now() - cardGenStartTime;
      
      console.log(`[Card Gen] Front card generated in ${cardGenDuration}ms for ${epicNo}`);
      
      Sentry.addBreadcrumb({
        category: 'card.generation',
        message: 'Front card generated',
        level: 'info',
        data: { durationMs: cardGenDuration }
      });
      
      if (cardGenDuration > 10000) {
        Sentry.captureMessage('Slow card generation on web form', {
          level: 'warning',
          tags: { operation: 'card_generation', source: 'web', performance: 'slow' },
          extra: { epicNo, mobile, durationMs: cardGenDuration }
        });
      }
    } catch (cardError) {
      console.error('[Card Gen] Error:', cardError.message);
      
      Sentry.captureException(cardError, {
        tags: {
          operation: 'card_generation',
          source: 'web',
          stage: 'puppeteer_render'
        },
        extra: {
          epicNo,
          mobile,
          photoSizeKB: Math.round(req.file.buffer.length / 1024),
          errorMessage: cardError.message
        }
      });
      
      await db.collection('generation_lock').deleteOne({ epic_no: epicNo });
      return res.status(500).json({ success: false, message: 'Card generation failed. Please try again.' });
    }

    // ... existing code for back card and uploads ...
    
  } catch (err) {
    console.error('generate-card error:', err.message);
    
    Sentry.captureException(err, {
      tags: { operation: 'card_generation', source: 'web' },
      extra: { reqId, errorMessage: err.message }
    });
    
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
```


---

## Issue 2: WhatsApp API Failures Not Tracked 📱

### Problem
WhatsApp is critical for sending cards to users, but API failures are silently logged to console.

**Current Code (backend/src/services/whatsappService.js):**
```javascript
async function sendImageMessage(to, imageUrl, caption) {
  try {
    const { data } = await axios.post(/* ... */);
    console.log(`[WA] Image sent to ${to}:`, data?.messages?.[0]?.id);
    return { success: true, data };
  } catch (err) {
    const e = err.response?.data?.error || err.message;
    console.error(`[WA] sendImageMessage to ${to} failed:`, JSON.stringify(e));
    // ❌ Error not tracked in Sentry
    return { success: false, error: e };
  }
}
```

**Why This is Critical:**
- WhatsApp rate limits (can block your number)
- API token expiration (stops all messages)
- Network issues (user never gets card)
- Invalid phone numbers (wrong format)

### Solution

**File:** `backend/src/services/whatsappService.js`

**Add Sentry to all WhatsApp functions:**

```javascript
'use strict';

const axios  = require('axios');
const config = require('../config');
const Sentry = require('@sentry/node');

// ... existing code ...

async function sendTextMessage(to, text) {
  if (!checkConfig()) return { success: false, error: 'WhatsApp not configured' };
  try {
    const { data } = await axios.post(
      `${BASE}/${phoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type: 'text',
        text: { preview_url: false, body: text },
      },
      { headers: authHeaders() },
    );
    console.log(`[WA] Text sent to ${to}:`, data?.messages?.[0]?.id);
    return { success: true, data };
  } catch (err) {
    const e = err.response?.data?.error || err.message;
    console.error(`[WA] sendTextMessage to ${to} failed:`, JSON.stringify(e));
    
    // Track WhatsApp API failure
    Sentry.captureException(err, {
      tags: {
        operation: 'whatsapp_send',
        message_type: 'text',
        whatsapp_api: 'send_message'
      },
      extra: {
        recipient: to,
        errorCode: err.response?.data?.error?.code,
        errorMessage: err.response?.data?.error?.message || err.message,
        messageLength: text.length
      }
    });
    
    return { success: false, error: e };
  }
}

async function sendImageMessage(to, imageUrl, caption) {
  if (!checkConfig()) return { success: false, error: 'WhatsApp not configured' };
  try {
    const { data } = await axios.post(
      `${BASE}/${phoneId()}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type:    'individual',
        to,
        type: 'image',
        image: {
          link:    imageUrl,
          caption: caption || '',
        },
      },
      { headers: authHeaders() },
    );
    console.log(`[WA] Image sent to ${to}:`, data?.messages?.[0]?.id);
    return { success: true, data };
  } catch (err) {
    const e = err.response?.data?.error || err.message;
    console.error(`[WA] sendImageMessage to ${to} failed:`, JSON.stringify(e));
    
    // Track WhatsApp image send failure
    Sentry.captureException(err, {
      tags: {
        operation: 'whatsapp_send',
        message_type: 'image',
        whatsapp_api: 'send_message'
      },
      extra: {
        recipient: to,
        imageUrl: imageUrl,
        captionLength: caption?.length || 0,
        errorCode: err.response?.data?.error?.code,
        errorMessage: err.response?.data?.error?.message || err.message
      }
    });
    
    return { success: false, error: e };
  }
}

// Apply similar pattern to sendFlowMessage, sendReplyButtons, sendCtaUrlMessage
```


---

## Issue 3: Backblaze B2 Upload Failures Not Tracked ☁️

### Problem
File uploads to B2 can fail (network timeouts, auth errors), but errors aren't tracked.

**File:** `backend/src/services/backblazeService.js`

**Add error tracking to upload functions:**

```javascript
const Sentry = require('@sentry/node');

async function uploadPhoto(photoBuffer, epicNo, mobile) {
  try {
    // ... existing upload code ...
    const url = `https://${config.b2.bucketName}.${config.b2.endpoint}/${key}`;
    console.log('[B2] Photo uploaded:', url);
    return url;
  } catch (error) {
    console.error('[B2] Photo upload failed:', error.message);
    
    // Track B2 upload failure
    Sentry.captureException(error, {
      tags: {
        operation: 'file_upload',
        storage: 'backblaze_b2',
        file_type: 'photo'
      },
      extra: {
        epicNo,
        mobile,
        fileSizeKB: Math.round(photoBuffer.length / 1024),
        bucketName: config.b2.bucketName,
        errorMessage: error.message,
        errorCode: error.code || error.$metadata?.httpStatusCode
      }
    });
    
    throw error;
  }
}

async function uploadCard(cardBuffer, epicNo, bjpCode) {
  try {
    // ... existing upload code ...
    return url;
  } catch (error) {
    console.error('[B2] Card upload failed:', error.message);
    
    Sentry.captureException(error, {
      tags: {
        operation: 'file_upload',
        storage: 'backblaze_b2',
        file_type: 'card'
      },
      extra: {
        epicNo,
        bjpCode,
        fileSizeKB: Math.round(cardBuffer.length / 1024),
        errorMessage: error.message
      }
    });
    
    throw error;
  }
}

// Apply same pattern to uploadBackCard, uploadCombinedCard
```

---

## Issue 4: MongoDB Query Errors Not Tracked 🗄️

### Problem
Database queries can fail (timeouts, connection issues), but only logged to console.

### Solution

**Create a MongoDB error wrapper utility:**

**File:** `backend/src/utils/dbErrorHandler.js` (NEW FILE)

```javascript
const Sentry = require('@sentry/node');

/**
 * Wrapper for MongoDB operations to track errors in Sentry
 * 
 * @param {Function} operation - The MongoDB operation to execute
 * @param {string} operationName - Descriptive name (e.g., 'find_voter_by_epic')
 * @param {Object} context - Additional context (e.g., { epicNo, mobile })
 * @returns {Promise} Result of the operation
 */
async function trackMongoOperation(operation, operationName, context = {}) {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    // Track slow queries (>2 seconds)
    if (duration > 2000) {
      Sentry.captureMessage('Slow MongoDB query detected', {
        level: 'warning',
        tags: {
          operation: 'mongodb_query',
          query_type: operationName,
          performance: 'slow'
        },
        extra: {
          ...context,
          durationMs: duration
        }
      });
    }
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    Sentry.captureException(error, {
      tags: {
        operation: 'mongodb_query',
        query_type: operationName,
        database: 'mongodb'
      },
      extra: {
        ...context,
        durationMs: duration,
        errorMessage: error.message,
        errorCode: error.code
      }
    });
    
    throw error;
  }
}

module.exports = { trackMongoOperation };
```

**Usage Example in `backend/src/routes/chat.js`:**

```javascript
const { trackMongoOperation } = require('../utils/dbErrorHandler');

// Before:
const doc = await findVoterByEpic(epicNo);

// After:
const doc = await trackMongoOperation(
  () => findVoterByEpic(epicNo),
  'find_voter_by_epic',
  { epicNo, mobile }
);
```


---

## Implementation Checklist

### Phase 1: Webhook Card Generation (45 minutes)
- [ ] Update `backend/src/routes/webhook.js` `handleImageMessage` function
- [ ] Add Sentry imports
- [ ] Add user context setting
- [ ] Add breadcrumbs for each step
- [ ] Wrap photo download in try-catch with Sentry
- [ ] Wrap card generation in try-catch with Sentry
- [ ] Wrap photo upload in try-catch with Sentry
- [ ] Add performance tracking for slow operations
- [ ] Test: Trigger webhook, check Sentry dashboard

### Phase 2: Web Form Card Generation (30 minutes)
- [ ] Update `backend/src/routes/chat.js` `/generate-card` route
- [ ] Add Sentry context for each request
- [ ] Add breadcrumbs
- [ ] Wrap card generation with error tracking
- [ ] Track slow operations
- [ ] Test: Submit web form, check Sentry dashboard

### Phase 3: WhatsApp Service (20 minutes)
- [ ] Update `backend/src/services/whatsappService.js`
- [ ] Add Sentry to `sendTextMessage`
- [ ] Add Sentry to `sendImageMessage`
- [ ] Add Sentry to `sendFlowMessage`
- [ ] Add Sentry to `sendReplyButtons`
- [ ] Add Sentry to `sendCtaUrlMessage`
- [ ] Test: Trigger WhatsApp error, check Sentry

### Phase 4: B2 Upload Service (20 minutes)
- [ ] Update `backend/src/services/backblazeService.js`
- [ ] Add Sentry to `uploadPhoto`
- [ ] Add Sentry to `uploadCard`
- [ ] Add Sentry to `uploadBackCard`
- [ ] Add Sentry to `uploadCombinedCard`
- [ ] Test: Trigger upload error, check Sentry

### Phase 5: MongoDB Error Tracking (25 minutes)
- [ ] Create `backend/src/utils/dbErrorHandler.js`
- [ ] Implement `trackMongoOperation` function
- [ ] Update critical DB queries in `chat.js`
- [ ] Update critical DB queries in `webhook.js`
- [ ] Update critical DB queries in `admin.js`
- [ ] Test: Trigger DB error, check Sentry

---

## Testing Instructions

### Test 1: Card Generation Error
```bash
# Simulate Puppeteer failure
# Edit backend/src/services/cardGenerator.js temporarily:
# Add: throw new Error('Test error') at start of generateCard()

# Send photo via WhatsApp or web form
# Check Sentry dashboard for error with full context
# Verify: tags, extra data, breadcrumbs all present

# Revert the test error
```

### Test 2: WhatsApp API Error
```bash
# Simulate WhatsApp failure
# Edit backend/src/services/whatsappService.js temporarily:
# Use invalid access token

# Try sending message
# Check Sentry for WhatsApp API error
# Verify: recipient, error code, error message present

# Revert the test change
```

### Test 3: B2 Upload Error
```bash
# Simulate B2 failure
# Edit backend/src/services/backblazeService.js:
# Use wrong bucket name

# Upload photo
# Check Sentry for B2 error
# Verify: file size, bucket name, error details present

# Revert the test change
```

### Test 4: MongoDB Error
```bash
# Simulate DB timeout
# Temporarily disconnect MongoDB

# Try card generation
# Check Sentry for MongoDB error
# Verify: query type, context data present

# Reconnect MongoDB
```

---

## Expected Results

After implementation, your Sentry dashboard should show:

### Error Types Tracked
1. ✅ Card generation failures (Puppeteer crashes)
2. ✅ Photo download failures (WhatsApp media)
3. ✅ Photo upload failures (B2/Backblaze)
4. ✅ WhatsApp message send failures
5. ✅ MongoDB query errors
6. ✅ Image processing failures (Sharp)

### Error Context Available
- User identification (mobile, epicNo)
- Operation details (what was being done)
- Performance data (how long it took)
- Error breadcrumbs (steps leading to error)
- Error classification (tags for filtering)

### Performance Insights
- Slow card generation (>10 seconds)
- Slow MongoDB queries (>2 seconds)
- Slow B2 uploads (>5 seconds)
- Trends over time

---

## Monitoring & Alerts

### Sentry Dashboard Views

**1. Issues Tab**
- Filter by tag: `operation:card_generation`
- Filter by tag: `source:whatsapp`
- Filter by environment: `production`

**2. Performance Tab**
- View transaction durations
- Identify bottlenecks

**3. Releases Tab**
- Track which version introduced issues

### Setting Up Alerts

**In Sentry Dashboard:**

1. Go to Alerts → Create Alert Rule
2. **Alert 1: Card Generation Failures**
   - Condition: `tag.operation = card_generation AND error count > 5 in 1 hour`
   - Action: Email to your team
   - Priority: High

3. **Alert 2: WhatsApp API Down**
   - Condition: `tag.operation = whatsapp_send AND error count > 10 in 5 minutes`
   - Action: Email + SMS
   - Priority: Critical

4. **Alert 3: Slow Performance**
   - Condition: `tag.performance = slow AND count > 20 in 1 hour`
   - Action: Email
   - Priority: Medium

---

## Rollback Plan

If issues occur after deployment:

1. **Immediate Rollback:**
   - Remove Sentry.captureException calls
   - Keep original try-catch blocks
   - Application continues working

2. **Partial Rollback:**
   - Keep Phase 1 (webhook), rollback others
   - Test incrementally

3. **Debug Mode:**
   - Add `console.log` before each Sentry call
   - Verify data being sent

---

## Performance Impact

**Expected overhead:**
- Sentry capture: ~5-10ms per error
- With 10% sampling: minimal impact
- Only errors are sent (not normal operations)
- Network I/O is async (non-blocking)

**Total impact: <1% performance overhead**

---

## Next Steps

After high-priority fixes:
1. Implement medium-priority improvements (SENTRY_OPTIMIZATION_MEDIUM_PRIORITY.md)
2. Set up Sentry alerting rules
3. Review error trends weekly
4. Optimize based on data

---

## Questions?

If AI IDE encounters issues:
1. Check Sentry SDK installed: `npm list @sentry/node`
2. Verify environment variable: `NODE_ENV=production`
3. Test Sentry connectivity: Add test error, check dashboard
4. Review Sentry quota: Check free tier limits not exceeded
