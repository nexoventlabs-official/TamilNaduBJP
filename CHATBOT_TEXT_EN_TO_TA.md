# BJP Tamil Nadu Chatbot — English Text for Tamil Translation

This document contains the **complete user-facing English text** of the BJP Tamil Nadu member chatbot (extracted from `frontend/src/pages/ChatbotPage.jsx`). It is meant to be handed to a translator to produce a full Tamil (தமிழ்) version of the interface.

**How to use this file**

- Fill in the **Tamil** column for every row. Leave the English column unchanged.
- Tokens written in `{curly_braces}` are **dynamic values** filled in by the app at runtime (mobile numbers, names, counts, etc.). **Keep every `{token}` exactly as-is** in your Tamil translation — do not translate or remove them, only move them to the correct place in the Tamil sentence.
- **Emojis (🪷 ✅ ❌ 🎉 🔐 📱 etc.) are part of the message** — preserve them exactly where they appear.
- Text wrapped in `*asterisks*` renders as **bold** in the chat. Keep the asterisks around the same words if the emphasis still makes sense in Tamil.
- A **Notes** column is included where a token or context needs explanation.

See the **Placeholder reference** section at the end for the meaning of every `{token}`.

---

## 1. Sidebar / Menu

Menu item labels and their subtitles/descriptions.

| #  | English                                        | Tamil | Notes                                  |
| -- | ---------------------------------------------- | ----- | -------------------------------------- |
| 1  | My Profile                                     |       | Menu label                             |
| 2  | View registration details                      |       | Subtitle for My Profile                |
| 3  | My Card                                        |       | Menu label                             |
| 4  | View and download ID card                      |       | Subtitle for My Card                   |
| 5  | My Welcome Letter                              |       | Menu label                             |
| 6  | View and download welcome letter               |       | Subtitle                               |
| 7  | BJP Brochure                                   |       | Menu label                             |
| 8  | Official Central Welfare Schemes Booklet       |       | Subtitle                               |
| 9  | My Appreciation Letter                         |       | Menu label                             |
| 10 | Earned at 5 successful referrals               |       | Subtitle                               |
| 11 | Booth Info                                     |       | Menu label                             |
| 12 | Get your booth details                         |       | Subtitle                               |
| 13 | Referral Link                                  |       | Menu label                             |
| 14 | Share and invite others                        |       | Subtitle                               |
| 15 | My Members                                     |       | Menu label                             |
| 16 | Voters registered via your link                |       | Subtitle                               |
| 17 | Best Performers                                |       | Menu label                             |
| 18 | Top 5 referrers list                           |       | Subtitle                               |
| 19 | Be an Organizer                                |       | Menu label                             |
| 20 | Apply to be a BJP Organizer                    |       | Subtitle                               |
| 21 | Be a Booth Agent                               |       | Menu label                             |
| 22 | Apply to be a Booth Agent                      |       | Subtitle                               |
| 23 | Local Body Election                            |       | Menu label                             |
| 24 | Participate in Local Body elections            |       | Subtitle                               |
| 25 | BJP TAMIL NADU                                 |       | Brand name (header & sidebar)          |
| 26 | Online                                         |       | Status text                            |
| 27 | BJP TN Member Bot                              |       | Chat list name                         |
| 28 | Register to generate your Member Card          |       | Chat list subtitle (before completion) |
| 29 | Registration completed successfully!           |       | Chat list subtitle (after completion)  |
| 30 | Nation First. Party Next. Self Last.           |       | Sidebar tagline                        |
| 31 | Coming Soon                                    |       | Badge                                  |
| 32 | Logout                                         |       | Sidebar / tooltip                      |
| 33 | Complete registration to unlock                |       | Locked-item tooltip                    |
| 34 | Invite 5 members to unlock appreciation letter |       | Locked-item tooltip                    |

---

## 2. Welcome & Start

| # | English                                                                                                            | Tamil | Notes                                                       |
| - | ------------------------------------------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------- |
| 1 | World's Largest. India's Biggest. Soon to be Tamil Nadu's No. 1.                                                   |       | Welcome banner headline                                     |
| 2 | You are joining the world's leading political organization. Click below to generate your personalized Member Card. |       | Welcome banner body                                         |
| 3 | Start                                                                                                              |       | Start button                                                |
| 4 | 👋 Welcome back to*BJP Tamil Nadu!*                                                                              |       | Returning member greeting                                   |
| 5 | ⚠️*Already you are a member!* Try to logout and rescan the QR.                                                 |       | Shown when already a member and a QR referral is in the URL |
| 6 | 🔒 You have been logged out after 1 hour of inactivity. Tap Start to continue.                                     |       | Auto-logout message                                         |

---

## 3. Mobile & OTP Flow

| #  | English                                                                                          | Tamil | Notes                                                                                                      |
| -- | ------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------- |
| 1  | 📱 Please enter your 10-digit mobile number to get started.                                      |       | Prompt                                                                                                     |
| 2  | ❌ Please enter a valid 10-digit mobile number.                                                  |       | Validation error                                                                                           |
| 3  | ❌ Could not send OTP right now. Please try again in a moment.                                   |       | Error                                                                                                      |
| 4  | ❌ {error}                                                                                       |       | Generic OTP send error;`{error}` = server message, falls back to "Could not send OTP. Please try again." |
| 5  | 🔐 We've sent a 6-digit OTP to {mobile}. Please enter it to continue.                            |       | `{mobile}` = masked number e.g. 98765XXXXX                                                               |
| 6  | ❌ Please enter the 6-digit OTP sent to your number.                                             |       | Validation error                                                                                           |
| 7  | ✅ Verified! Here is your Digital Member ID Card:                                                |       | Existing member verified                                                                                   |
| 8  | ✅ Mobile verified! You are not registered yet — enter your EPIC Number (Voter ID) to continue. |       | New member                                                                                                 |
| 9  | 📋 Format: 3 letters + 7 digits  e.g. ABC1234567                                                 |       | EPIC format hint                                                                                           |
| 10 | ❌ {error}                                                                                       |       | Invalid OTP error; falls back to "Invalid OTP. Please try again."                                          |
| 11 | 📨 A new OTP has been sent to {mobile}.                                                          |       | Resend success                                                                                             |
| 12 | ❌ Could not resend OTP. Please try again shortly.                                               |       | Resend error                                                                                               |
| 13 | ⏳ {message}                                                                                     |       | Resend cooldown message from server (e.g. wait N seconds)                                                  |
| 14 | Resend OTP in {seconds}s                                                                         |       | Countdown label;`{seconds}` = seconds remaining                                                          |
| 15 | Resend OTP                                                                                       |       | Button                                                                                                     |

---

## 4. EPIC Entry & Validation

