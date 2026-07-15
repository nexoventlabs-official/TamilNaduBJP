# Product

## Register

product

## Users

Tamil Nadu voters on mobile devices. Primarily first-time or low-digital-literacy users: citizens who received a WhatsApp link, QR code, or referral from a party volunteer and are completing registration on their smartphone. They likely use the app once to register and receive their card. They may be in noisy or low-light environments (polling booths, community events, outdoor party gatherings).

## Product Purpose

BJP Tamil Nadu Digital Member ID Card Generator. Citizens enter their mobile number and EPIC (voter ID) number, upload a photo, and receive a personalized BJP-branded digital membership ID card. The card is downloadable and shareable. Success means a voter completes the 3-step registration flow without confusion, sees their card render correctly, and walks away with proof of BJP membership they can share or present.

## Brand Personality

Trustworthy · Patriotic · Accessible

Voice is warm and direct — like a reliable party worker guiding you through the process. The tone avoids bureaucratic coldness and avoids overly casual informality. It should feel credible and serious (this is an official-feeling ID), but never intimidating.

Emotional goal: civic pride and a sense of belonging. The member should feel recognized, not processed.

## Anti-references

- Generic dark-mode SaaS apps (Notion, Linear aesthetic) — this is not a productivity tool
- Dense government portal UI (NIC, tnvelaivaaippu.gov.in) — confusing for low-literacy users
- Flashy campaign sites with heavy motion or animation — overwhelming on mobile
- WhatsApp-clone pastel UI — too informal for an official identity document

## Design Principles

1. **One thing at a time.** The chatbot flow is sequential by design. Each screen asks exactly one thing. Never show two steps at once.
2. **Trust through clarity.** Every label, button, and instruction must be immediately understandable by a first-time smartphone user with limited English. When in doubt, simplify.
3. **The card is the product.** Everything in the UI serves the moment of card reveal. The card must look official, printed-quality, and shareable.
4. **Mobile-first, no compromise.** Designed at 375px. Desktop is a bonus. Touch targets must be large; text must be readable in sunlight.
5. **Patriotic without being garish.** The BJP tricolor palette (saffron, white, green) carries identity. Use it with restraint — one strong accent, not three competing primaries.

## Accessibility & Inclusion

- WCAG 2.1 AA minimum
- Text must remain legible at system font size +2 (users who increase phone font size)
- All form inputs must have visible labels — no placeholder-as-label patterns
- Touch targets minimum 44×44px
- No time-limited actions (OTP flow to be added later via 2factor.in — keep the placeholder state accessible)
- Tamil language support consideration for future iteration (UI currently in English)

## Performance & Scalability Constraints

Updated for the current production droplet (**4 vCPU / 8 GB RAM**, local voter DB, Redis-backed cache/rate-limiting/sessions). Numbers below are engineering estimates pending a fresh load test.

1. **Two card paths, very different ceilings**:
   - **Web registration (client-side canvas render)**: server work is just EPIC validation + photo upload, so this scales to roughly **~150–250 concurrent** registrations (hundreds–~1,000/min). This must remain the default path for web flows.
   - **WhatsApp card generation (server Puppeteer)**: the real bottleneck — safely **~4–8 concurrent** renders, ~30–60 cards/min. A burst beyond that risks an OOM crash because the shared browser has no concurrency cap and the droplet has **no swap**.
2. **Voter DB Lookup Limits**: the parallel search across 234 assembly collections is connection-pool bound at `maxPoo`
3. 
4. `lSize 10`. Repeat lookups are now served from **Redis** (fast), but a burst of unique *cold* lookups still degrades past ~150–200 concurrent. Raising the pool to 50 is recommended.
5. **Recovery Characteristics**: 8 GB gives more headroom than the legacy 2 GB box, but with **no swap** a severe Puppeteer overload can still wedge the droplet and require a reboot. Durable fixes: a WhatsApp render queue (cap ~4 concurrent) and 2–4 GB swap.
6. **Scaling readiness**: cache, rate limiting, and sessions now live in Redis, so the app can run multiple instances behind a load balancer without weakening rate limits or duplicating cache.
