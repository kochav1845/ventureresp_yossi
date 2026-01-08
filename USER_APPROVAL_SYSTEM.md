# User Account Approval System

## Overview

A comprehensive user registration and approval system that requires administrator approval before new users can access the system. This ensures only authorized personnel can access sensitive business data.

## Features

### 1. Self-Service Registration
- Users can create their own accounts with email and password
- Full name collection during registration
- Password requirements enforced (minimum 6 characters)
- Automatic status set to "pending" upon registration

### 2. Approval Workflow

#### For New Users:
1. User fills out registration form with:
   - Full Name
   - Email Address
   - Password

2. After submission, user sees "Account Pending Approval" screen:
   - Clear message that account is under review
   - Expected timeline (1-2 business days)
   - Option to return to sign-in

3. User cannot access the system until approved

#### For Administrators:
1. Access the **User Approval Panel** from the admin dashboard
2. See all pending, approved, and rejected accounts
3. For each pending user, can:
   - View full registration details (name, email, registration date)
   - **Approve as Employee** - Assign role (Collector, Manager, Secretary, Viewer, Developer)
   - **Approve as Customer** - Mark as customer account for payment portal access
   - **Reject** - Deny access with reason

### 3. Account Status Types

| Status | Description | Access |
|--------|-------------|---------|
| **Pending** | Newly registered, awaiting admin review | No access - shown waiting screen |
| **Approved** | Admin approved with assigned role | Full access based on role |
| **Customer** | Approved as customer account | Access to payment portal only |
| **Rejected** | Admin rejected with reason | No access - shown rejection message |

### 4. Sign-In Behavior

When a user attempts to sign in:

- **Pending Account**: Shown waiting screen, automatically signed out
- **Rejected Account**: Shown rejection reason, automatically signed out
- **Approved Account**: Granted access to appropriate dashboard
- **Customer Account**: May have limited access (future implementation)

## User Interface

### Registration Screen
- Clean, branded interface
- Fields:
  - Full Name (required)
  - Email Address (required)
  - Password (required, min 6 characters)
- Toggle between "Sign In" and "Create Account"
- Modern gradient design with logo

### Waiting for Approval Screen
- Yellow clock icon
- Clear messaging about pending status
- Estimated timeline information
- Back to sign-in button

### Rejection Screen
- Red alert icon
- Clear messaging about rejection
- Displays rejection reason from admin
- Contact administrator suggestion
- Back to sign-in button

### Admin Approval Panel
- Search and filter capabilities
- Filter by status: All, Pending, Approved, Rejected
- For each user shows:
  - Profile picture placeholder (initials)
  - Full name and email
  - Registration date
  - Requested role (if any)
  - Current status badge
  - Review button for pending accounts

#### Review Modal
- Full account information display
- Checkbox: "This is a customer account"
- Role selection dropdown (if not customer):
  - Collector
  - Manager
  - Secretary
  - Viewer
  - Developer
- Rejection reason text area (optional, for rejections)
- Action buttons:
  - Cancel
  - Reject (requires reason)
  - Approve / Approve as Customer

## Database Schema

### user_profiles Table - New Columns

```sql
account_status text DEFAULT 'pending'
  CHECK (account_status IN ('pending', 'approved', 'rejected', 'customer'))

requested_role text
  -- What role the user requested (if applicable)

approved_by uuid REFERENCES user_profiles(id)
  -- Which admin approved/rejected the account

approved_at timestamptz
  -- When the decision was made

rejection_reason text
  -- Reason for rejection (shown to user)

full_name text
  -- User's full name collected during registration
```

### Database Functions

#### `approve_user_account()`
```sql
Parameters:
  - p_user_id: uuid (user to approve)
  - p_assigned_role: text (role to assign)
  - p_is_customer: boolean (mark as customer?)

Security: Only admins can call this function
Logs: Creates activity log entry
```

#### `reject_user_account()`
```sql
Parameters:
  - p_user_id: uuid (user to reject)
  - p_reason: text (rejection reason)

Security: Only admins can call this function
Logs: Creates activity log entry
```

### Triggers

#### `handle_new_user_signup()`
- Automatically sets new accounts to 'pending' status
- Clears role field (assigned only after approval)
- Runs on INSERT to user_profiles