| #  | English                                                                      | Tamil | Notes                                                                          |
| -- | ---------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------ |
| 1  | ❌ Invalid format. Use 3 letters + 7 digits (e.g., ABC1234567).              |       | Validation error                                                               |
| 2  | ✅ You are already a registered member! Here is your Digital Member ID Card: |       | Already registered                                                             |
| 3  | ✅ Voter found! Please confirm your details:                                 |       | Success                                                                        |
| 4  | ❌ {error}                                                                   |       | EPIC lookup error; falls back to "EPIC not found. Please check and try again." |
| 5  | 📋 Please enter your EPIC Number again.                                      |       | Retry prompt                                                                   |
| 6  | Voter Details                                                                |       | Voter card header                                                              |
| 7  | Name                                                                         |       | Field label                                                                    |
| 8  | Father's Name                                                                |       | Field label                                                                    |
| 9  | EPIC No                                                                      |       | Field label                                                                    |
| 10 | Age / Gender                                                                 |       | Field label                                                                    |
| 11 | Assembly                                                                     |       | Field label                                                                    |
| 12 | District                                                                     |       | Field label                                                                    |
| 13 | Part No                                                                      |       | Field label                                                                    |
| 14 | Serial No                                                                    |       | Field label                                                                    |
| 15 | Confirm Details                                                              |       | Button                                                                         |
| 16 | Re-enter ID                                                                  |       | Button                                                                         |
| 17 | ✓ Confirmed                                                                 |       | User echo message                                                              |
| 18 | ↩ Try Again                                                                 |       | User echo message                                                              |

---

## 5. Photo Upload

| # | English                                                                 | Tamil | Notes             |
| - | ----------------------------------------------------------------------- | ----- | ----------------- |
| 1 | 📸 Please upload your recent passport-size photo to generate your card. |       | Prompt            |
| 2 | ❌ Please select an image file (JPG, PNG, etc.).                        |       | Validation error  |
| 3 | Upload Image                                                            |       | Button            |
| 4 | Take Photo                                                              |       | Button            |
| 5 | Crop Your Photo                                                         |       | Crop modal title  |
| 6 | Drag to adjust. Aspect ratio 2.68:3.84.                                 |       | Crop hint         |
| 7 | Cancel                                                                  |       | Button            |
| 8 | Use Photo                                                               |       | Button            |
| 9 | 📸 Photo uploaded                                                       |       | User echo message |

---

## 6. Card Generation & Result

| #  | English                                                                                                                             | Tamil | Notes                                                                                           |
| -- | ----------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| 1  | ⏳ Generating your card… please wait a moment.                                                                                     |       | Bot message                                                                                     |
| 2  | Generating your card, please wait...                                                                                                |       | Input-bar status                                                                                |
| 3  | Generating membership card...                                                                                                       |       | Header status                                                                                   |
| 4  | 🎉 Your Digital Member ID Card is ready!                                                                                            |       | Success                                                                                         |
| 5  | ✉️*Welcome to BJP Tamil Nadu!*\nWe have prepared your official welcome letter. Click below to view, print, or save it as a PDF: |       | Welcome letter intro (contains a line break)                                                    |
| 6  | ❌ {error}                                                                                                                          |       | Generation error; falls back to "Error generating card. Please try uploading your photo again." |
| 7  | Digital Member Card                                                                                                                 |       | Card modal label                                                                                |
| 8  | Download Card                                                                                                                       |       | Button                                                                                          |
| 9  | Close                                                                                                                               |       | Button                                                                                          |
| 10 | Card Generated Successfully                                                                                                         |       | Done status bar                                                                                 |

---

## 7. My Members Panel

| #  | English                                                                                            | Tamil | Notes                                            |
| -- | -------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------ |
| 1  | My Members                                                                                         |       | Panel title                                      |
| 2  | Referral Tree Network — {directCount} Direct\| {indirectCount} Indirect ({totalCount} Total)      |       | Stats bar; counts are numbers                    |
| 3  | Tree structure empty                                                                               |       | Empty state title                                |
| 4  | You haven't referred anyone yet. Share your custom BJP code to build your 3-layer support network! |       | Empty state body                                 |
| 5  | No referral code available.                                                                        |       | Error                                            |
| 6  | Unable to load referred members.                                                                   |       | Error                                            |
| 7  | Member Details                                                                                     |       | Modal title                                      |
| 8  | Member Name                                                                                        |       | Field label                                      |
| 9  | EPIC Number                                                                                        |       | Field label                                      |
| 10 | BJP Code                                                                                           |       | Field label                                      |
| 11 | Assembly (Booth)                                                                                   |       | Field label                                      |
| 12 | District                                                                                           |       | Field label                                      |
| 13 | Joined Date                                                                                        |       | Field label                                      |
| 14 | Show {count} more                                                                                  |       | "+N" chip tooltip;`{count}` = number to reveal |

---

## 8. Referral Link Panel

| #  | English                                                                                     | Tamil | Notes                                                   |
| -- | ------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------- |
| 1  | Referral Link                                                                               |       | Panel title                                             |
| 2  | Scan this QR to join BJP Tamil Nadu                                                         |       | Caption                                                 |
| 3  | Copy Link                                                                                   |       | Button                                                  |
| 4  | Copied!                                                                                     |       | Button (after copy)                                     |
| 5  | Share on WhatsApp                                                                           |       | Button                                                  |
| 6  | Download QR Code                                                                            |       | Button                                                  |
| 7  | Everyone who joins via your link or QR appears in your*My Members* list.                  |       | Note (My Members is bold/highlighted)                   |
| 8  | No referral link available.                                                                 |       | Empty state                                             |
| 9  | 🪷 Here is your referral link and QR code! Share this to invite others and build your team: |       | In-chat referral message                                |
| 10 | Share WhatsApp                                                                              |       | Button (compact chat version)                           |
| 11 | *🪷 Join BJP Tamil Nadu!*                                                                 |       | WhatsApp share text — title line                       |
| 12 | *Generate your free Digital Member ID Card here:*                                         |       | WhatsApp share text — body line (followed by the link) |
| 13 | 🪷 Join BJP Tamil Nadu!                                                                     |       | Web-share sheet title                                   |
| 14 | ℹ️ Referral link unavailable.                                                             |       | Bot error message                                       |
| 15 | ❌ Unable to load referral link.                                                            |       | Bot error message                                       |

---

## 9. Best Performers Panel

