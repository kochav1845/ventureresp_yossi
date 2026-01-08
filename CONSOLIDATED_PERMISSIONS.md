# Consolidated Permission System

## From 74 permissions → 27 permissions

Each permission has 4 checkboxes: View ✓ | Create + | Edit ✏️ | Delete 🗑️

---

## Dashboard & Analytics (3)

1. **dashboard_main** - Main Dashboard
   - View: See main dashboard
   - Create: N/A
   - Edit: N/A
   - Delete: N/A

2. **analytics_basic** - Basic Analytics
   - View: Invoice Analytics, Payment Analytics, Invoice Status Analytics
   - Create: N/A
   - Edit: N/A
   - Delete: N/A

3. **analytics_advanced** - Advanced Analytics
   - View: Revenue Analytics, Customer Analytics, Collector Performance, User Activity, Email Analytics, Stripe Analytics, Comprehensive Dashboard
   - Create: N/A
   - Edit: N/A
   - Delete: N/A

---

## Customer Management (1)

4. **customers** - Customers
   - View: View customer list, details, files, reports
   - Create: Add new customers
   - Edit: Edit customer info, upload files, manage assignments
   - Delete: Delete customers

---

## Invoice Management (1)

5. **invoices** - Invoices
   - View: View invoice list, details, memos
   - Create: Create invoices (if applicable)
   - Edit: Edit invoice info, change status (red/yellow/green), add memos
   - Delete: Delete invoices

---

## Payment Management (1)

6. **payments** - Payments
   - View: View payment list, details, applications, check images
   - Create: Create payments (if applicable)
   - Edit: Edit payment info
   - Delete: Delete payments

---

## Email System (1)

7. **emails** - Email System
   - View: View inbox, email templates, formulas, logs
   - Create: Create templates, formulas
   - Edit: Send emails, reply to emails, edit templates
   - Delete: Delete emails, templates

---

## Reminders (1)

8. **reminders** - Reminders
   - View: View all reminders
   - Create: Create new reminders
   - Edit: Edit existing reminders
   - Delete: Delete reminders

---

## Collection Management (2)

9. **my_assignments** - My Assignments
   - View: View assigned customers and tickets
   - Create: N/A
   - Edit: Update ticket status
   - Delete: N/A

10. **collection_ticketing** - Collection Ticketing
   - View: View all collection tickets
   - Create: Create tickets
   - Edit: Update tickets, manage follow-ups
   - Delete: Delete tickets

---

## Reports & Documents (1)

11. **reports** - Reports & Documents
   - View: View monthly reports, custom reports, system documentation
   - Create: Generate new reports
   - Edit: Edit custom reports
   - Delete: Delete reports

---

## Stripe System (1)

12. **stripe** - Stripe Payments
   - View: View Stripe payments, webhooks
   - Create: Create payment links
   - Edit: Manage Stripe settings
   - Delete: N/A

---

## Monitoring & Logs (1)

13. **monitoring** - System Monitoring
   - View: View sync logs, webhook logs, scheduler logs, cron monitor, sync status
   - Create: N/A
   - Edit: N/A
   - Delete: Clear logs

---

## System Administration (6)

14. **admin_users** - User Management
   - View: View users, activity logs
   - Create: Approve new users
   - Edit: Edit user roles, permissions, impersonate users
   - Delete: Delete users

15. **admin_roles** - Role Management
   - View: View roles and permissions
   - Create: Create new roles
   - Edit: Edit role permissions
   - Delete: Delete roles

16. **admin_sync_config** - Sync Configuration
   - View: View sync settings
   - Create: N/A
   - Edit: Configure Acumatica sync
   - Delete: N/A

17. **admin_webhooks** - Webhook Configuration
   - View: View webhook settings
   - Create: Create webhooks
   - Edit: Configure webhooks
   - Delete: Delete webhooks

18. **admin_collector_control** - Collector Management
   - View: View collector control panel, monitor collectors
   - Create: Assign collectors
   - Edit: Manage collector settings
   - Delete: Remove collector assignments

19. **admin_dashboard** - Admin Dashboard
   - View: Access admin dashboard
   - Create: N/A
   - Edit: N/A
   - Delete: N/A

---

## Acumatica Integration (1)

20. **acumatica** - Acumatica Integration
   - View: View Acumatica data (customers, invoices, payments)
   - Create: Trigger manual sync
   - Edit: Edit sync settings, manage credentials
   - Delete: N/A

---

