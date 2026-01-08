# Comprehensive Collector Management System

## Overview

A complete management and oversight system for collectors with full control capabilities for collectors and comprehensive monitoring for administrators.

## Features Implemented

### 1. Database Infrastructure

#### New Tables Created:

**collector_assignments**
- Stores detailed assignment information for each collector
- Tracks customer assignments, priority levels, and target amounts
- Includes notes, status, and completion tracking

**collector_email_schedules**
- Manages email scheduling by collectors
- Tracks scheduled, pending, and sent emails
- Links to customers, invoices, and email templates

**invoice_change_log**
- Complete audit trail of all invoice modifications
- Tracks color status changes, balance updates, status changes
- Records who made the change and when

**payment_change_log**
- Complete audit trail of all payment modifications
- Tracks status changes and other payment updates
- Records who made the change and when

#### Enhanced Existing Tables:

- Added `last_modified_by` and `last_modified_at` to `acumatica_invoices`
- Added `last_modified_by` and `last_modified_at` to `acumatica_payments`
- Added `modified_by` to `invoice_status_changes`

### 2. Database Functions & Views

**collector_activity_summary** (View)
- Aggregates all collector activities
- Shows assigned customers, invoices modified, payments modified
- Tracks email scheduling and sending statistics
- Shows last activity timestamp

**get_collector_activity()** (Function)
- Returns detailed daily activity breakdown for a specific collector
- Configurable date range (7, 30, or 90 days)
- Shows invoices modified, payments modified, emails sent per day

**get_invoice_change_history()** (Function)
- Returns complete change history for any invoice
- Shows who made changes, what changed, when it changed

### 3. Automated Triggers

- **Invoice Change Logging**: Automatically logs all invoice modifications
- **Payment Change Logging**: Automatically logs all payment modifications
- **User ID Tracking**: Captures the user making changes for accountability

### 4. Collector Control Panel

A comprehensive interface where collectors have full control over:

#### Invoice Management
- View all invoices for assigned customers
- Change invoice color status (red, yellow, green)
- Search and filter invoices by multiple criteria
- See real-time balance and status information
- All changes are automatically logged

#### Assignment Management
- View all assigned customers
- Create new assignments for customers
- Set priority levels (high, medium, low)
- Add notes and track target collection amounts
- Mark assignments as active or completed

#### Email Scheduling
- Schedule emails to customers
- Link emails to specific invoices
- Use email templates or custom messages
- Track pending, sent, and failed emails
- Full control over scheduling dates

### 5. Admin Collector Monitoring

A powerful admin interface with complete oversight:

#### Dashboard Overview
- Total collector count
- Collectors active today
- Total invoices and payments modified across all collectors
- Total emails sent
- Real-time statistics

#### Individual Collector Monitoring
- Click any collector to see detailed activity
- View activity timeline (7, 30, or 90 days)
- See all recent changes made by that collector
- Track daily activity metrics
- View email performance

#### Change Tracking
- See every invoice change with before/after values
- See every payment change with before/after values
- Filter by collector, date range, or change type
- Complete audit trail for compliance

### 6. Security & Permissions

#### Row Level Security (RLS)
- Collectors can only see their own assignments
- Collectors can only see their own email schedules
- Collectors can only view their own change logs
- Admins and managers have full visibility
- All tables are secured with proper RLS policies

#### Automatic Tracking
- Every invoice/payment change is logged with user ID
- IP address and user agent can be captured
- Timestamps on all activities
- No way to bypass audit trail

## Usage Guide

### For Collectors:

1. **Access Control Panel**
   - Navigate to the Collector Control Panel from your dashboard
   - Select the tab for what you want to manage (Invoices, Assignments, Emails)

2. **Managing Invoices**
   - Search for invoices by number or customer name
   - Filter by status, color, or overdue invoices
   - Click the edit icon next to any color status to change it
   - Select red, yellow, or green - changes save automatically
   - All changes are logged for your protection

3. **Creating Assignments**
   - Click "New Assignment" in the Assignments tab
   - Select a customer from the dropdown
   - Set priority and add notes
   - Save to track your work