## Security

### Row Level Security (RLS)
- Users can only view their own profile
- Admins and managers can view all profiles
- Approval functions are SECURITY DEFINER (run as function owner)
- Only admins can approve/reject accounts

### Existing Account Protection
- All existing accounts automatically set to 'approved' during migration
- No disruption to current users
- Backward compatible with existing authentication flow

## Migration

**Migration File**: `add_user_approval_system.sql`

**What it does**:
1. Adds new columns to user_profiles
2. Sets all existing accounts to 'approved'
3. Creates approval/rejection functions
4. Updates RLS policies
5. Creates trigger for new signups

**Safe to run**: Yes - existing users unaffected

## Usage Guide

### For New Users

1. Go to the sign-in page
2. Click "Don't have an account? Sign up"
3. Fill in:
   - Your full name
   - Email address
   - Password (at least 6 characters)
4. Click "Create Account"
5. You'll see a "pending approval" message
6. Wait for admin to approve your account (usually 1-2 business days)
7. Once approved, sign in with your credentials

### For Administrators

1. Log in to the admin dashboard
2. Click on "User Approval" card
3. Review pending accounts:
   - Click "Review" on any pending user
   - Verify the user's information
   - Decide:
     - **Employee**: Select their role and click "Approve"
     - **Customer**: Check "This is a customer account" and click "Approve as Customer"
     - **Unknown**: Enter rejection reason and click "Reject"
4. User will be notified of decision on next sign-in attempt

## Activity Logging

All approval/rejection actions are logged to `user_activity_logs`:
- Action type: `account_approved` or `account_rejected`
- Admin who made the decision
- Timestamp
- Details: role assigned, reason for rejection, etc.

## Future Enhancements

Potential additions:
1. **Email Notifications**
   - Notify users when account is approved/rejected
   - Send to admin when new account is pending

2. **Bulk Actions**
   - Approve multiple accounts at once
   - Batch rejection with same reason

3. **Role Requests**
   - Users can request specific roles during signup
   - Admins see requested role in review

4. **Account Expiration**
   - Auto-reject accounts pending too long
   - Configurable timeout period

5. **Audit Trail**
   - View history of all approval decisions
   - Filter by admin, date range, decision type

## Troubleshooting

### User Can't Sign In After Approval

**Check**:
1. Verify account_status is 'approved' in database
2. Check that role is assigned (not NULL)
3. Verify RLS policies are enabled
4. Check browser console for errors

**Fix**:
```sql
-- Manually approve if needed
UPDATE user_profiles
SET account_status = 'approved', role = 'collector'
WHERE email = 'user@example.com';
```

### Admin Panel Shows No Pending Users

**Check**:
1. Verify trigger is active: `handle_new_user_signup`
2. Check if accounts exist: `SELECT * FROM user_profiles WHERE account_status = 'pending'`
3. Verify RLS policies allow admin to view

### New Registrations Get "Database Error"

**Check**:
1. user_profiles table has all required columns
2. Trigger function exists and is valid
3. Check Supabase logs for detailed error
4. Verify account_status CHECK constraint

## API Integration

If you need to integrate with external systems:

### Check Account Status
```typescript
const { data, error } = await supabase
  .from('user_profiles')
  .select('account_status, rejection_reason')
  .eq('email', userEmail)
  .single();

if (data?.account_status === 'pending') {
  // Show waiting message
} else if (data?.account_status === 'rejected') {
  // Show rejection message
} else {
  // Allow access
}
```

### Approve Account Programmatically
```typescript
const { error } = await supabase.rpc('approve_user_account', {
  p_user_id: userId,
  p_assigned_role: 'collector',
  p_is_customer: false
});
```

## Benefits

### Security
- Prevents unauthorized access
- Admin controls who can access sensitive data
- Clear audit trail of all approvals

### Flexibility
- Supports both employee and customer accounts
- Easy role assignment
- Can reject unknown registrations

### User Experience
- Self-service registration
- Clear messaging at each step
- No frustration from being locked out without explanation

### Administration
- Centralized approval interface
- Search and filter capabilities
- Quick decision-making process
