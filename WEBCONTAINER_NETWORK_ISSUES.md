# WebContainer Network Issues - Troubleshooting Guide

## The Problem

You're seeing network errors like:
- "Failed to fetch"
- "Connection terminated due to connection timeout"
- "Failed to run sql query: Connection terminated"

This is happening because:

1. **WebContainer Environment**: The preview environment runs in a browser-based sandbox (WebContainer)
2. **Network Restrictions**: WebContainers have security restrictions that can block or timeout external API calls
3. **Supabase Connection**: Your app needs to connect to Supabase, but the connection is being blocked or timing out
4. **Query Timeouts**: Database queries may timeout before completing due to network latency

## Quick Fixes

### Option 1: Refresh the Page (Fastest)
Simply refresh your browser:
- **Windows/Linux**: Press `Ctrl + R` or `F5`
- **Mac**: Press `Cmd + R`

Sometimes the connection establishes on the second or third try.

### Option 2: Open in New Tab
Right-click on the preview URL and select "Open in new tab". This sometimes bypasses the WebContainer restrictions.

### Option 3: Use Connection Diagnostic
Navigate to `/connection-test` to run automated diagnostics and see exactly what's failing.

### Option 4: Download and Run Locally (Most Reliable)

```bash
# Clone or download the project
cd project-directory

# Install dependencies
npm install

# Run the development server
npm run dev
```

When running locally, you won't have these WebContainer restrictions.

## What We've Implemented

To help with this issue, we've added:

1. **Retry Logic with Timeout Protection**:
   - All database queries now retry up to 3 times with exponential backoff
   - 10-second timeout on all queries to prevent indefinite hanging
   - Automatic network error detection and graceful fallback

2. **Error Boundary**:
   - Global error handler that catches connection failures
   - User-friendly error messages with actionable solutions
   - Automatic detection of connection vs. application errors

3. **Better Error Messages**:
   - Clear error messages with links to diagnostics
   - Environment-specific troubleshooting tips
   - Direct links to connection testing tools

4. **Connection Diagnostic Tool**:
   - Available at `/connection-test` to identify the exact issue
   - Tests environment configuration, network, auth, and database
   - WebContainer-specific guidance and solutions

5. **WebContainer Detection**:
   - The sign-in page shows a warning when it detects the WebContainer environment
   - Proactive guidance before errors occur
   - Links to troubleshooting resources

6. **Optimized Supabase Client**:
   - Reduced connection overhead
   - Better timeout handling
   - Improved error recovery

## Why This Happens

WebContainer is a browser-based Node.js runtime that runs entirely in your browser. While it's great for quick previews, it has security restrictions that can interfere with external API calls. This is not a bug in your application - it's a limitation of the preview environment.

## Production Deployment

When you deploy this application to a real server or hosting platform (Vercel, Netlify, etc.), these issues will not occur. The WebContainer restrictions only apply to the browser-based preview environment.

## Need Help?

If none of these solutions work:
1. Check the browser console for specific error messages
2. Try a different browser
3. Check if your network has a firewall blocking Supabase domains
4. Verify the Supabase project is not paused
