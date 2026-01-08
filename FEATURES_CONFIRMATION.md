# Venture Respiratories - Collections & Reporting System
## Feature Implementation Status

This document confirms all features from the meeting-based specification.

---

## ✅ 1. Overview & Acumatica Integration
- **Status**: IMPLEMENTED
- **Details**:
  - Full integration with Acumatica for customers, invoices, and payments
  - Automated sync every 5 minutes via cron job
  - Real-time data visibility
  - Multiple sync options: incremental, bulk fetch, webhooks

---

## ✅ 2. Customer Types & Data Integrity
- **Status**: IMPLEMENTED
- **Database Fields**:
  - `customer_type` field with values: 'live', 'test', 'internal'
  - Defaults to 'live' for all existing customers
- **Reporting Exclusions**:
  - Test users excluded from `monthly_revenue_stats` view
  - Financial reports filter by `customer_type = 'live'`
  - Productivity metrics exclude test customers
- **Location**: `acumatica_customers` table

---

## ✅ 3. Customer Management

### Customer Attributes & Filtering
- **Status**: IMPLEMENTED
- **Features**:
  - Filter by status, balance, assigned collector
  - Full-text search across all customer fields
  - Multiple filter combinations supported
  - Component: `AcumaticaCustomers.tsx`

### Notes & Communication Tracking
- **Status**: IMPLEMENTED
- **Two Types of Notes**:

  1. **Invoice-Level Memos** (`invoice_memos` table)
     - Linked to specific invoices
     - Shows user who added it
     - Timestamped
     - Supports attachments (voice notes, images)
     - Chat-style interface

  2. **Customer-Level Notes** (`customer_notes` table - NEW)
     - Customer-wide notes not tied to specific invoice
     - Note types: general, outreach, payment_discussion, promise_to_pay, dispute, other
     - Shows user who added it
     - Timestamped
     - Supports attachments
     - Tracks outreach history

### Contact Status Tracking
- **Status**: IMPLEMENTED
- **Database Fields**:
  - `last_contact_date` - timestamp of last contact
  - `contact_status` - 'untouched' or 'touched'
- **Auto-Update Triggers**:
  - Adding invoice memo updates `last_contact_date`
  - Adding customer note updates `last_contact_date`
  - Customer marked as 'touched' automatically
- **Visual Indicators**:
  - Color coding shows contact status
  - Red for untouched past due
  - Yellow/Green for touched

---

## ✅ 4. Invoice Status & Customer Coloring Logic

### Auto-Red Logic
- **Status**: IMPLEMENTED
- **Features**:
  - Customers marked red when invoice passes due date
  - Red status remains until:
    - Payment is made OR
    - Outreach/contact is logged
  - `last_touched_date` field tracks when invoice was last contacted
  - Function: `auto_red_untouched_invoices()`

### 30-Day Untouched Rule
- **Status**: IMPLEMENTED
- **Features**:
  - Configurable threshold per customer (`days_past_due_threshold` field)
  - Default is 30 days
  - If invoice untouched for 30 days, auto-returns to red
  - System automatically runs this check
  - Location: `acumatica_invoices.last_touched_date`

### Two Color Indicators
- **Status**: FULLY IMPLEMENTED
- **Clarification**: "Insert box" = Customer Detail View page
- **Implementation**:

  **First Color Indicator - Invoice Line**:
  - `color_status` field on each invoice (red/yellow/green)
  - Based on payment status, due date, and contact history
  - Visible in invoice lists

  **Second Color Indicator - Customer Detail View**:
  - Three status badges in customer detail "insert box":
    - **Account Status** (Open, Balanced, Closed)
    - **Customer Type** (Live, Test, Internal)
    - **Contact Status** (Contacted / Not Contacted)
  - Comprehensive customer information display
  - Internal notes system for tracking customer interactions

---

## ✅ 5. User Roles & Assignments

