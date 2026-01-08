# Permissions System - Quick Reference

## System Overview

**Total Permissions**: 70 permissions across 16 categories
**Roles**: Admin, Manager, Collector, Secretary, Viewer

---

## At A Glance

### Admin (70 permissions)
Everything with appropriate access level

### Manager (53 permissions)
Operations, analytics, customer management, collections

### Collector (23 permissions)
Assigned customers, ticketing, status changes, emails

### Secretary (19 permissions)
Files, reports, memos, customer communications

### Viewer (16 permissions)
Read-only access to core data

---

## Key Permission Rules

### VIEW ONLY Features
✓ All Analytics (calculated data)
✓ All Logs (system-generated)
✓ Acumatica Data (syncs automatically)
✓ All Monitoring Tools
✓ Payment Information

### EDITABLE Features
✓ Customer Information
✓ Invoice Status (color coding)
✓ Invoice Memos
✓ Email Templates
✓ Collection Tickets
✓ Reminders

### CREATE Features
✓ Email Templates
✓ Customer Assignments
✓ Collection Tickets
✓ Reminders
✓ Reports

### DELETE Features (Limited)
✓ Admin: Customer assignments, templates, memos
✓ All Users: Own reminders
✓ Manager: Email templates/formulas, reminders

---

## What Changed

### Added New Permissions For:
- Collection Ticketing System
- Collector Management & Monitoring
- Advanced Analytics (Revenue, Customer, Email, Stripe, User Activity)
- User Approval System
- Diagnostic Tools
- My Assignments View
- Stripe Payment System

### Refined Permission Types:
- Analytics → VIEW ONLY (was incorrectly allowing create/edit)
- Logs → VIEW ONLY (system-generated)
- Acumatica Data → VIEW ONLY (syncs externally)
- Payments → VIEW ONLY (syncs externally)

### Improved Role Assignments:
- Collector: Focus on assigned customers and collection operations
- Secretary: Administrative support with file management
- Manager: Full operational control except admin functions
- Viewer: Pure read-only access
- Admin: Everything with appropriate access levels

---

## Permission Categories

1. **Dashboard & Analytics** (5) - Dashboards and basic analytics
2. **Advanced Analytics** (7) - Revenue, Customer, Collector, User, Email, Stripe
3. **Customer Management** (6) - View, Edit, Files, Reports, Assignments
4. **Invoice Management** (6) - View, Status, Memos, Reminders
5. **Payment Management** (5) - View payments and applications
6. **Email System** (6) - Inbox, Send, Reply, Templates, Formulas, Logs
7. **Reports & Documents** (3) - Monthly reports, custom reports, docs
8. **Reminders System** (4) - View, Create, Edit, Delete reminders
9. **Collection Management** (3) - Ticketing, Assignments, Control Panel
10. **Collector Management** (1) - Performance monitoring
11. **System Administration** (6) - Users, Roles, Sync, Webhooks, Config
12. **User Management** (3) - Approval, Activity Log, Impersonation
13. **Acumatica Integration** (4) - View data, Sync, Test, Credentials
14. **Stripe System** (2) - Payments portal, Webhooks
15. **Monitoring & Logs** (5) - Scheduler, Sync, Webhook, Cron, Status
16. **Diagnostic Tools** (4) - Payment, Invoice, Sync, Orphaned data

---

## Verification Queries

### Check User Permissions
```sql
SELECT * FROM user_permissions_summary
WHERE user_id = 'user-uuid-here'
ORDER BY category, permission_name;
```

### Check Role Permissions
```sql
SELECT sp.permission_name, sp.category,
       rp.can_view, rp.can_create, rp.can_edit, rp.can_delete
FROM role_permissions rp
JOIN system_permissions sp ON sp.permission_key = rp.permission_key
WHERE rp.role = 'collector'
ORDER BY sp.category;
```

### Check Permission Count by Role
```sql
SELECT role, COUNT(*) as permission_count
FROM role_permissions
GROUP BY role
ORDER BY role;
```

---

## Common Use Cases

**Scenario**: Collector needs to see their performance metrics
**Solution**: Already has access via `analytics_comprehensive` and `my_assignments`

**Scenario**: Manager wants to approve new users
**Solution**: Add custom permission `users_approval` or promote to Admin

**Scenario**: Secretary needs to change invoice status
**Solution**: Add custom permission `invoices_status` with EDIT enabled

**Scenario**: Viewer needs to generate reports for executives
**Solution**: Add custom permission `reports_monthly` with CREATE enabled

---

## Database Tables

- `system_permissions` - Master list (70 permissions)
- `role_permissions` - Default by role (296 total assignments)
- `user_custom_permissions` - Per-user overrides
- `user_permissions_summary` VIEW - Combined effective permissions

---

## Security Features

✓ Row Level Security (RLS) on all tables
✓ Only admins can modify permissions
✓ Audit trail with timestamps and user tracking
✓ Custom overrides for flexibility
✓ Permission inheritance (role + custom)

---

## Files Created

- `UPDATED_PERMISSIONS_SUMMARY.md` - Detailed technical documentation
- `ROLE_PERMISSIONS_BREAKDOWN.md` - Feature-by-feature role comparison
- `PERMISSIONS_QUICK_REFERENCE.md` - This file (quick lookup)

---

## Next Steps

1. Update frontend components to check permissions
2. Filter navigation menus by user permissions
3. Show/hide action buttons based on permissions
4. Add permission checks to Edge Functions
5. Integrate with user management UI
6. Test each role thoroughly
