#!/bin/bash

echo "Monitoring backfill progress (Ctrl+C to stop)..."
echo ""

while true; do
  # Get current counts
  STATS=$(curl -s -X POST "https://leipneymocoksmajxnok.supabase.co/rest/v1/rpc/execute_sql" \
    -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxlaXBuZXltb2Nva3NtYWp4bm9rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzAxMzIyNTksImV4cCI6MjA0NTcwODI1OX0.3j_yoTAJzCrZKEKnYQeX4MXDwvFwNJFBpBPz0yikU_8" \
    -H "Content-Type: application/json" \
    -d '{"query":"SELECT (SELECT COUNT(*) FROM payment_invoice_applications) as apps, (SELECT COUNT(*) FROM payment_attachments) as files, (SELECT COUNT(*) FROM sync_change_logs WHERE sync_source = '\''manual_backfill'\'') as log_entries"}')

  # Clear screen and show stats
  clear
  echo "=========================================="
  echo "BACKFILL PROGRESS MONITOR"
  echo "=========================================="
  echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "Payment Applications: $(echo $STATS | grep -o '"apps":[0-9]*' | grep -o '[0-9]*')"
  echo "Payment Attachments:  $(echo $STATS | grep -o '"files":[0-9]*' | grep -o '[0-9]*')"
  echo "Sync Log Entries:     $(echo $STATS | grep -o '"log_entries":[0-9]*' | grep -o '[0-9]*')"
  echo ""
  echo "Refreshing every 5 seconds..."
  echo "Press Ctrl+C to stop monitoring"
  echo "=========================================="

  sleep 5
done