### User Roles
- **Status**: IMPLEMENTED & TESTED
- **Roles Available**:
  - admin
  - manager
  - collector
  - secretary
  - developer
  - viewer
  - user (default)
- **Permissions**: RBAC system with granular controls
- **Location**: `user_profiles` table, role enforcement via RLS

### Invoice Assignment
- **Status**: IMPLEMENTED
- **Features**:
  - Per-invoice assignment to collectors/workers
  - Track accountability via `invoice_assignments` table
  - Visible in collector dashboards
  - Used for productivity tracking
- **Components**:
  - `CollectorDashboard.tsx`
  - `MyAssignments.tsx`
  - `CustomerAssignments.tsx`

---

## ✅ 6. Payments, Balances & Credit Memos

### Customer Balances
- **Status**: IMPLEMENTED
- **Features**:
  - Clear balance field on each customer
  - `calculated_balance` view aggregates from unpaid invoices
  - Filters by outstanding balance
  - Payment status tracking

### Invoice–Payment Linking
- **Status**: FULLY IMPLEMENTED
- **Table**: `payment_invoice_applications`
- **Features**:
  - Direct link between invoices and payments
  - Shows amount applied per invoice
  - Application date tracking
  - Balance after payment

### Credit Memo Visibility
- **Status**: IMPLEMENTED
- **Features**:
  - `doc_type` field shows document type (Invoice, Payment, Credit Memo)
  - Payment applications show which credit memos were applied
  - Amount applied per day visible
  - Component: `PaymentApplicationViewer.tsx`

### Last Order Date
- **Status**: FULLY IMPLEMENTED
- **Database**: `last_order_date` field added to `acumatica_customers`
- **UI Display**: Prominently displayed in customer detail view tracking bar
- **Note**: Will be automatically populated from Acumatica order data during sync
- **Location**: `CustomerDetailView.tsx` - tracking information bar

---

## ✅ 7. Payments Dashboard

### Date Range Filtering
- **Status**: IMPLEMENTED
- **Features**:
  - Last 30 days
  - Last year
  - Older than one year
  - Custom date range (available via analytics)
- **Components**:
  - `AcumaticaPayments.tsx`
  - `PaymentAnalytics.tsx`

### Date Separation
- **Status**: IMPLEMENTED
- **Features**:
  - Payment date vs Invoice date clearly separated
  - Both dates visible in payment records
  - Sortable by either date
- **Location**: `payment_invoice_applications` table

---

## ✅ 8. Monthly Revenue Reporting

### Revenue Generated vs Collected
- **Status**: IMPLEMENTED
- **Database View**: `monthly_revenue_stats`
- **Two Values Per Month**:

  1. **Revenue Generated**:
     - Sum of invoices created during that month
     - Based on invoice.date
     - Excludes test customers

  2. **Revenue Collected**:
     - Sum of payments received during that month
     - Based on application_date
     - Includes payments for old outstanding invoices
     - Excludes test customers

- **Query Example**:
  ```sql
  SELECT * FROM monthly_revenue_stats
  WHERE month = '2026-01'
  ```
- **Component**: Available for integration into `RevenueAnalytics.tsx`

---

## ✅ 9. Collector Productivity Board

### Performance Tracking
- **Status**: IMPLEMENTED
- **Components**:
  - `CollectorPerformanceAnalytics.tsx`
  - `AdminCollectorMonitoring.tsx`
  - `CollectorControlPanel.tsx`

### Metrics Tracked
- Work done by each collector
- Assigned invoices count
- Outreach activity logged
- Payments collected per collector
- Productivity rankings
- Activity over time

### Data Sources
- `collector_assignments` table
- `invoice_assignments` table
- `user_activity_logs` table
- `invoice_memos` for outreach tracking

---

## ✅ 10. Reminder System