| #  | English                                                                                                  | Tamil | Notes                          |
| -- | -------------------------------------------------------------------------------------------------------- | ----- | ------------------------------ |
| 1  | Best Performers                                                                                          |       | Panel title                    |
| 2  | Referral Champions 👑                                                                                    |       | Heading                        |
| 3  | Leading volunteers who are driving local outreach and expanding our digital footprint across Tamil Nadu. |       | Description                    |
| 4  | No referrals recorded yet. Be the first performer!                                                       |       | Empty state                    |
| 5  | Unable to load leaderboard.                                                                              |       | Error                          |
| 6  | Volunteer Agent                                                                                          |       | Role label in member modal     |
| 7  | 👑 Champion                                                                                              |       | Rank badge for#1               |
| 8  | Rank #{rank}                                                                                             |       | Rank badge;`{rank}` = number |
| 9  | Member Code                                                                                              |       | Field label                    |
| 10 | EPIC Number                                                                                              |       | Field label                    |
| 11 | Assembly                                                                                                 |       | Field label                    |
| 12 | District                                                                                                 |       | Field label                    |
| 13 | Part Number                                                                                              |       | Field label                    |
| 14 | Total Refs                                                                                               |       | Field label                    |
| 15 | BJP Code:                                                                                                |       | Inline label before code       |
| 16 | Top 5 Referrers                                                                                          |       | In-chat leaderboard header     |
| 17 | No referrals generated yet. Invite members to lead the board!                                            |       | In-chat empty state            |
| 18 | {count} referral                                                                                         |       | Singular badge (count = 1)     |
| 19 | {count} referrals                                                                                        |       | Plural badge                   |

---

## 10. Booth Info

| # | English                                                      | Tamil | Notes               |
| - | ------------------------------------------------------------ | ----- | ------------------- |
| 1 | Booth Information                                            |       | Panel title         |
| 2 | Polling Booth Details                                        |       | Heading             |
| 3 | Registered election booth location and part details          |       | Subtitle            |
| 4 | No details found.                                            |       | Empty state         |
| 5 | No booth data available. Please complete registration first. |       | Error               |
| 6 | Unable to load booth information.                            |       | Error               |
| 7 | No booth information available.                              |       | In-chat empty state |

---

## 11. Be an Organizer

| #  | English                                                                                                                                                                                                                     | Tamil | Notes                                                              |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| 1  | Be a BJP Organizer                                                                                                                                                                                                          |       | Panel title                                                        |
| 2  | BJP Organizer Wing                                                                                                                                                                                                          |       | Heading                                                            |
| 3  | As a BJP Organizer, you play a pivotal role in strengthening the party's foundation. Select your preferred Wing to lead local initiatives, mobilize community support, and drive organizational progress across Tamil Nadu. |       | Description                                                        |
| 4  | Checking status...                                                                                                                                                                                                          |       | Loading                                                            |
| 5  | Select Preferred Wing:                                                                                                                                                                                                      |       | Field label                                                        |
| 6  | -- Choose a Wing --                                                                                                                                                                                                         |       | Dropdown placeholder                                               |
| 7  | Submit Request                                                                                                                                                                                                              |       | Button                                                             |
| 8  | Submitting...                                                                                                                                                                                                               |       | Button (busy)                                                      |
| 9  | ✅ Organizer request submitted! Admin will review it shortly.                                                                                                                                                               |       | Success (fallback text)                                            |
| 10 | ❌ {error}                                                                                                                                                                                                                  |       | Error; falls back to "Unable to submit request. Please try again." |
| 11 | Status: {status}                                                                                                                                                                                                            |       | `{status}` = pending / confirmed / rejected                      |
| 12 | Assigned Wing                                                                                                                                                                                                               |       | Field label                                                        |
| 13 | Application Status                                                                                                                                                                                                          |       | Field label                                                        |
| 14 | Approved & Activated                                                                                                                                                                                                        |       | Status text (confirmed)                                            |
| 15 | Rejected by Admin                                                                                                                                                                                                           |       | Status text (rejected)                                             |
| 16 | Pending Admin Verification                                                                                                                                                                                                  |       | Status text (pending)                                              |

### 11a. Organizer Wing Options (dropdown list)

| #  | English                                           | Tamil |
| -- | ------------------------------------------------- | ----- |
| 1  | Bharatiya Janata Yuva Morcha (BJYM)               |       |
| 2  | BJP Mahila Morcha                                 |       |
| 3  | OBC Morcha                                        |       |
| 4  | SC Morcha                                         |       |
| 5  | ST Morcha                                         |       |
| 6  | Kisan Morcha                                      |       |
| 7  | Minority Morcha                                   |       |
| 8  | Arts and Culture Wing                             |       |
| 9  | NGO Wing                                          |       |
| 10 | Intellectual Cell / Teachers & Professionals Cell |       |
| 11 | Weavers and Artisans Cell                         |       |
| 12 | Fishermen Cell                                    |       |
| 13 | Traders and Business Cell                         |       |
| 14 | Ex-Servicemen Cell                                |       |
| 15 | Overseas Friends of BJP (OFBJP) / NRI Cell        |       |
| 16 | Information Technology (IT) & Social Media Wing   |       |
| 17 | Co-Operative Cell                                 |       |
| 18 | Sports & Skill Development Cell                   |       |
| 19 | Medical & Doctors Cell                            |       |
| 20 | Legal & Advocates Cell                            |       |
| 21 | Local Bodies Cell                                 |       |

---

## 12. Be a Booth Agent

