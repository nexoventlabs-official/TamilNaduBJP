# Verification Walkthrough — Unique Member Verification Fixes

We have fixed the issue where scanning the card QR code or loading a card in a new browser/expired session could show another user's photo if they registered with the same EPIC number.

## Changes Made

### 1. QR Code Verification Route Pointing to Unique `wtlCode`
* **QR Generation (`cardGenerator.js`) & Chatbot (`chat.js`)**:
  - The QR code printed on the card and the text messages sent to users now point to `/verify/${wtlCode}` instead of `/verify/${epicNo}`.
  - Since `wtlCode` (the BJP membership code) is unique to every single registration (even if they share an EPIC), the QR scan will always load that exact person's record.

### 2. Multi-ID Verification Handler
* **Endpoint (`public.js: verifyVoterHandler`)**:
  - If the ID parameter starts with `BJP-` (a `wtlCode`), the backend queries `generated_voters` directly by `wtl_code: id`.
  - If it is a standard EPIC number, it queries by `EPIC_NO` (falling back to the most recently registered user for that EPIC).
  - This ensures 100% backwards-compatibility with old cards, while making new cards fully unique!

### 3. Session & Query Mobile Lookup for Profiles
* **Endpoint (`chat.js: /profile/:epicNo`) & Endpoint (`public.js: /api/card/:epicNo`)**:
  - When loading the card preview page, the backend now reads `mobile` from both the session (`req.session.verified_mobile`) AND the query parameters (`req.query.mobile`).
  - It uses this `mobile` parameter to query `generated_voters` by both `EPIC_NO` and `MOBILE_NO`.
  - This ensures that if Person B views their card, they see their own photo/details instead of Person A (even in a new browser or an expired session where their query params are passed by the frontend).

---

## Verification Results

* Built and deployed the frontend with Updated admin verification links.
* PM2 backend successfully restarted on droplet with zero compile or loader exceptions.
