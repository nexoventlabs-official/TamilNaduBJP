# BJP Tamil Nadu Member ID Card Generator

A modern, high-performance web and WhatsApp-integrated citizen registration chatbot and admin dashboard for generating BJP digital membership ID cards in Tamil Nadu.

---

## 🎯 Project Overview

This repository contains the complete codebase for the BJP Tamil Nadu Member ID Card Generator. The application consists of two main parts:
1. **Frontend**: A fast React SPA built with Vite, styled with custom vanilla CSS and Bootstrap. It features an interactive chatbot-like registration flow for citizens, modal previewing overlays, and a comprehensive secure Administrator Control Panel.
2. **Backend**: A Node.js Express application communicating with dual MongoDB databases:
   - **Voter Roll DB (DB1)**: A read-only sharded database containing 58+ million voter records across 233 assembly constituency collections.
   - **App DB (DB2)**: A read-write database for generated voters, OTP sessions, distributed locks, organizer requests, and booth agent registrations.

---

## 🚀 Tech Stack

### Frontend
- **Framework**: React (Vite SPA)
- **Styling**: Vanilla CSS + Bootstrap 5 (Icons via Bootstrap Icons)
- **State Management & Routing**: React Router v6
- **Performance**: High-resolution client-side canvas rendering (via html2canvas) to bypass backend generation overhead on the web flow.

### Backend
- **Runtime**: Node.js v22.x
- **Framework**: Express.js
- **Database ORM**: Mongoose / MongoDB Native Driver
- **Image Processing**: Sharp
- **Automation / Webhook Rendering**: Puppeteer (Chromium) for generating high-fidelity combined cards asynchronously.
- **Process Manager**: PM2

---

## 📋 Environment Variables

Create a `.env` file in the `backend/` directory. Refer to the table below for configuration:

```bash
# General
PORT=5000
NODE_ENV=production
BASE_URL=https://tnbjp.org
FRONTEND_URL=https://tnbjp.org

# Admin Panel Credentials
ADMIN_USERNAME=BJP
ADMIN_PASSWORD=your-secure-password
JWT_SECRET=your-jwt-signing-secret
SESSION_SECRET=your-session-secret

# Databases
# DB2: Primary Write App Database (Local or Atlas)
MONGO_URI="mongodb://127.0.0.1:27017/bjptamilnadu"
MONGO_DB=bjptamilnadu

# DB1: Read-Only 58M Voter Roll Database (DigitalOcean)
MONGO_VOTER_URL="mongodb+srv://..."
MONGO_VOTER_DB_NAME=voter_db

# SMS Gateway (2Factor.in)
# Leave blank in development to use console-logged OTP mocks
SMS_API_KEY=

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
CLOUDINARY_PHOTO_FOLDER=member_photos
CLOUDINARY_CARDS_FOLDER=generated_cards

# WhatsApp Cloud API Integration
WHATSAPP_ACCESS_TOKEN=your-token
WHATSAPP_PHONE_NUMBER_ID=your-phone-id
WHATSAPP_WABA_ID=your-waba-id
WHATSAPP_VERIFY_TOKEN=your-webhook-verify-token
WHATSAPP_FLOW_REGISTRATION_ID=your-flow-reg-id
WHATSAPP_FLOW_LOGIN_ID=your-flow-login-id
```

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Run Local Development
```bash
# Start backend server (port 5000)
cd backend
npm run dev

# Start frontend Vite server (port 5173)
cd ../frontend
npm run dev
```

### 3. Build & Deploy
```bash
# Compile production build of the frontend
cd frontend
npm run build
```
This builds static assets into `frontend/dist/`. Copy or map this directory to your web server path (e.g., `/var/www/bjptn/dist/` under Nginx).

---

## 📊 Performance & Capacity Summary

A capacity audit performed in **July 2026** (originally on a 1 vCPU / 2 GB staging box) has been re-estimated for the **current production droplet: 4 vCPU / 8 GB RAM (Singapore), local voter DB, Redis-backed cache/rate-limiting/sessions**. Numbers below are engineering estimates pending a fresh load test:

- **Web Registration Flow** (client-side canvas render): high-performance; backend work is just EPIC validation + photo upload. Scales to roughly **~150–250 concurrent** registrations (hundreds–~1,000/min).
- **EPIC Lookup**: repeat lookups now served from **Redis** (~56 ms); cold lookups (234 local collections, ~166 ms) are capped by the DB1 pool (`maxPoolSize 10`) and degrade past ~150–200 concurrent uniques. Raising the pool to 50 is recommended.
- **Card Rendering (Backend Puppeteer, WhatsApp)**: the real bottleneck — sustains roughly **~4–8 concurrent** renders (~30–60/min). Large bursts still risk an OOM crash (no swap, single shared browser), so a render queue is recommended.

For more details, see [STRESS_TEST_FINDINGS.md](file:///c:/Users/Admin/Desktop/bjptn/STRESS_TEST_FINDINGS.md).

---

## 🔐 Security & Hardening Features

- **Distributed Locks**: MongoDB-based distributed generation locks protect the card generation endpoint from race conditions.
- **Rate Limiting**: Custom express-rate-limit middleware protects login, OTP request, and validation endpoints.
- **PII Protection**: SMS OTPs are cryptographically hashed using SHA-256 before storage and deleted immediately upon first-time verification.
- **File Integrity**: Passport photos uploaded on registration are validated at the byte-level via magic-bytes checks to prevent shell uploads.