4. **Scheduling Emails**
   - Click "Schedule Email" in the Emails tab
   - Select customer and optional invoice
   - Choose email template or write custom message
   - Set date/time for sending
   - System will send automatically

### For Administrators:

1. **Access Monitoring Dashboard**
   - Navigate to Admin Dashboard
   - Click on "Collector Monitoring" card
   - See overview of all collectors

2. **Monitor Individual Collectors**
   - Click "View Details" on any collector
   - See their activity timeline
   - Review all changes they made
   - Filter by date range (7, 30, 90 days)

3. **Audit Changes**
   - Every change shows:
     - What was changed (invoice#, payment#)
     - What field changed (color, status, balance)
     - Old value → New value
     - When it was changed
     - Who made the change

4. **Track Performance**
   - See how many customers each collector is working
   - Track modification counts
   - Monitor email sending efficiency
   - Identify active and inactive collectors

## Database Schema

### collector_assignments
```sql
- id: uuid (primary key)
- collector_id: uuid (foreign key to user_profiles)
- customer_id: text (foreign key to acumatica_customers)
- assigned_date: timestamptz
- assignment_type: text
- priority: text (high/medium/low)
- notes: text
- target_collection_amount: numeric
- status: text (active/completed)
- assigned_by: uuid
- completed_at: timestamptz
```

### collector_email_schedules
```sql
- id: uuid (primary key)
- collector_id: uuid (foreign key to user_profiles)
- customer_id: text (foreign key to acumatica_customers)
- invoice_id: text
- email_template_id: uuid (foreign key to email_templates)
- scheduled_date: timestamptz
- email_type: text
- subject: text
- body: text
- status: text (pending/sent/failed)
- sent_at: timestamptz
- error_message: text
- created_by: uuid
```

### invoice_change_log
```sql
- id: uuid (primary key)
- invoice_id: uuid (foreign key to acumatica_invoices)
- invoice_reference_number: text
- changed_by: uuid (foreign key to user_profiles)
- change_type: text
- field_name: text
- old_value: text
- new_value: text
- change_reason: text
- ip_address: text
- user_agent: text
- created_at: timestamptz
```

### payment_change_log
```sql
- id: uuid (primary key)
- payment_id: uuid (foreign key to acumatica_payments)
- payment_reference_number: text
- changed_by: uuid (foreign key to user_profiles)
- change_type: text
- field_name: text
- old_value: text
- new_value: text
- change_reason: text
- ip_address: text
- user_agent: text
- created_at: timestamptz
```

## API/Functions

### get_collector_activity(p_collector_id uuid, p_days_back integer)
Returns daily activity breakdown for a collector

**Returns:**
- activity_date: date
- invoices_modified: bigint
- payments_modified: bigint
- emails_sent: bigint
- customers_contacted: bigint

### get_invoice_change_history(p_invoice_ref text)
Returns complete change history for an invoice

**Returns:**
- changed_at: timestamptz
- changed_by_email: text
- change_type: text
- field_name: text
- old_value: text
- new_value: text
- change_reason: text

## Benefits

### For Collectors:
- Full control over their assigned accounts
- Easy-to-use interface for managing invoices
- Schedule emails without manual tracking
- Clear visibility of their assignments
- Protected by audit trail

### For Administrators:
- Complete oversight of all collector activities
- Real-time monitoring and reporting
- Full audit trail for compliance
- Identify training needs
- Performance tracking
- Accountability enforcement

### For the Business:
- Improved collection efficiency
- Better accountability
- Compliance-ready audit trails
- Data-driven performance management
- Reduced errors through tracking
- Clear assignment management

## Future Enhancements

Potential additions that could be implemented:

1. **Performance Metrics**
   - Collection rate calculations
   - Response time tracking
   - Success rate metrics

2. **Automated Workflows**
   - Auto-assignment rules
   - Escalation workflows
   - Reminder systems

3. **Reporting**
   - Downloadable reports
   - Scheduled email reports
   - Executive dashboards

4. **Notifications**
   - Real-time alerts for admins
   - Collector notifications
   - Customer response tracking

## Migration Information

Database migration: `create_collector_management_system_v3`

Applied: 2026-01-01

All existing data is preserved. New columns are added with defaults. Triggers are non-destructive and only log changes going forward.
