# Updated Permissions System - Summary

## Overview
The permission system has been completely audited and updated to reflect all features in your application. The system now properly assigns appropriate permission types (view/create/edit/delete) based on the nature of each feature.

## Key Changes Made

### 1. Permission Structure Refinements

**Analytics & Reports (VIEW ONLY)**
- All analytics features are now VIEW ONLY since they display calculated data
- No create/edit/delete permissions for dashboards and analytics
- Includes: Revenue Analytics, Customer Analytics, Collector Performance, User Activity, Email Analytics, Stripe Analytics

**Data from External Systems (VIEW ONLY)**
- Acumatica data (Customers, Invoices, Payments) is VIEW ONLY
- Data syncs automatically from Acumatica, so no manual creation/editing
- Status changes and memos are the only editable aspects

**Logs & Monitoring (VIEW ONLY)**
- All system logs are VIEW ONLY
- Includes: Scheduler Logs, Sync Logs, Webhook Logs, Cron Monitor
- Logs are system-generated and should not be modified

**Diagnostic Tools (VIEW ONLY)**
- Diagnostic tools are for troubleshooting and analysis
- No data modification capabilities needed

### 2. New Features Added to Permissions

**Collection Management**
- Collection Ticketing (full CRUD for appropriate roles)
- My Assignments (view customer assignments)
- Collector Control Panel (collector operations management)
- Collector Monitoring (performance tracking)

**Advanced Analytics**
- Revenue Analytics
- Customer Analytics
- Collector Performance Analytics
- User Activity Analytics
- Email Analytics
- Stripe Analytics
- Comprehensive Dashboard

**User Management**
- User Approval (approve/reject pending registrations)
- User Activity Log (detailed activity tracking)
- User Impersonation (admin support feature)

**Stripe System**
- Stripe Payments (payment portal access)
- Stripe Webhooks (webhook diagnostics)

**Diagnostic Tools**
- Payment Application Diagnostics
- Invoice Format Checker
- Sync Diagnostics
- Orphaned Data Diagnostics

## Role-Based Permission Summary

### Admin (70 permissions)
- **Full Access**: Complete control over all features
- **Key Capabilities**:
  - Manage users, roles, and permissions
  - Configure system settings and integrations
  - Access all analytics and reports
  - Manage customer assignments
  - Control collection operations
  - Use diagnostic tools
  - Approve new user registrations

### Manager (53 permissions)
- **Operations & Analytics**: Oversee operations and view all analytics
- **Key Capabilities**:
  - View all analytics and reports
  - Manage customer assignments and files
  - Edit invoice status and add memos
  - Manage email templates and formulas
  - Control collection ticketing
  - Monitor collector performance
  - View system logs and monitoring

### Collector (23 permissions)
- **Collection Operations**: Focus on assigned customers and collection tasks
- **Key Capabilities**:
  - View assigned customers only
  - Change invoice status (red/yellow/green)
  - Add invoice memos and reminders
  - Create and manage collection tickets
  - Send emails to customers
  - View payment information
  - Access collection control panel

### Secretary (19 permissions)
- **Administrative Support**: Handle paperwork and customer communications
- **Key Capabilities**:
  - View customer information
  - Upload and manage customer files
  - Add invoice memos
  - Send customer emails
  - Generate reports
  - Create reminders

### Viewer (16 permissions)
- **Read-Only Access**: View data without modification
- **Key Capabilities**:
  - View dashboards and analytics
  - View customer information
  - View invoices and payments
  - View email inbox
  - View reports and documents

## Permission Categories (70 total permissions)

1. **Dashboard & Analytics** (5 permissions) - VIEW ONLY
2. **Advanced Analytics** (7 permissions) - VIEW ONLY
3. **Customer Management** (6 permissions) - View, Edit, Files, Reports
4. **Invoice Management** (6 permissions) - View, Status Control, Memos
5. **Payment Management** (5 permissions) - VIEW ONLY
6. **Email System** (6 permissions) - Send, Reply, Templates, Formulas
7. **Reports & Documents** (3 permissions) - Generate reports
8. **Reminders System** (4 permissions) - Full CRUD
9. **Collection Management** (3 permissions) - Ticketing, Assignments
10. **Collector Management** (1 permission) - Monitoring
11. **System Administration** (6 permissions) - Admin functions
12. **User Management** (3 permissions) - Approval, Activity Log
13. **Acumatica Integration** (4 permissions) - VIEW ONLY
14. **Stripe System** (2 permissions) - Payments, Webhooks
15. **Monitoring & Logs** (5 permissions) - VIEW ONLY
16. **Diagnostic Tools** (4 permissions) - VIEW ONLY

## Permission Type Guidelines

### VIEW ONLY Features
- Analytics and dashboards (data is calculated)
- System logs (automatically generated)
- Acumatica data (syncs from external system)
- Monitoring tools (display system status)
- Diagnostic tools (analysis only)

### CREATE Permissions
- Email templates and formulas
- Customer assignments
- Collection tickets
- Reminders
- Reports (generate new reports)

### EDIT Permissions
- Customer information
- Invoice status (color coding)
- Invoice memos
- User profiles
- System configuration

### DELETE Permissions
- Limited to specific cases:
  - Admin can delete customer assignments
  - Admin can delete email templates/formulas
  - Users can delete their own reminders
  - Admin can delete memos if needed

## Database Structure

### Tables
- `system_permissions` - Master list of all 70 permissions
- `role_permissions` - Default permissions per role
- `user_custom_permissions` - User-specific permission overrides

### View
- `user_permissions_summary` - Easy lookup of effective user permissions combining role-based and custom overrides

## Security Features

1. **Row Level Security (RLS)** enabled on all permission tables
2. **Only admins** can modify system permissions and role permissions
3. **Users can view** their own permissions
4. **Custom overrides** allow per-user permission adjustments
5. **Audit trail** with updated_by and updated_at timestamps

## Usage in Application

To check if a user has permission:

```typescript
// Get user permissions
const { data: permissions } = await supabase
  .rpc('get_user_permissions', { user_uuid: userId });

// Check specific permission
const canEditInvoices = permissions.find(p =>
  p.permission_key === 'invoices_edit' && p.can_edit
);
```

Or use the view:

```sql
SELECT can_view, can_create, can_edit, can_delete
FROM user_permissions_summary
WHERE user_id = 'user-uuid-here'
AND permission_key = 'invoices_status';
```

## Next Steps

1. **Frontend Integration**: Update components to check permissions before rendering action buttons
2. **Navigation Menu**: Filter menu items based on user permissions
3. **API Protection**: Add permission checks to Edge Functions
4. **Custom Permissions**: Use the user management panel to override permissions for specific users
5. **Testing**: Verify each role has appropriate access to features

## Notes

- The permission system is now aligned with actual features in the application
- Permissions reflect the read-only nature of analytics and external data
- Each role has the minimum necessary permissions for their function
- Custom overrides allow flexibility when needed
- All changes maintain proper security with RLS policies