| #  | English                                                                                                                                                                                                                    | Tamil | Notes                                                                        |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| 1  | Be a Booth Agent                                                                                                                                                                                                           |       | Panel title                                                                  |
| 2  | BJP Booth Agent                                                                                                                                                                                                            |       | Heading                                                                      |
| 3  | As a BJP Booth Agent, you are the crucial guardian of our democratic process at the polling booth level. You will be responsible for booth management, voter facilitation, and ensuring fair elections in your local part. |       | Description                                                                  |
| 4  | Checking status...                                                                                                                                                                                                         |       | Loading                                                                      |
| 5  | Failed to load district data.                                                                                                                                                                                              |       | Error                                                                        |
| 6  | Failed to load district data: {error}                                                                                                                                                                                      |       | Error with detail                                                            |
| 7  | Loading districts...                                                                                                                                                                                                       |       | Loading                                                                      |
| 8  | Select District:                                                                                                                                                                                                           |       | Field label                                                                  |
| 9  | -- Choose a District --                                                                                                                                                                                                    |       | Dropdown placeholder                                                         |
| 10 | Next                                                                                                                                                                                                                       |       | Button                                                                       |
| 11 | District: {district}                                                                                                                                                                                                       |       | Selected value recap;`{district}` = district name                          |
| 12 | Choose Assembly:                                                                                                                                                                                                           |       | Field label                                                                  |
| 13 | -- Choose an Assembly --                                                                                                                                                                                                   |       | Dropdown placeholder                                                         |
| 14 | Back                                                                                                                                                                                                                       |       | Button                                                                       |
| 15 | Assembly: {assembly}                                                                                                                                                                                                       |       | Selected value recap;`{assembly}` = assembly name                          |
| 16 | Select Polling Booth:                                                                                                                                                                                                      |       | Field label                                                                  |
| 17 | -- Choose a Booth Number --                                                                                                                                                                                                |       | Dropdown placeholder                                                         |
| 18 | Booth {booth}                                                                                                                                                                                                              |       | Dropdown option;`{booth}` = booth number                                   |
| 19 | Submit Request                                                                                                                                                                                                             |       | Button                                                                       |
| 20 | Submitting...                                                                                                                                                                                                              |       | Button (busy)                                                                |
| 21 | ✅*Your booth agent request has been submitted successfully!*                                                                                                                                                            |       | Success                                                                      |
| 22 | Admin will review your request shortly.                                                                                                                                                                                    |       | Success subtext                                                              |
| 23 | {error}                                                                                                                                                                                                                    |       | Error; falls back to "Failed to submit booth agent request."                 |
| 24 | District                                                                                                                                                                                                                   |       | Status field label                                                           |
| 25 | Assembly                                                                                                                                                                                                                   |       | Status field label                                                           |
| 26 | Polling Booth Location                                                                                                                                                                                                     |       | Status field label                                                           |
| 27 | Booth Number {booth}                                                                                                                                                                                                       |       | Status value;`{booth}` = booth number                                      |
| 28 | Status: {status}                                                                                                                                                                                                           |       | `{status}` = pending / confirmed / rejected                                |
| 29 | Enter your Booth Number                                                                                                                                                                                                    |       | Input placeholder (in-chat booth flow)                                       |
| 30 | Booth No: {booth}                                                                                                                                                                                                          |       | User echo message (in-chat booth flow)                                       |
| 31 | ✅ Booth Agent request submitted! Admin will review it shortly.                                                                                                                                                            |       | Success (in-chat, fallback)                                                  |
| 32 | ℹ️ {error}                                                                                                                                                                                                               |       | Error (in-chat); falls back to "Unable to submit request. Please try again." |

---

## 13. Local Body Election

| #  | English                                                                                                                                                                                                          | Tamil | Notes                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------- |
| 1  | Local Body Election                                                                                                                                                                                              |       | Panel title                   |
| 2  | Local Body Elections                                                                                                                                                                                             |       | Heading                       |
| 3  | BJP Tamil Nadu is preparing a database of active members who are interested in contesting, organizing, or coordinating local initiatives for the upcoming local body elections.                                  |       | Description                   |
| 4  | Are you interested in participating or contesting in the upcoming Local Body Elections?                                                                                                                          |       | Question                      |
| 5  | Interested                                                                                                                                                                                                       |       | Button                        |
| 6  | Not Interested                                                                                                                                                                                                   |       | Button                        |
| 7  | 🎉 Your interest has been submitted! Our election coordinators will reach out to you.                                                                                                                            |       | Confirmation (interested)     |
| 8  | Thank you for letting us know. You can change your selection at any time.                                                                                                                                        |       | Confirmation (not interested) |
| 9  | Are you sure you want to submit "Interested"? This selection cannot be changed later.                                                                                                                            |       | window.confirm() dialog       |
| 10 | Are you sure you want to submit "Not Interested"? This selection cannot be changed later.                                                                                                                        |       | window.confirm() dialog       |
| 11 | Local Body Elections 🗳️                                                                                                                                                                                        |       | Modal title (step 4)          |
| 12 | Are you interested in participating or contesting in the upcoming Local Body Elections? BJP Tamil Nadu is planning candidate profiles and coordinators for each ward/panchayat. Let us know your interest below: |       | Modal body (step 4)           |
| 13 | Failed to record response.                                                                                                                                                                                       |       | Error (fallback)              |
| 14 | Network error.                                                                                                                                                                                                   |       | Error (fallback)              |
| 15 | Thank You! 🙏                                                                                                                                                                                                    |       | Modal title (step 5)          |
| 16 | Thanks for your interest! Your preference has been recorded. Our team will reach out to you with further updates.                                                                                                |       | Modal body (interested)       |
| 17 | Thank you for your response. Your preference has been successfully recorded.                                                                                                                                     |       | Modal body (not interested)   |
| 18 | Close                                                                                                                                                                                                            |       | Button                        |
| 19 | Saving...                                                                                                                                                                                                        |       | Button (busy)                 |

---

## 14. Meeting Request (President) & Application Status Modals

| #  | English                                                                                                                                                                                                                 | Tamil | Notes                                      |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------ |
| 1  | Congratulations! 🎉                                                                                                                                                                                                     |       | Meeting modal title (step 1)               |
| 2  | You have successfully completed*5 referrals*! As a token of appreciation for your outstanding support, you have earned a special opportunity to meet the State President. Are you interested in scheduling a meeting? |       | Meeting modal body (step 1)                |
| 3  | Interested                                                                                                                                                                                                              |       | Button                                     |
| 4  | Not Interested                                                                                                                                                                                                          |       | Button                                     |
| 5  | Saving...                                                                                                                                                                                                               |       | Button (busy)                              |
| 6  | Preference Saved! 🗓️                                                                                                                                                                                                  |       | Modal title (step 3)                       |
| 7  | Thanks for your interest! Your request to meet the State President has been recorded. Our team will contact you soon.                                                                                                   |       | Modal body (interested)                    |
| 8  | Thank you for your response. Your preference has been successfully recorded.                                                                                                                                            |       | Modal body (not interested)                |
| 9  | Done                                                                                                                                                                                                                    |       | Button                                     |
| 10 | Congratulations Organizer! 🎉                                                                                                                                                                                           |       | Modal title (step 6, organizer approved)   |
| 11 | Your application to become a BJP Organizer has been accepted by the State Administrator. Thank you for your leadership and dedication to the party!                                                                     |       | Modal body (step 6)                        |
| 12 | Organizer Application ℹ️                                                                                                                                                                                              |       | Modal title (step 7, organizer rejected)   |
| 13 | Your application to become a BJP Organizer has been reviewed and rejected by the State Administrator at this time. Thank you for your interest; you can continue to participate and refer new members.                  |       | Modal body (step 7)                        |
| 14 | Congratulations Booth Agent! 🗳️                                                                                                                                                                                       |       | Modal title (step 8, booth agent approved) |
| 15 | Your application to become a BJP Booth Agent has been confirmed by the State Administrator. You are now officially assigned to your booth! Thank you for your valuable support.                                         |       | Modal body (step 8)                        |
| 16 | Booth Agent Application ℹ️                                                                                                                                                                                            |       | Modal title (step 9, booth agent rejected) |
| 17 | Your application to become a BJP Booth Agent has been reviewed and rejected by the State Administrator at this time. Thank you for your interest.                                                                       |       | Modal body (step 9)                        |
| 18 | Meeting Scheduled! Click to view details                                                                                                                                                                                |       | Bell tooltip (has appointment)             |
| 19 | Milestone Achieved! Click to Schedule Meeting with President                                                                                                                                                            |       | Bell tooltip (pending)                     |

