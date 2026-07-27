#!/bin/sh

# Only seed on first deploy — skip if already seeded
SEED_MARKER="/pb/pb_data/.seeded"
if [ -f "$SEED_MARKER" ]; then
  echo "✓ Already seeded — skipping (delete $SEED_MARKER to force re-seed)"
  exit 0
fi

# Wait for PocketBase to be ready
echo "⏳ Waiting for PocketBase..."
for i in $(seq 1 30); do
  if wget -q -O /dev/null http://localhost:8090/api/health 2>/dev/null; then
    echo "✅ PocketBase is ready"
    break
  fi
  sleep 1
done

# Create superuser via CLI
echo "👤 Creating superuser..."
cd /pb
./pocketbase superuser upsert "${PB_ADMIN_EMAIL:-admin@smartbookings.local}" "${PB_ADMIN_PASSWORD:-admin123456}" 2>/dev/null || echo "  (superuser may already exist)"

# Check if already seeded
ROOMS_COUNT=$(wget -q -O - "http://localhost:8090/api/collections/rooms/records?perPage=1" 2>/dev/null | grep -o '"totalItems":[0-9]*' | cut -d: -f2)

if [ "$ROOMS_COUNT" = "0" ] || [ -z "$ROOMS_COUNT" ]; then
  echo "🌱 Fresh install — running seed..."
  cd /app/backend && node seed.js http://localhost:8090
else
  echo "✓ Already seeded (${ROOMS_COUNT} rooms)"
  # Always run seed to fix collection rules (idempotent — skips existing data)
  echo "🔒 Fixing collection rules..."
  cd /app/backend && node seed.js http://localhost:8090 2>&1 | grep -E "✓|✗|rules"
fi

# Auto-generate slots if fewer than 14 days ahead exist
echo "🔄 Checking slot availability..."
cd /app/backend && node auto-slots.js http://localhost:8090

# Mark as seeded so future deploys skip
touch "$SEED_MARKER"
echo "✅ Seed complete — marked as seeded"

# Start daily cron job for slot auto-generation
echo "⏰ Starting daily slot cron (every 24h)..."
while true; do
  sleep 86400
  echo "🔄 Daily slot check..."
  cd /app/backend && node auto-slots.js http://localhost:8090 2>/dev/null
done &
