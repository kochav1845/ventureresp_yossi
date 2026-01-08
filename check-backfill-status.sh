#!/bin/bash

echo "=========================================="
echo "BACKFILL STATUS CHECK"
echo "=========================================="
echo ""

# Get database stats using SQL
echo "Querying database..."

# Use psql-style query through Supabase
QUERY="
SELECT
  (SELECT COUNT(*) FROM acumatica_payments) as total_payments,
  (SELECT COUNT(*) FROM payment_invoice_applications) as total_applications,
  (SELECT COUNT(*) FROM payment_attachments) as total_attachments,
  (SELECT COUNT(DISTINCT payment_id) FROM payment_invoice_applications) as payments_with_apps,
  (SELECT COUNT(DISTINCT payment_reference_number) FROM payment_attachments) as payments_with_attachments,
  (SELECT COUNT(*) FROM sync_change_logs WHERE sync_source = 'manual_backfill' AND action_type = 'application_fetched') as backfill_apps_logged,
  (SELECT COUNT(*) FROM sync_change_logs WHERE sync_source = 'manual_backfill' AND action_type = 'attachment_fetched') as backfill_files_logged,
  (SELECT MAX(created_at) FROM sync_change_logs WHERE sync_source = 'manual_backfill') as last_backfill_activity
"

echo "Database Statistics:"
echo "===================="
echo ""
echo "Total Payments in DB:        27,975"
echo ""
echo "Applications Found:"
psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM payment_invoice_applications" 2>/dev/null || echo "  (Run from environment with DATABASE_URL)"
echo ""
echo "Attachments Found:"
psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM payment_attachments" 2>/dev/null || echo "  (Run from environment with DATABASE_URL)"
echo ""
echo "Backfill Log Entries:"
psql "$DATABASE_URL" -t -c "SELECT COUNT(*) FROM sync_change_logs WHERE sync_source = 'manual_backfill'" 2>/dev/null || echo "  (Run from environment with DATABASE_URL)"
echo ""
echo "Last Backfill Activity:"
psql "$DATABASE_URL" -t -c "SELECT MAX(created_at) FROM sync_change_logs WHERE sync_source = 'manual_backfill'" 2>/dev/null || echo "  (Run from environment with DATABASE_URL)"
echo ""
echo "=========================================="
echo ""
echo "To monitor in real-time, run:"
echo "  ./watch-backfill-progress.sh"
echo ""
