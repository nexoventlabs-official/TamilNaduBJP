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
BASE_URL=https://tamilnadubjp.live
FRONTEND_URL=https://tamilnadubjp.live

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

A thorough capacity audit performed in **July 2026** outlines the limits and behaviors of the staging server (1 vCPU, 2GB RAM):

- **Web Registration Flow**: High-performance. By shifting card rendering to client-side canvas iframes, backend processing time was reduced from ~10 seconds to **under 2 seconds**.
- **EPIC Lookup limits**: Capped by DB1 connection pool size (10 connections). It handles up to **200 concurrent lookups** smoothly before scaling queue latency triggers query timeouts.
- **Card Rendering (Backend Puppeteer)**: Backend Puppeteer rendering is restricted to low-volume WhatsApp requests. It sustains up to **5 concurrent renders** smoothly; going over **20 concurrent processes** risks crashing the server due to OOM constraints.

For more details, see [STRESS_TEST_FINDINGS.md](file:///c:/Users/Admin/Desktop/bjptn/STRESS_TEST_FINDINGS.md).

---

## 🔐 Security & Hardening Features

- **Distributed Locks**: MongoDB-based distributed generation locks protect the card generation endpoint from race conditions.
- **Rate Limiting**: Custom express-rate-limit middleware protects login, OTP request, and validation endpoints.
- **PII Protection**: SMS OTPs are cryptographically hashed using SHA-256 before storage and deleted immediately upon first-time verification.
- **File Integrity**: Passport photos uploaded on registration are validated at the byte-level via magic-bytes checks to prevent shell uploads.
