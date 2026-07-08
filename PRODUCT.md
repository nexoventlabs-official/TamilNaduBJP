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

Based on the July 2026 Capacity Audit, the following architectural boundaries are established:

1. **Client-Side Rendering Priority**: Backend-based card generation (Puppeteer) is limited to a concurrency of **5** before latency becomes unacceptable (>10s) and crashes entirely at **20+ concurrent renders** (droplet memory exhaustion). All web-based registrations must utilize the client-side canvas rendering engine to bypass this limit.
2. **Voter DB Lookup Limits**: The parallel search across 234 assembly collections is connection-pool bound. With a `maxPoolSize` of `10`, the system experiences query timeouts and false 404s starting at **200 concurrent lookups**.
3. **Recovery Characteristics**: Droplet recovery is not automatic following a Puppeteer overload. A hard reboot is required. Production deployment requires resource scaling (RAM/CPU) and connection pool limits raised to at least 50.