---

## 15. Welcome Letter

| # | English                 | Tamil | Notes                             |
| - | ----------------------- | ----- | --------------------------------- |
| 1 | Welcome Letter          |       | Panel title                       |
| 2 | Welcome_Letter.pdf      |       | File card name (keep as filename) |
| 3 | Download PDF            |       | Button                            |
| 4 | Download Welcome Letter |       | Download tooltip                  |

Note: The letter body itself is rendered by a separate HTML file (`/Welcome_letter.html`) which already supports a Tamil (`lang=ta`) mode — its content is not part of this React file.

---

## 16. Appreciation Letter

| # | English                                                                                               | Tamil | Notes                                |
| - | ----------------------------------------------------------------------------------------------------- | ----- | ------------------------------------ |
| 1 | Letter of Appreciation                                                                                |       | Panel title                          |
| 2 | Appreciation_Letter.pdf                                                                               |       | File card name (keep as filename)    |
| 3 | Download PDF                                                                                          |       | Button                               |
| 4 | Download Appreciation Letter                                                                          |       | Download tooltip                     |
| 5 | 🏆*Congratulations!* You have successfully invited 5 members to join our party.                     |       | Chat message on reaching 5 referrals |
| 6 | We are pleased to present you with this official Letter of Appreciation from the BJP State President: |       | Chat message                         |

Note: The letter body itself is rendered by `/Appreciation_letter.html` (supports `lang=ta`) and is not part of this React file.

---

## 17. My Profile Panel

| #  | English                    | Tamil | Notes                     |
| -- | -------------------------- | ----- | ------------------------- |
| 1  | My Profile                 |       | Panel title               |
| 2  | No profile data available. |       | Error                     |
| 3  | Unable to load profile.    |       | Error                     |
| 4  | Member                     |       | Fallback name             |
| 5  | BJP Volunteer Agent        |       | Role label (5+ referrals) |
| 6  | BJP Registered Member      |       | Role label (default)      |
| 7  | Member Code                |       | Field label               |
| 8  | EPIC Number                |       | Field label               |
| 9  | Mobile Number              |       | Field label               |
| 10 | State                      |       | Field label               |
| 11 | Tamil Nadu                 |       | Field value (fixed)       |
| 12 | Assembly                   |       | Field label               |
| 13 | District                   |       | Field label               |
| 14 | Total Referrals            |       | Field label               |
| 15 | N/A                        |       | Empty field value         |

---

## 18. My Member Card Panel

| # | English                                                                    | Tamil | Notes            |
| - | -------------------------------------------------------------------------- | ----- | ---------------- |
| 1 | My Member Card                                                             |       | Panel title      |
| 2 | Download ID Card                                                           |       | Download tooltip |
| 3 | Hover or click on the card to flip it and view the backside voter details. |       | Instruction      |

---

## 19. BJP Brochure Panel (UI chrome)

| #  | English                                | Tamil | Notes                     |
| -- | -------------------------------------- | ----- | ------------------------- |
| 1  | BJP Brochure                           |       | Panel title               |
| 2  | Search Central Welfare Schemes...      |       | Search input placeholder  |
| 3  | All Schemes                            |       | Category pill (for "All") |
| 4  | Women & Child Welfare                  |       | Category                  |
| 5  | Education & Research                   |       | Category                  |
| 6  | Artisans & Small Business              |       | Category                  |
| 7  | Healthcare & Energy                    |       | Category                  |
| 8  | Agriculture & Farmers                  |       | Category                  |
| 9  | No schemes found matching your search. |       | Empty state               |
| 10 | View Requirements & 5-Step Application |       | Expand toggle             |
| 11 | Hide Steps & Documents                 |       | Collapse toggle           |
| 12 | Eligibility & Benefits                 |       | Section title             |
| 13 | Required Documents                     |       | Section title             |
| 14 | How to Apply (5 Steps)                 |       | Section title             |
| 15 | Apply Online (Click Here)              |       | Link button               |

---

## 20. BJP Brochure Panel (Welfare Schemes content)

Each scheme below has a title, highlight badge, tag chips, an overview, eligibility text, a document list, and a 5-step application guide. All are visible to users.

### Scheme 1 — Sukanya Samriddhi Yojana (SSY)

| #  | English                                                                                                                                              | Tamil |
| -- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | Sukanya Samriddhi Yojana (SSY)                                                                                                                       |       |
| 2  | 8.2% INTEREST                                                                                                                                        |       |
| 3  | Girl Child Welfare                                                                                                                                   |       |
| 4  | Tax-Free Savings                                                                                                                                     |       |
| 5  | 8.2% Annually                                                                                                                                        |       |
| 6  | This is a savings scheme by the Government of India designed to build a dedicated corpus for a girl child's higher education and marriage expenses.  |       |
| 7  | Available for parents with girls under 10 years old. It features an attractive 8.2% tax-free interest rate and deduction benefits under Section 80C. |       |
| 8  | Aadhaar & PAN (Parents)                                                                                                                              |       |
| 9  | Child Birth Certificate                                                                                                                              |       |
| 10 | Photo of Child & Parent                                                                                                                              |       |
| 11 | Visit nearest Post Office or authorized commercial bank                                                                                              |       |
| 12 | Collect Sukanya Samriddhi account opening form                                                                                                       |       |
| 13 | Fill form details with girl child and parent information                                                                                             |       |
| 14 | Attach girl child birth certificate and parent KYC documents                                                                                         |       |
| 15 | Make first deposit (minimum ₹250) to activate account                                                                                               |       |

### Scheme 2 — Lakhpati Didi Scheme

| #  | English                                                                                                                                                  | Tamil |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | Lakhpati Didi Scheme                                                                                                                                     |       |
| 2  | ₹1 LAKH INCOME GOAL                                                                                                                                     |       |
| 3  | Women SHGs                                                                                                                                               |       |
| 4  | 🛠️ Skill & Drone Training                                                                                                                              |       |
| 5  | Entrepreneurship Loan                                                                                                                                    |       |
| 6  | A national livelihood program providing skill development, drone training, and enterprise credit support to rural women entrepreneurs.                   |       |
| 7  | Aims to enable rural Self-Help Group (SHG) women members to earn a sustainable household income of at least ₹1 Lakh per annum through entrepreneurship. |       |
| 8  | Aadhaar & Ration Card                                                                                                                                    |       |
| 9  | SHG Membership Certificate                                                                                                                               |       |
| 10 | Active Bank Passbook                                                                                                                                     |       |
| 11 | Join local women Self-Help Group (SHG) in your village                                                                                                   |       |
| 12 | Register for the Lakhpati Didi livelihood program                                                                                                        |       |
| 13 | Select and complete technical skill/drone training courses                                                                                               |       |
| 14 | Create livelihood business project plan with group support                                                                                               |       |
| 15 | Apply for interest-free/low-interest enterprise loan                                                                                                     |       |

