#!/bin/bash
# Quick API smoke tests for the booking system
# Run: bash backend/test-api.sh [base_url]

BASE="${1:-http://localhost:8090}"
PASS=0
FAIL=0

test_endpoint() {
  local desc="$1" url="$2" expected="$3"
  local status=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$status" = "$expected" ]; then
    echo "  ✓ $desc ($status)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected $expected, got $status)"
    FAIL=$((FAIL + 1))
  fi
}

echo "🧪 Running API smoke tests against $BASE"
echo ""

echo "=== Health ==="
test_endpoint "Health check" "$BASE/api/health" "200"

echo ""
echo "=== Collections ==="
test_endpoint "Rooms list" "$BASE/api/collections/rooms/records?perPage=1" "200"
test_endpoint "Time slots list" "$BASE/api/collections/time_slots/records?perPage=1" "200"
test_endpoint "Bookings list" "$BASE/api/collections/bookings/records?perPage=1" "200"
test_endpoint "Staff list" "$BASE/api/collections/staff/records?perPage=1" "200"
test_endpoint "Settings list" "$BASE/api/collections/settings/records?perPage=1" "200"
test_endpoint "Booking staff list" "$BASE/api/collections/booking_staff/records?perPage=1" "200"

echo ""
echo "=== Filtering ==="
test_endpoint "Available slots" "$BASE/api/collections/time_slots/records?filter=(status=%22available%22)&perPage=1" "200"
test_endpoint "Active rooms" "$BASE/api/collections/rooms/records?filter=(is_active=true)&perPage=1" "200"

echo ""
echo "=== Results ==="
echo "  Passed: $PASS / $((PASS + FAIL))"
if [ $FAIL -gt 0 ]; then
  echo "  Failed: $FAIL"
  exit 1
else
  echo "  All tests passed! ✅"
fi
