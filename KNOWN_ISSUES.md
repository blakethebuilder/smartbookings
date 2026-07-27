# Known Issues & Gaps

## Security

| Issue | Severity | Status |
|-------|----------|--------|
| Collection rules public | High | ⚠️ Open — staff collection has public read (required for PIN→password login). Recommend: migrate staff to PocketBase auth collection. Passwords masked in UI. |
| Payfast secrets on client | Medium | ✅ Fixed — server-side signature |
| No input validation | Low | ✅ Fixed — name/email validation |
| Auto-confirm bypass | Medium | ✅ Fixed — removed |
| No rate limiting | Low | ✅ Fixed — 10 req/min |

## Feature Gaps

| Feature | Status | Notes |
|---------|--------|-------|
| WhatsApp reminders | Not started | Evolution API integration needed |
| Email notifications | Not started | Confirmation emails, reminders |
| Booking cancellation flow | ✅ Done | Customer self-service + admin cancel |
| Deposit-only model | Partial | Dynamic deposit calculation implemented |
| Room images | Not uploaded | Asset files exist but not in PocketBase |
| Reset demo data | ✅ Done | Settings → Reset All Demo Data button |

## UI/UX Polish

| Item | Status |
|------|--------|
| Mobile responsive | ✅ Done — full responsive overhaul |
| PWA support | ✅ Done — SW cache busting on deploy |
| Error boundary | ✅ Done |
| Loading spinners | ✅ Done |
| Toast notifications | ✅ Done — ToastProvider + useToast hook |
| Dark/light theme toggle | Not needed (dark only) |
| Print/export bookings | ✅ Done — CSV export on Bookings page |
| Room emoji placeholders | ✅ Done |
| Settings collapsed sections | ✅ Done |
| PIN → Password | ✅ Done — renamed everywhere |
| Calendar mobile view | ✅ Done — day view on phone, compact toolbar |

## Testing

| Area | Status |
|------|--------|
| Manual booking flow | Tested |
| Payfast sandbox | Tested |
| Calendar + slot generation | Tested |
| Staff dashboard | Tested |
| Staff management | Tested |
| Mobile responsive | Tested |
| Docker deployment | Tested |
| Unit tests | Not implemented |
| E2E tests | Not implemented |

## Architecture Notes

### Staff Authentication Migration Path
The current password-based auth uses a regular PocketBase collection (`staff`) rather than PocketBase's built-in auth system. This means collection rules must remain public for login to work. Recommended migration:
1. Create a proper PocketBase auth collection for staff
2. Migrate staff records to the auth collection
3. Update the frontend to use `pb.collection('staff').authWithPassword()` instead of password comparison
4. Then lock down collection rules to authenticated only
