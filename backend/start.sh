#!/bin/bash
cd "$(dirname "$0")"

# Create admin if pb_data doesn't exist yet
if [ ! -d "pb_data" ] || [ ! -f "pb_data/data.db" ]; then
  echo "Initializing PocketBase with admin..."
  ./pocketbase migrate
  # Create default admin via CLI
  echo "admin@smartbookings.local" | ./pocketbase admin create --password "admin123456" 2>/dev/null || true
  echo "Admin created: admin@smartbookings.local / admin123456"
fi

echo "Starting PocketBase on http://localhost:8090"
./pocketbase serve --http=0.0.0.0:8090