### Scheme 3 — PM Matru Vandana Yojana (PMMVY)

| #  | English                                                                                                                                            | Tamil |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | PM Matru Vandana Yojana (PMMVY)                                                                                                                    |       |
| 2  | ₹5,000 DIRECT CASH                                                                                                                                |       |
| 3  | Maternal Nutrition                                                                                                                                 |       |
| 4  | 👶 Child Immunization                                                                                                                              |       |
| 5  | ₹5,000 DBT Cash                                                                                                                                   |       |
| 6  | A maternity benefit program that provides direct cash assistance to pregnant women to promote immunization and healthcare support.                 |       |
| 7  | Pregnant and lactating mothers receive a direct benefit transfer (DBT) of ₹5,00,000 in their bank account to compensate for wages and cover food. |       |
| 8  | Aadhaar (Mother & Husband)                                                                                                                         |       |
| 9  | Mother & Child Protection Card                                                                                                                     |       |
| 10 | Aadhaar Seeded Bank Account                                                                                                                        |       |
| 11 | Visit local Anganwadi Center or health sub-center                                                                                                  |       |
| 12 | Register first pregnancy or second girl child on portal                                                                                            |       |
| 13 | Submit PMMVY application Form 1A with bank account copy                                                                                            |       |
| 14 | Upload ANC health check-up records and child birth slip                                                                                            |       |
| 15 | Receive cash benefit directly via Aadhaar-seeded DBT                                                                                               |       |

### Scheme 4 — PM Vidyalaxmi Higher Education Loan

| #  | English                                                                                                                                                                        | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1  | PM Vidyalaxmi Higher Education Loan                                                                                                                                            |       |
| 2  | COLLATERAL-FREE                                                                                                                                                                |       |
| 3  | Quality Education                                                                                                                                                              |       |
| 4  | Collateral-Free Loans                                                                                                                                                          |       |
| 5  | Interest Subvention                                                                                                                                                            |       |
| 6  | A national portal offering meritorious students collateral-free and guarantor-free higher education loans for admission to designated Quality Higher Educational Institutions. |       |
| 7  | Enables access to education loans with zero assets required as collateral. Offers interest subvention of 3% for family incomes up to ₹8 Lakhs.                                |       |
| 8  | Student & Parent Aadhaar                                                                                                                                                       |       |
| 9  | College Admission Letter                                                                                                                                                       |       |
| 10 | Fee Structure & Marksheets                                                                                                                                                     |       |
| 11 | Register online on the official pmvidyalaxmi.gov.in portal                                                                                                                     |       |
| 12 | Fill the Common Education Loan Application Form (CELAF)                                                                                                                        |       |
| 13 | Select eligible bank loans matching your requirements                                                                                                                          |       |
| 14 | Upload college admission letter, fee structure, and KYC                                                                                                                        |       |
| 15 | Track application status online until loan is disbursed                                                                                                                        |       |

### Scheme 5 — PM-YASASVI Scholarship Scheme

| #  | English                                                                                                                                            | Tamil |
| -- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | PM-YASASVI Scholarship Scheme                                                                                                                      |       |
| 2  | SCHOOL FEE GRANTS                                                                                                                                  |       |
| 3  | OBC/EBC Welfare                                                                                                                                    |       |
| 4  | Merit Scholarships                                                                                                                                 |       |
| 5  | Full Fee Support                                                                                                                                   |       |
| 6  | A scholarship scheme under the Ministry of Social Justice and Empowerment for OBC, EBC, and DNT students studying in Top Class Schools.            |       |
| 7  | Full fee coverage. Eligible students receive up to ₹75,000/year (Class 9-10) and up to ₹1,25,000/year (Class 11-12) via direct benefit transfer. |       |
| 8  | Student Aadhaar & Caste Cert.                                                                                                                      |       |
| 9  | Family Income Cert. (<₹2.5L)                                                                                                                      |       |
| 10 | Marksheet of Previous Class                                                                                                                        |       |
| 11 | Check eligibility criteria for OBC/EBC/DNT students                                                                                                |       |
| 12 | Register online on National Scholarship Portal (NSP)                                                                                               |       |
| 13 | Fill student profile and select YASASVI Scholarship                                                                                                |       |
| 14 | Upload school marksheets, income certificate, and caste card                                                                                       |       |
| 15 | Direct bank transfer of scholarship fund upon verification                                                                                         |       |

### Scheme 6 — PM Research Fellowship (PMRF)

| #  | English                                                                                                                        | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1  | PM Research Fellowship (PMRF)                                                                                                  |       |
| 2  | ₹80,000 / MONTH STIPEND                                                                                                       |       |
| 3  | PhD Researchers                                                                                                                |       |
| 4  | IIT/IISc/NIT Host                                                                                                              |       |
| 5  | Contigency Fund                                                                                                                |       |
| 6  | A prestigious fellowship designed to support top scientific and technological PhD research talent at premium institutes.       |       |
| 7  | Stipends of ₹70,000 to ₹80,000/month, along with a research contingency grant of ₹2 Lakhs per year for 5 consecutive years. |       |
| 8  | Academic Transcripts & Degrees                                                                                                 |       |
| 9  | Research Proposal Statement                                                                                                    |       |
| 10 | GATE/NET Score Report                                                                                                          |       |
| 11 | Enroll in PhD program at IITs, IISc, IISERs, or central universities                                                           |       |
| 12 | Prepare detailed research project proposal with guide                                                                          |       |
| 13 | Apply online during the active PMRF admission cycle                                                                            |       |
| 14 | Submit academic references, publications, and transcripts                                                                      |       |
| 15 | Attend national committee interview for final selection                                                                        |       |

### Scheme 7 — PM Vishwakarma Scheme

