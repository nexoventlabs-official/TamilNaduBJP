# Sentry Optimization - MEDIUM PRIORITY (2-3 Weeks)

## Context
After implementing urgent and high-priority fixes, these medium-priority improvements add advanced features like performance transactions, React error boundaries, and enhanced monitoring.

**Prerequisites:**
- ✅ Urgent fixes completed (transaction sampling, security, environment)
- ✅ High-priority error tracking implemented
- ✅ Application running stable with basic Sentry tracking

---

## Overview

These improvements focus on:
1. **Performance Monitoring** - Track operation duration, identify bottlenecks
2. **Frontend Error Boundaries** - Better React error handling
3. **User Session Context** - Track user journey
4. **Advanced Breadcrumbs** - Detailed debugging trails
5. **Custom Dashboards** - Business metrics tracking

---

## Issue 1: No Performance Transactions 📊

### Problem
While errors are tracked, you can't see:
- How long card generation takes on average
- Which operations are slowest
- Performance trends over time
- Bottlenecks in the pipeline

**Example Question You Can't Answer:**
"Is card generation getting slower over time?"
"What's the average time to generate a card?"
"Which step takes longest: Puppeteer? Upload? Database?"

### Solution: Implement Performance Transactions

Performance transactions track the duration of operations and their sub-steps (spans).


**File:** `backend/src/routes/webhook.js`

**Enhanced handleImageMessage with Performance Tracking:**

```javascript
async function handleImageMessage(from, mobile, imageInfo, db) {
  const Sentry = require('@sentry/node');
  
  // Start performance transaction
  const transaction = Sentry.startTransaction({
    op: 'card.generation',
    name: 'WhatsApp Card Generation',
    tags: {
      source: 'whatsapp',
      mobile: mobile
    }
  });
  
  // Set on current scope so it's accessible everywhere
  Sentry.getCurrentScope().setSpan(transaction);
  
  try {
    const pending = await db.collection('pending_registrations').findOne({ mobile });
    
    if (!pending || pending.status !== 'awaiting_photo') {
      transaction.setStatus('cancelled');
      transaction.finish();
      return;
    }

    const epicNo = pending.epic_no;
    
    // Span 1: Photo Download
    const photoDownloadSpan = transaction.startChild({
      op: 'http.download',
      description: 'Download photo from WhatsApp'
    });
    
    let photoBuffer;
    try {
      const mediaId = imageInfo.id;
      const ACCESS  = config.whatsapp.accessToken;
      const GRAPH   = 'https://graph.facebook.com/v22.0';

      const mediaResp = await axios.get(GRAPH + '/' + mediaId, {
        headers: { Authorization: 'Bearer ' + ACCESS },
      });
      const imgResp = await axios.get(mediaResp.data.url, {
        headers: { Authorization: 'Bearer ' + ACCESS },
        responseType: 'arraybuffer',
        timeout: 30000,
      });
      photoBuffer = Buffer.from(imgResp.data);
      
      photoDownloadSpan.setData('photo_size_kb', Math.round(photoBuffer.length / 1024));
      photoDownloadSpan.setStatus('ok');
    } catch (e) {
      photoDownloadSpan.setStatus('error');
      throw e;
    } finally {
      photoDownloadSpan.finish();
    }

    // Span 2: Card Generation (Puppeteer)
    const cardGenSpan = transaction.startChild({
      op: 'card.render',
      description: 'Generate card with Puppeteer'
    });
    
    const bjpCode = generateBjpCode();
    let frontBuffer;
    
    try {
      // Build voter data...
      const voterData = { /* ... */ };
      
      frontBuffer = await generateCard(voterData, photoBuffer);
      
      cardGenSpan.setData('bjp_code', bjpCode);
      cardGenSpan.setData('epic_no', epicNo);
      cardGenSpan.setStatus('ok');
    } catch (cardError) {
      cardGenSpan.setStatus('error');
      throw cardError;
    } finally {
      cardGenSpan.finish();
    }

    // Span 3: Photo Upload to B2
    const uploadPhotoSpan = transaction.startChild({
      op: 'storage.upload',
      description: 'Upload photo to Backblaze B2'
    });
    
    let photoUrl;
    try {
      photoUrl = await uploadPhoto(photoBuffer, epicNo, mobile);
      uploadPhotoSpan.setData('photo_url', photoUrl);
      uploadPhotoSpan.setStatus('ok');
    } catch (uploadError) {
      uploadPhotoSpan.setStatus('error');
      throw uploadError;
    } finally {
      uploadPhotoSpan.finish();
    }

    // Span 4: Database Save
    const dbSaveSpan = transaction.startChild({
      op: 'db.save',
      description: 'Save generated card to MongoDB'
    });
    
    try {
      const now = new Date();
      await db.collection('generated_voters').updateOne(/* ... */);
      dbSaveSpan.setStatus('ok');
    } catch (dbError) {
      dbSaveSpan.setStatus('error');
      throw dbError;
    } finally {
      dbSaveSpan.finish();
    }

    // Span 5: Send card via WhatsApp
    const whatsappSendSpan = transaction.startChild({
      op: 'whatsapp.send',
      description: 'Send card image to user'
    });
    
    try {
      await sendImageMessage(from, frontUrl, frontCaption);
      whatsappSendSpan.setStatus('ok');
    } catch (sendError) {
      whatsappSendSpan.setStatus('error');
      // Don't throw - card is generated, just send failed
    } finally {
      whatsappSendSpan.finish();
    }

    // Mark transaction as successful
    transaction.setStatus('ok');
    transaction.setData('epic_no', epicNo);
    transaction.setData('bjp_code', bjpCode);
    
  } catch (err) {
    transaction.setStatus('error');
    Sentry.captureException(err);
  } finally {
    // Always finish transaction
    transaction.finish();
  }
}
```

**Benefits:**
- ✅ See exact duration of each step
- ✅ Identify bottlenecks (e.g., "Puppeteer takes 8s, upload takes 1s")
- ✅ Track performance trends over time
- ✅ Compare performance across different users