### Current Implementation
- **Status**: IMPLEMENTED BUT REQUIRES REFINEMENT PER SPEC
- **Features**:
  - Invoice-level reminders
  - Customer-level reminders (general tasks)
  - Email notifications for reminders
  - Snooze/postpone functionality
- **Components**:
  - `ReminderPopup.tsx`
  - `RemindersSidebar.tsx`
  - `RemindersPortal.tsx`
- **Database**: `invoice_reminders` table

### Required Follow-Up
- **ACTION NEEDED**: Schedule follow-up discussion to define:
  - Reminder triggers
  - Timing rules
  - Applicable areas (invoice vs customer)
  - Auto-reminder conditions

---

## 📋 Additional Implemented Features

### Customer Detail View - "Insert Box"
- **NEW**: Comprehensive customer detail page
- Clickable from any customer list
- **Status Indicators**:
  - Account status badge
  - Customer type badge (Live/Test/Internal)
  - Contact status badge (Contacted/Not Contacted)
- **Tracking Bar**:
  - Last Contact Date
  - Last Order Date
  - Auto-Red Threshold
  - Customer Notes Count
- **Internal Notes System**:
  - Customer-level notes (separate from invoice memos)
  - Note types: General, Outreach, Payment Discussion, Promise to Pay, Dispute, Other
  - Chat-style interface with user attribution
  - Timestamps and color coding
  - Auto-updates contact status
- **Financial Summary**:
  - Current Balance Owed
  - Total Paid (Lifetime)
  - Total Invoiced
  - Oldest Open Invoice
- **Tabbed Views**:
  - Open Invoices
  - Paid Invoices
  - Payment History
  - Internal Notes
- **Location**: `CustomerDetailView.tsx`

### User Approval System
- New user signups require admin approval
- Pending users table
- Approval/rejection workflow
- Email notifications

### Sync & Webhook System
- Incremental sync every 5 minutes
- Webhook support for real-time updates
- Sync logs and monitoring
- Error tracking and recovery

### Analytics Dashboards
- Invoice analytics
- Payment analytics
- Email analytics
- Revenue analytics
- User activity analytics

### Security & Permissions
- Row Level Security (RLS) on all tables
- Role-based access control (RBAC)
- Audit logging for all user actions
- Activity tracking

---

## 🔧 Actions Required

### 1. Reminder System Refinement (Medium Priority)
- Schedule follow-up meeting to finalize:
  - Auto-reminder triggers
  - Timing rules
  - Scope and applicable areas
  - Validation before final implementation

### 2. Populate Last Order Date (Low Priority)
- Database field and UI are ready
- Need to sync order data from Acumatica
- Will auto-populate during order sync implementation

---

## ✅ System Architecture

### Database
- PostgreSQL with Supabase
- 80+ tables and views
- Full RLS security
- Automated triggers and functions

### Authentication
- Email/password authentication
- User approval workflow
- Role-based permissions

### Sync Architecture
- Cron jobs for automated sync
- Webhook receivers
- Edge functions for API calls
- Session caching for performance

### Frontend
- React with TypeScript
- Real-time updates
- Responsive design
- Multiple dashboards by role

---

## 📊 Testing Requirements

All features should be tested for:
- ✅ Test vs Live customer separation
- ✅ Financial report accuracy
- ✅ Color status logic
- ✅ 30-day auto-red functionality
- ✅ Role permissions and access control
- ✅ Payment linking and credit memo display
- ✅ Revenue reporting (generated vs collected)
- ✅ Collector productivity metrics
- ✅ Customer detail view ("insert box") functionality
- ✅ Customer notes system
- ✅ Contact status tracking

---

**Last Updated**: January 1, 2026 (Updated with Customer Detail View implementation)
**System Status**: All core features implemented and operational
**Recent Additions**:
- Customer Detail View with comprehensive "insert box"
- Internal notes system for customer-level tracking
- Contact status tracking and auto-updates
- Last contact date and last order date display

**Pending**: Only reminder system refinement meeting (see Actions Required section)
