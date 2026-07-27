# SmartBookings — White-Label Booking Platform

## Repository
- **GitHub:** https://github.com/blakethebuilder/smartbookings.git

## Architecture & Stack
- **Backend:** PocketBase v0.25.8 (SQLite + REST/Realtime SSE)
- **Frontend:** React 18 + Vite 6 + Tailwind CSS 3 + Lucide Icons + FullCalendar
- **Payment:** Payfast (South Africa) — HTML Form POST + ITN webhook
- **Deployment:** Docker (Alpine + nginx + PocketBase + Node.js)

## PocketBase Collections
| Collection | Purpose | Auth |
|---|---|---|
| rooms | Bookable resources with pricing, timing | Public |
| time_slots | Availability grid (auto-generated 30 days) | Public |
| bookings | Customer bookings + payment + waiver | Public |
| blocks | Staff manual time blocks | Public |
| settings | Key-value config (Payfast, WhatsApp) | Public |
| waivers | Customer indemnity waivers with signatures | Public |
| staff | Admin + Staff accounts | Public |
| booking_staff | Links staff to bookings | Public |

## Routes
| Route | Access | Page |
|-------|--------|------|
| `/login` | Public | Staff login (PIN-based) |
| `/availability` | Public | Live calendar with slots |
| `/book` | Public | Customer booking flow |
| `/book?room=<slug>` | Public | Pre-select resource from website |
| `/book/confirm/:ref` | Public | Booking confirmation + waiver link |
| `/waiver/:id` | Public | Customer indemnity waiver signing |
| `/admin` | Admin | Admin dashboard (revenue, stats) |
| `/calendar` | Both roles | FullCalendar with bookings |
| `/dashboard` | Both roles | Staff hosting dashboard |
| `/rooms` | Admin | Resource management |
| `/bookings` | Admin | Booking list + staff assignment |
| `/staff` | Admin | Staff management |
| `/settings` | Admin | App configuration |

## Completed Phases
- [x] Phase 1: PocketBase Schema (8 collections, seeded data)
- [x] Phase 2: React + Vite + Tailwind frontend
- [x] Phase 3: Staff HQ (FullCalendar + realtime SSE)
- [x] Phase 4: Public booking + Payfast integration
- [x] Phase 5: E-Waiver system with canvas signature
- [x] Phase 6: Role-based auth + dashboards
- [x] Phase 7: Docker deployment + auto-seed + nginx
- [x] Phase 8: Mobile responsive + PWA
- [x] Phase 9: Deposit vs full payment options
- [x] Phase 10: Auto slot generation + daily cron
- [x] Phase 11: Security hardening (server-side Payfast, rate limiting, input validation)
- [x] Phase 12: Resources CRUD (add/edit/delete/toggle active)

## Known Issues
See `KNOWN_ISSUES.md` for security, feature gaps, and polish items.

## Deployment
- **Docker:** Single container (Alpine + nginx + PocketBase + Node.js)
- **Port:** 80 (nginx) → proxies to PocketBase on 8090
- **Auto-seed:** Collections + rooms + staff + settings + 30 days of slots
- **Auto-slots:** Replenishes daily via cron job
