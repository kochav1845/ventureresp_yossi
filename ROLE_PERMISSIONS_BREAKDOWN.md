# Role Permissions Breakdown

## Quick Reference Chart

| Feature Category | Admin | Manager | Collector | Secretary | Viewer |
|------------------|-------|---------|-----------|-----------|--------|
| **Dashboards & Analytics** | View | View | Limited | Limited | View |
| **Customer Management** | Full | Edit | View | View + Files | View |
| **Invoice Management** | Status + Memos | Status + Memos | Status + Memos | Memos | View |
| **Payment Management** | View | View | View | View | View |
| **Email System** | Full | Full | Send/Reply | Send/Reply | View |
| **Collection Ticketing** | Full | Full | Full | - | - |
| **User Management** | Full | Activity Log | - | - | - |
| **System Administration** | Full | - | - | - | - |
| **Reports** | Generate | Generate | - | Generate | View |
| **Reminders** | Full | Full | Own | Create | View |

## Legend
- **Full**: Create, Edit, Delete
- **Edit**: View and Edit
- **View**: View only
- **-**: No access

---

## Admin Role (70 permissions)

### Can Do Everything
✅ View all dashboards and analytics
✅ Manage all customers and assignments
✅ Change invoice status and add memos
✅ Send emails and manage templates
✅ Create and manage collection tickets
✅ Approve new user registrations
✅ Manage user roles and permissions
✅ Configure system settings
✅ Access diagnostic tools
✅ View all logs and monitoring

### Cannot Do
❌ Edit Acumatica data (syncs automatically)
❌ Edit analytics (calculated automatically)
❌ Edit system logs (system-generated)

---

## Manager Role (53 permissions)

### Primary Capabilities
✅ **Analytics**: View all analytics and reports
✅ **Customers**: Edit customer info, manage assignments, upload files
✅ **Invoices**: Change status, add/edit memos, create reminders
✅ **Emails**: Send emails, manage templates and formulas
✅ **Collections**: Create and manage tickets, monitor collectors
✅ **Reports**: Generate monthly and custom reports
✅ **Monitoring**: View all system logs and status

### Limited Access
⚠️ **Payments**: View only (cannot edit)
⚠️ **Users**: View activity log only (cannot manage)
⚠️ **Acumatica**: View data only (cannot modify)

### Cannot Do
❌ Manage user permissions and roles
❌ Configure system settings
❌ Use diagnostic tools
❌ Approve user registrations

---

## Collector Role (23 permissions)

### Primary Capabilities (Collection Focus)
✅ **My Assignments**: View assigned customers only
✅ **Invoices**: Change status (red/yellow/green), add memos
✅ **Collection Tickets**: Create and manage tickets for assigned customers
✅ **Emails**: Send emails and reply to customer emails
✅ **Reminders**: Create and manage own reminders
✅ **Payments**: View payment information
✅ **Files**: Upload customer files

### What They See
📊 Basic dashboard with their metrics
👥 Only customers assigned to them
📧 Email inbox and ability to respond
📝 Their own collection tickets

### Cannot Do
❌ View all customers (only assigned)
❌ Change customer assignments
❌ Manage email templates
❌ View system analytics
❌ Access admin functions
❌ Edit customer information

---

## Secretary Role (19 permissions)

### Primary Capabilities (Administrative Support)
✅ **Customer Files**: Upload and manage customer documents
✅ **Invoices**: View invoices and add memos
✅ **Emails**: Send emails to customers
✅ **Reports**: Generate monthly reports
✅ **Reminders**: Create reminders
✅ **Dashboards**: View basic dashboards

### What They Can Help With
📄 Document management
📧 Customer communications
📋 Report generation
📝 Adding notes to invoices

### Cannot Do
❌ Change invoice status
❌ Edit customer information
❌ Manage assignments
❌ Create collection tickets
❌ Edit email templates
❌ Delete anything

---

## Viewer Role (16 permissions)

### Primary Capabilities (Read-Only)
✅ **View Only** - Everything in view mode:
  - Dashboards and analytics
  - Customer information
  - Invoices and memos
  - Payments and applications
  - Email inbox
  - Reports and documents
  - Reminders