| #  | English                                                                                                                                                                        | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1  | PM Vishwakarma Scheme                                                                                                                                                          |       |
| 2  | ₹15,000 TOOLKIT GRANT                                                                                                                                                         |       |
| 3  | 🛠️ 18 Craft Trades                                                                                                                                                           |       |
| 4  | Toolkit Grants                                                                                                                                                                 |       |
| 5  | Low Interest Loans                                                                                                                                                             |       |
| 6  | A scheme supporting traditional artisans and craftspeople who work with hand tools, aiming to preserve heritage and modernize their skills.                                    |       |
| 7  | Covers 18 trades (carpenters, potters, blacksmiths, etc.). Provides ₹15,000 toolkit grants, training stipends, and collateral-free enterprise credit starting at 5% interest. |       |
| 8  | Aadhaar Card (Linked Mobile)                                                                                                                                                   |       |
| 9  | Bank Account Details                                                                                                                                                           |       |
| 10 | Ration Card / Address Proof                                                                                                                                                    |       |
| 11 | Visit local Common Service Center (CSC) with Aadhaar card                                                                                                                      |       |
| 12 | Register trade details (carpenters, potters, weavers, etc.)                                                                                                                    |       |
| 13 | Complete basic skill verification and training (5-7 days)                                                                                                                      |       |
| 14 | Claim ₹15,000 toolkit digital e-voucher for modern tools                                                                                                                      |       |
| 15 | Apply for first collateral-free loan up to ₹1,00,000                                                                                                                          |       |

### Scheme 8 — Pradhan Mantri Mudra Yojana (PMMY)

| #  | English                                                                                                                                                           | Tamil |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | Pradhan Mantri Mudra Yojana (PMMY)                                                                                                                                |       |
| 2  | ₹50,000 TO ₹20 LAKHS                                                                                                                                            |       |
| 3  | Micro Enterprises                                                                                                                                                 |       |
| 4  | Startups & Shops                                                                                                                                                  |       |
| 5  | No Asset Security                                                                                                                                                 |       |
| 6  | A flagship loan scheme supporting non-farm, non-corporate micro and small enterprises to access collateral-free business capital.                                 |       |
| 7  | Provides business loans up to ₹20 Lakhs categorized into Shishu (up to ₹50k), Kishor (up to ₹5 Lakhs), and Tarun (up to ₹20 Lakhs) with no collateral needed. |       |
| 8  | KYC Identity & Address Proof                                                                                                                                      |       |
| 9  | Business License / Udyam                                                                                                                                          |       |
| 10 | Last 6 Months Bank Statement                                                                                                                                      |       |
| 11 | Prepare business plan for Shishu, Kishor, or Tarun loan                                                                                                           |       |
| 12 | Visit nearest commercial bank, co-op bank, or NBFC                                                                                                                |       |
| 13 | Fill Pradhan Mantri Mudra Yojana application form                                                                                                                 |       |
| 14 | Submit identity proof, address proof, and business license                                                                                                        |       |
| 15 | Get loan approved and disbursed without asset security                                                                                                            |       |

### Scheme 9 — PM SVANidhi Scheme

| #  | English                                                                                                                                               | Tamil |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | PM SVANidhi Scheme                                                                                                                                    |       |
| 2  | STREET VENDOR CREDIT                                                                                                                                  |       |
| 3  | Street Hawkers                                                                                                                                        |       |
| 4  | Regular Repay Subsidy                                                                                                                                 |       |
| 5  | Cash Back Rewards                                                                                                                                     |       |
| 6  | A special micro-credit scheme providing working capital loans to urban and semi-urban street vendors to resume livelihoods.                           |       |
| 7  | First-time collateral-free working capital loan of ₹10,000. Successful repayment unlocks secondary loans of ₹20,000 and tertiary loans of ₹50,000. |       |
| 8  | Aadhaar Card (Linked Mobile)                                                                                                                          |       |
| 9  | Letter of Recommendation / Vendor ID                                                                                                                  |       |
| 10 | Bank Account Details                                                                                                                                  |       |
| 11 | Ensure your name is in street vendor list (ULB survey)                                                                                                |       |
| 12 | Apply online at pmsvanidhi.mohua.gov.in portal                                                                                                        |       |
| 13 | Submit Aadhaar card and Letter of Recommendation (LoR)                                                                                                |       |
| 14 | Get details verified by local municipal corporation                                                                                                   |       |
| 15 | Receive first ₹10,000 working capital loan in bank                                                                                                   |       |

### Scheme 10 — Ayushman Bharat (PM-JAY) & CMCHIS

| #  | English                                                                                                                                                                                                                                         | Tamil |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | Ayushman Bharat (PM-JAY) & CMCHIS                                                                                                                                                                                                               |       |
| 2  | ₹5 LAKHS CASHLESS COVER                                                                                                                                                                                                                        |       |
| 3  | Cashless Hospitalization                                                                                                                                                                                                                        |       |
| 4  | ₹5 Lakhs Floater / Family                                                                                                                                                                                                                      |       |
| 5  | 👴 Senior Citizens 70+ Priority                                                                                                                                                                                                                 |       |
| 6  | A flagship health insurance program integrated with Tamil Nadu's Chief Minister's Comprehensive Health Insurance Scheme (CMCHIS), offering up to ₹5 Lakhs per family per year cashless treatment and extended to all senior citizens aged 70+. |       |
| 7  | Provides cashless hospital coverage of ₹5,00,000 per family per year on a floater basis for secondary and tertiary care at empanelled hospitals, with special priority cards issued to senior citizens aged 70+.                               |       |
| 8  | Aadhaar Card                                                                                                                                                                                                                                    |       |
| 9  | Family Smart Ration Card                                                                                                                                                                                                                        |       |
| 10 | Active Registered Mobile Number                                                                                                                                                                                                                 |       |
| 11 | Check eligibility online at beneficiary.nha.gov.in portal                                                                                                                                                                                       |       |
| 12 | Visit nearest Common Service Center (CSC) to print Ayushman card                                                                                                                                                                                |       |
| 13 | Locate empaneled government or private hospital for treatment                                                                                                                                                                                   |       |
| 14 | Present Ayushman/CMCHIS card to Arogya Mitra at hospital                                                                                                                                                                                        |       |
| 15 | Avail completely cashless treatment up to ₹5,00,000                                                                                                                                                                                            |       |

### Scheme 11 — PM Surya Ghar: Muft Bijli Yojana

| #  | English                                                                                                                                           | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1  | PM Surya Ghar: Muft Bijli Yojana                                                                                                                  |       |
| 2  | 300 UNITS FREE POWER                                                                                                                              |       |
| 3  | ☀️ Rooftop Solar Subsidy                                                                                                                        |       |
| 4  | 300 Free Power Units                                                                                                                              |       |
| 5  | ₹78,000 DBT Grant                                                                                                                                |       |
| 6  | A national subsidy program to help households install rooftop solar systems, reducing electricity bills and supplying clean energy.               |       |
| 7  | Gives up to ₹78,000 cash subsidy directly into bank accounts for installations (up to 3kW). Excess power generated can be sold back to the grid. |       |
| 8  | Aadhaar Card & Home Deed                                                                                                                          |       |
| 9  | Electricity Bill (Latest)                                                                                                                         |       |
| 10 | Bank Account Passbook Copy                                                                                                                        |       |
| 11 | Register on pmsuryaghar.gov.in with electricity consumer number                                                                                   |       |
| 12 | Submit feasibility application to local electricity board                                                                                         |       |
| 13 | Choose certified vendor to install rooftop solar panels                                                                                           |       |
| 14 | Install net meter and submit completion report to portal                                                                                          |       |
| 15 | Receive subsidy directly in bank account within 30 days                                                                                           |       |