## Diagnostic Tools (1)

21. **diagnostics** - Diagnostic Tools
   - View: Access all diagnostic tools (invoice formats, orphaned data, payment applications, sync status)
   - Create: N/A
   - Edit: Run diagnostic fixes
   - Delete: N/A

---

## REMOVED DUPLICATES:

### Customer Management (removed 5, kept 1):
- ❌ customers_view → merged into **customers**
- ❌ customers_edit → merged into **customers**
- ❌ customers_files → merged into **customers**
- ❌ customers_assignments → merged into **customers**
- ❌ customers_reports → merged into **customers**
- ❌ customers_dashboard → merged into **customers**

### Invoice Management (removed 5, kept 1):
- ❌ invoices_view → merged into **invoices**
- ❌ invoices_edit → merged into **invoices**
- ❌ invoices_memos → merged into **invoices**
- ❌ invoices_status → merged into **invoices**
- ❌ invoices_reminders → merged into **invoices** (reminders is separate feature)
- ❌ invoices_acumatica → merged into **acumatica**

### Payment Management (removed 4, kept 1):
- ❌ payments_view → merged into **payments**
- ❌ payments_edit → merged into **payments**
- ❌ payments_applications → merged into **payments**
- ❌ payments_check_images → merged into **payments**
- ❌ payments_acumatica → merged into **acumatica**

### Email System (removed 5, kept 1):
- ❌ email_inbox → merged into **emails**
- ❌ email_send → merged into **emails**
- ❌ email_reply → merged into **emails**
- ❌ email_templates → merged into **emails**
- ❌ email_formulas → merged into **emails**
- ❌ email_logs → merged into **monitoring**

### Analytics (removed 8, kept 2):
- ❌ analytics_dashboard → merged into **analytics_basic**
- ❌ analytics_invoices → merged into **analytics_basic**
- ❌ analytics_payments → merged into **analytics_basic**
- ❌ analytics_invoice_status → merged into **analytics_basic**
- ❌ analytics_revenue → merged into **analytics_advanced**
- ❌ analytics_customer → merged into **analytics_advanced**
- ❌ analytics_collector_performance → merged into **analytics_advanced**
- ❌ analytics_user_activity → merged into **analytics_advanced**
- ❌ analytics_email → merged into **analytics_advanced**
- ❌ analytics_stripe → merged into **analytics_advanced**
- ❌ analytics_comprehensive → merged into **analytics_advanced**

### Monitoring (removed 5, kept 1):
- ❌ logs_sync → merged into **monitoring**
- ❌ logs_webhook → merged into **monitoring**
- ❌ logs_scheduler → merged into **monitoring**
- ❌ monitor_cron → merged into **monitoring**
- ❌ monitor_sync_status → merged into **monitoring**

### Reminders (removed 3, kept 1):
- ❌ reminders_view → merged into **reminders**
- ❌ reminders_create → merged into **reminders**
- ❌ reminders_edit → merged into **reminders**
- ❌ reminders_delete → merged into **reminders**

### Diagnostic Tools (removed 4, kept 1):
- ❌ diagnostics_invoice_formats → merged into **diagnostics**
- ❌ diagnostics_orphaned_data → merged into **diagnostics**
- ❌ diagnostics_payment_applications → merged into **diagnostics**
- ❌ diagnostics_sync_status → merged into **diagnostics**

### Acumatica (removed 4, kept 1):
- ❌ acumatica_customers → merged into **acumatica**
- ❌ acumatica_sync → merged into **acumatica**
- ❌ acumatica_test → merged into **diagnostics**
- ❌ acumatica_credentials → merged into **acumatica**

### Reports (removed 3, kept 1):
- ❌ reports_custom → merged into **reports**
- ❌ reports_monthly → merged into **reports**
- ❌ documents_view → merged into **reports**

### User Management (removed 3, kept in admin_users):
- ❌ users_approval → merged into **admin_users**
- ❌ users_activity_log → merged into **admin_users**
- ❌ users_impersonation → merged into **admin_users**

### Stripe (removed 2, kept 1):
- ❌ stripe_payments → merged into **stripe**
- ❌ stripe_webhooks → merged into **stripe**

### Collector Management (removed 2, kept 1):
- ❌ collector_control_panel → merged into **admin_collector_control**
- ❌ collector_monitoring → merged into **admin_collector_control**

---

## Total Reduction: 74 → 21 core permissions

Much cleaner! Each permission uses the 4 checkboxes to control all related functionality.