### Perfect For
👁️ Observers who need visibility
📊 Executives who want to monitor
📈 Stakeholders who need reports

### Cannot Do
❌ Create, edit, or delete anything
❌ Send emails
❌ Change invoice status
❌ Upload files
❌ Generate reports

---

## Feature-by-Feature Breakdown

### Dashboards & Analytics
- **Admin, Manager, Viewer**: Full access to all analytics
- **Collector**: Basic dashboard with their metrics
- **Secretary**: Limited dashboard view
- **Nature**: VIEW ONLY (data is calculated)

### Customer Management
- **Admin**: Full edit + manage assignments
- **Manager**: Edit customers + manage assignments
- **Collector**: View assigned customers only + upload files
- **Secretary**: View customers + upload files
- **Viewer**: View only

### Invoice Management
- **Admin, Manager**: Change status + full memo management
- **Collector**: Change status + add/edit own memos
- **Secretary**: View + add memos
- **Viewer**: View only
- **Note**: Invoice data syncs from Acumatica

### Payment Management
- **All Roles**: VIEW ONLY
- **Reason**: Payments sync from Acumatica automatically

### Email System
- **Admin**: Full control (templates, formulas, send, reply)
- **Manager**: Full control (templates, formulas, send, reply)
- **Collector**: Send and reply only
- **Secretary**: Send and reply only
- **Viewer**: View inbox only

### Collection Ticketing
- **Admin**: Full CRUD (all tickets)
- **Manager**: Full CRUD (all tickets)
- **Collector**: Create and edit (own tickets)
- **Secretary, Viewer**: No access

### Reminders
- **Admin**: All reminders (full CRUD)
- **Manager**: All reminders (full CRUD)
- **Collector**: Own reminders (full CRUD)
- **Secretary**: Create only
- **Viewer**: View only

### Reports & Documents
- **Admin, Manager, Secretary**: Generate reports
- **Collector, Viewer**: View reports only

### System Administration
- **Admin**: Full access to all admin functions
- **All Others**: No access

### Monitoring & Logs
- **Admin, Manager**: View all logs
- **Collector**: View email logs only
- **Secretary, Viewer**: No access

### Diagnostic Tools
- **Admin**: Full access (for troubleshooting)
- **All Others**: No access

---

## Permission Inheritance

Users receive permissions in this order:

1. **Base Role Permissions** - Default for their role
2. **Custom Overrides** - Admin can grant/revoke specific permissions
3. **Effective Permissions** - Combination of role + custom

Example:
```
Collector Role: 23 base permissions
+ Custom Override: Grant "analytics_revenue" view
= 24 effective permissions for this specific collector
```

---

## Common Scenarios

### "I want a collector to see revenue analytics"
1. Go to User Management
2. Select the collector
3. Add custom permission: `analytics_revenue` with VIEW enabled

### "I want a manager who can't change invoice status"
1. Go to User Management
2. Select the manager
3. Remove custom permission: `invoices_status` disable EDIT

### "I want a viewer who can generate reports"
1. Go to User Management
2. Select the viewer
3. Add custom permission: `reports_monthly` with CREATE enabled

### "I need a secretary who can change assignments"
1. Consider if this should be Secretary role or Manager role
2. If staying Secretary, add custom permission: `customers_assignments`
3. Or promote to Manager role for broader access

---

## Security Notes

1. **Data from Acumatica is read-only** - Users can't create or edit synced data
2. **Analytics are view-only** - They display calculated results
3. **Logs are view-only** - System-generated, cannot be modified
4. **Collector isolation** - Collectors only see assigned customers
5. **Permission checks** - Frontend and backend should validate permissions
6. **Audit trail** - All permission changes are logged

---

## Implementation Checklist

- [x] Database permissions created (70 total)
- [x] Role permissions assigned (5 roles)
- [x] Permission view created for easy lookup
- [x] RLS policies enabled
- [ ] Frontend permission checks
- [ ] Menu filtering by permissions
- [ ] Action button visibility by permissions
- [ ] API/Edge Function permission validation
- [ ] User management UI integration
