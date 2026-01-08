#!/bin/bash

# Configuration
BATCH_SIZE=20
TOTAL_PAYMENTS=27975
ENDPOINT="https://leipneymocoksmajxnok.supabase.co/functions/v1/backfill-all-payment-data"

# Calculate total batches
TOTAL_BATCHES=$(( ($TOTAL_PAYMENTS + $BATCH_SIZE - 1) / $BATCH_SIZE ))

echo "=========================================="
echo "Payment Applications & Attachments Backfill"
echo "=========================================="
echo "Total Payments: $TOTAL_PAYMENTS"
echo "Batch Size: $BATCH_SIZE"
echo "Total Batches: $TOTAL_BATCHES"
echo "=========================================="
echo ""

# Initialize counters
SKIP=0
TOTAL_PROCESSED=0
TOTAL_APPS=0
TOTAL_FILES=0
BATCH_NUM=1

# Loop through all batches
while [ $SKIP -lt $TOTAL_PAYMENTS ]; do
  echo "[$BATCH_NUM/$TOTAL_BATCHES] Processing batch starting at $SKIP..."

  # Make the API call
  RESPONSE=$(curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"batchSize\": $BATCH_SIZE, \"skip\": $SKIP}")

  # Parse the response
  PROCESSED=$(echo $RESPONSE | grep -o '"processed":[0-9]*' | grep -o '[0-9]*')
  APPS=$(echo $RESPONSE | grep -o '"applicationsFound":[0-9]*' | grep -o '[0-9]*')
  FILES=$(echo $RESPONSE | grep -o '"filesFound":[0-9]*' | grep -o '[0-9]*')
  REMAINING=$(echo $RESPONSE | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*')

  # Update totals
  TOTAL_PROCESSED=$((TOTAL_PROCESSED + PROCESSED))
  TOTAL_APPS=$((TOTAL_APPS + APPS))
  TOTAL_FILES=$((TOTAL_FILES + FILES))

  # Calculate progress
  PERCENT=$((TOTAL_PROCESSED * 100 / TOTAL_PAYMENTS))

  echo "  → Processed: $PROCESSED payments"
  echo "  → Applications: $APPS | Files: $FILES"
  echo "  → Total Progress: $TOTAL_PROCESSED/$TOTAL_PAYMENTS ($PERCENT%)"
  echo "  → Remaining: $REMAINING"
  echo ""

  # Check if we're done
  if [ "$PROCESSED" = "0" ] || [ $TOTAL_PROCESSED -ge $TOTAL_PAYMENTS ]; then
    echo "✓ Backfill completed!"
    break
  fi

  # Move to next batch
  SKIP=$((SKIP + BATCH_SIZE))
  BATCH_NUM=$((BATCH_NUM + 1))

  # Small delay to avoid rate limiting
  sleep 1
done

echo ""
echo "=========================================="
echo "Backfill Summary"
echo "=========================================="
echo "Total Payments Processed: $TOTAL_PROCESSED"
echo "Total Applications Found: $TOTAL_APPS"
echo "Total Files Found: $TOTAL_FILES"
echo "=========================================="