### Scheme 12 — PM Kisan Samman Nidhi (PM-KISAN)

| #  | English                                                                                                                                    | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1  | PM Kisan Samman Nidhi (PM-KISAN)                                                                                                           |       |
| 2  | ₹6,000 ANNUAL CASH SUPPORT                                                                                                                |       |
| 3  | Landholding Farmers                                                                                                                        |       |
| 4  | Input Purchase Support                                                                                                                     |       |
| 5  | ₹6,000 DBT Income                                                                                                                         |       |
| 6  | An income support scheme providing direct financial assistance to all landholding farmer families across India to buy agricultural inputs. |       |
| 7  | Farmers receive an annual income support of ₹6,000 paid directly in 3 equal installments of ₹2,000 via Aadhaar-linked DBT transfers.     |       |
| 8  | Aadhaar & Mobile Number                                                                                                                    |       |
| 9  | Land Holding Records (Patta/Chitta)                                                                                                        |       |
| 10 | Active Aadhaar Seeded Bank A/c                                                                                                             |       |
| 11 | Visit official pmkisan.gov.in portal for selfregistration                                                                                  |       |
| 12 | Fill registration form with landholding details (Patta/Chitta)                                                                             |       |
| 13 | Enter active Aadhaar-seeded bank account credentials                                                                                       |       |
| 14 | Get land ownership verified by local revenue officer (VAO)                                                                                 |       |
| 15 | Receive ₹6,000 annual income support in three installments                                                                                |       |

### Scheme 13 — PM Fasal Bima Yojana (PMFBY)

| #  | English                                                                                                                                                      | Tamil |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| 1  | PM Fasal Bima Yojana (PMFBY)                                                                                                                                 |       |
| 2  | SUBSIDIZED PREMIUM COVER                                                                                                                                     |       |
| 3  | Agriculture Security                                                                                                                                         |       |
| 4  | 🌧️ Natural Calamity Cover                                                                                                                                  |       |
| 5  | 1.5% - 2% Premium Cap                                                                                                                                        |       |
| 6  | A crop insurance scheme that protects farmers from financial losses due to natural disasters, crop diseases, pests, or localized bad weather.                |       |
| 7  | Subsidized premium rates capped at 1.5% to 2% for food crops, oilseeds, and pulses. Provides comprehensive financial protection from sowing to post-harvest. |       |
| 8  | Aadhaar Card                                                                                                                                                 |       |
| 9  | Sowing/Land Holding Certificate                                                                                                                              |       |
| 10 | Bank Passbook & Account Details                                                                                                                              |       |
| 11 | Ensure crop is sown and notified for insurance coverage                                                                                                      |       |
| 12 | Visit pmfby.gov.in or nearest bank/CSC within deadline                                                                                                       |       |
| 13 | Submit land chitta/adangal and crop sowing certificate                                                                                                       |       |
| 14 | Pay heavily subsidized premium (1.5% to 2% for food crops)                                                                                                   |       |
| 15 | File claim within 72 h                                                                                                                                       |       |

---

## 21. Status Labels & Badges

| # | English                     | Tamil | Notes                                |
| - | --------------------------- | ----- | ------------------------------------ |
| 1 | Accepted                    |       | Notification badge (approved)        |
| 2 | Rejected                    |       | Notification badge                   |
| 3 | Interested                  |       | Selection state                      |
| 4 | Not Interested              |       | Selection state                      |
| 5 | pending                     |       | Raw status value (shown capitalized) |
| 6 | confirmed                   |       | Raw status value (shown capitalized) |
| 7 | rejected                    |       | Raw status value (shown capitalized) |
| 8 | Registration in progress    |       | Header status                        |
| 9 | Card Generated Successfully |       | Done bar                             |

---

## 22. Misc / Notifications / Tooltips / Confirms

| #  | English                | Tamil | Notes                                          |
| -- | ---------------------- | ----- | ---------------------------------------------- |
| 1  | Logout and start over? |       | window.confirm() before logout                 |
| 2  | Menu                   |       | Tooltip / aria                                 |
| 3  | Back                   |       | aria-label                                     |
| 4  | Close                  |       | aria-label                                     |
| 5  | Close sidebar          |       | aria-label                                     |
| 6  | Send                   |       | Send button aria-label / title                 |
| 7  | Bot is typing          |       | aria-label on typing indicator                 |
| 8  | தமிழ்             |       | Language toggle (already Tamil — keep)        |
| 9  | English                |       | Language toggle                                |
| 10 | Member                 |       | Generic fallback name used in letters/messages |

---

## Placeholder reference

These `{tokens}` are replaced by the app at runtime. Keep them unchanged (do not translate); only reposition them within the Tamil sentence as grammar requires.

| Token               | Meaning                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `{mobile}`        | The user's masked mobile number (first 5 digits shown, rest masked as X — e.g.`98765XXXXX`).             |
| `{otp}`           | The one-time password. Always**6 digits**. Never displayed back to the user (echoed as ••••••). |
| `{seconds}`       | Number of seconds remaining before "Resend OTP" is allowed.                                                 |
| `{message}`       | A server-provided message (e.g. OTP resend cooldown text).                                                  |
| `{error}`         | A server-provided error string; each usage has a hard-coded English fallback noted in the row.              |
| `{name}`          | Member's full name.                                                                                         |
| `{date}`          | A date (registration date / appreciation-earned date), formatted like "January 5, 2025".                    |
| `{bjp_code}`      | The member's unique BJP membership code (e.g.`BJP-1A2B3C4D`).                                             |
| `{link}`          | The member's referral URL.                                                                                  |
| `{count}`         | A generic count — used for referral counts and for the "+N" reveal chip.                                   |
| `{directCount}`   | Number of direct (Layer-2) referrals in the member tree.                                                    |
| `{indirectCount}` | Number of indirect (Layer-3) referrals in the member tree.                                                  |
| `{totalCount}`    | Total referrals (direct + indirect).                                                                        |
| `{rank}`          | A leaderboard rank number.                                                                                  |
| `{status}`        | An application status:`pending`, `confirmed`, or `rejected` (displayed capitalized).                  |
| `{wing}`          | The chosen BJP Organizer wing/morcha name.                                                                  |
| `{district}`      | Selected district name (Booth Agent flow).                                                                  |
| `{assembly}`      | Selected assembly constituency name (Booth Agent flow).                                                     |
| `{booth}`         | Booth/part number.                                                                                          |
