export interface TourStep {
  target?: string;
  title: string;
  content: string;
  route?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: string;
  delay?: number;
  spotlightPadding?: number;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  steps: TourStep[];
}

export const TOUR_CATEGORIES = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'customer-management', label: 'Customer Management' },
  { id: 'financials', label: 'Financials & Analytics' },
  { id: 'collections', label: 'Collections & Tickets' },
  { id: 'communication', label: 'Communication' },
  { id: 'admin', label: 'Administration' },
  { id: 'data-sync', label: 'Data & Sync' },
  { id: 'reports', label: 'Reports & Statements' },
];

export const TOURS: Tour[] = [
  // ═══════════════════════════════════════════════════════════════════
  //  GETTING STARTED
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'app-overview',
    name: 'Complete App Overview',
    description: 'A thorough walkthrough of the entire application layout, navigation, and core tools.',
    icon: 'compass',
    category: 'getting-started',
    steps: [
      {
        title: 'Welcome to Your Collections Portal',
        content: 'This guided tour will show you every part of the application. Use the arrow keys or click Next/Back to navigate. Press Escape to exit at any time. Let\'s start with the navigation.',
        position: 'center',
      },
      {
        target: '[data-tour="sidebar"]',
        title: 'Navigation Sidebar',
        content: 'This is your main navigation panel. It contains links organized into sections: Customer Management, Invoice Management, Payment Management, Reminders, Administration, Email System, and Developer Settings. Each section groups related tools together.',
        position: 'right',
        route: '/customers',
        delay: 500,
      },
      {
        target: '[data-tour="sidebar-collapse"]',
        title: 'Collapse / Expand Sidebar',
        content: 'Click this arrow to collapse the sidebar into icon-only mode, giving you more screen space for data. Hover over icons to see tooltips. Your preference is saved automatically and persists across sessions.',
        position: 'right',
      },
      {
        target: '[data-tour="global-search"]',
        title: 'Global Search Bar',
        content: 'This powerful search bar lets you find anything in the system instantly. Type a customer name, invoice number, payment reference, or ticket number. Results are grouped by category (Customers, Invoices, Payments, Tickets) and appear as you type. Click any result to jump directly to it.',
        position: 'bottom',
      },
      {
        target: '[data-tour="reminders-btn"]',
        title: 'Reminders Quick Access',
        content: 'This bell icon opens the Reminders panel on the right side of the screen. When you have overdue reminders, it pulses red with an animated indicator. The panel shows upcoming reminders, overdue items, and lets you quickly mark items complete or snooze them.',
        position: 'bottom',
      },
      {
        target: '[data-tour="tour-launcher"]',
        title: 'Guided Tours Menu',
        content: 'You are using this right now! Click this button anytime to access all available guided tours. Tours are organized by category and cover every feature in the system. Great for training new team members.',
        position: 'bottom',
      },
      {
        target: '[data-tour="chat-widget"]',
        title: 'AI Chat Assistant',
        content: 'This floating button opens an AI-powered assistant that can answer questions about your data. Ask things like "What is the balance for Customer X?" or "Show me overdue invoices over $10,000." It can also generate reports, create tickets, and export data to PDF or Excel.',
        position: 'top',
      },
      {
        title: 'You Are All Set!',
        content: 'Those are the core navigation tools available on every page. Now take specific tours for each section -- Customers, Invoices, Payments, Tickets, and more -- to learn every feature in depth. Each tour will walk you through filters, toggles, exports, and all interactive options.',
        position: 'center',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  CUSTOMER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'customers-deep-dive',
    name: 'Customer Management - Complete Guide',
    description: 'Every filter, sort option, toggle, export, and detail view feature in the Customer page.',
    icon: 'users',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Management Deep Dive',
        content: 'The Customers page is the heart of the system. It displays every customer synced from Acumatica with their balances, invoice counts, and collection status. Let\'s explore every feature.',
        position: 'center',
        route: '/customers',
        delay: 600,
      },
      {
        target: '[data-tour="customer-stats"]',
        title: 'Summary Statistics Cards',
        content: 'These cards show real-time metrics: Total Customers with outstanding debt, Total Amount owed across all customers, Average Balance per customer, and the count of customers with high-risk balances. These numbers update based on your active filters.',
        position: 'bottom',
        route: '/customers',
        delay: 800,
      },
      {
        target: '[data-tour="customer-search"]',
        title: 'Search Customers',
        content: 'Type here to search by customer name, email address, or Acumatica customer ID. The search is instant and works with partial matches. Try typing a few letters of a customer name to see results filter in real-time.',
        position: 'bottom',
        route: '/customers',
        action: 'Try typing a customer name to see the instant search in action.',
      },
      {
        target: '[data-tour="customer-filters"]',
        title: 'Advanced Filter Panel',
        content: 'Click the filter icon to expand the advanced filter panel. This reveals powerful filtering options including balance ranges, invoice counts, days overdue thresholds, date ranges, and the ability to exclude credit memos. You can combine multiple filters using AND/OR logic.',
        position: 'bottom',
        route: '/customers',
        action: 'Click the filter button to expand the advanced filters.',
      },
      {
        target: '[data-tour="customer-quick-filters"]',
        title: 'Quick Filter Presets',
        content: 'These preset buttons let you instantly apply common filter combinations: "High Balance" shows customers over $10,000, "Medium Balance" shows $1,000-$10,000, "Many Invoices" filters to customers with 20+ open invoices, "Overdue 90+" shows severely overdue accounts, and "Critical" shows the highest priority customers.',
        position: 'bottom',
        route: '/customers',
        action: 'Click any quick filter button to instantly apply it.',
      },
      {
        target: '[data-tour="customer-sort"]',
        title: 'Sort Options',
        content: 'Sort the customer list by Name, Email, Balance (highest first is default), Invoice Count, Max Days Overdue, Average Days to Collect, or Date Created. Click the sort direction arrow to toggle between ascending and descending order.',
        position: 'bottom',
        route: '/customers',
        action: 'Try changing the sort to "Max Days Overdue" to see the most overdue customers first.',
      },
      {
        target: '[data-tour="customer-exclude-cm"]',
        title: 'Exclude Credit Memos Toggle',
        content: 'Check this box to exclude credit memos from balance calculations. This gives you a view of only the actual outstanding invoice amounts without credit memo offsets. Useful for understanding the true gross receivables per customer.',
        position: 'bottom',
        route: '/customers',
      },
      {
        target: '[data-tour="customer-export"]',
        title: 'Export to Excel',
        content: 'Click this button to export the current customer list to an Excel spreadsheet (.xlsx). The export respects ALL your current filters, search, and sort settings. The file includes customer name, ID, email, balance, invoice count, days overdue, and more.',
        position: 'bottom',
        route: '/customers',
      },
      {
        target: '[data-tour="customer-list"]',
        title: 'Customer Data Table',
        content: 'Each row shows: Customer Name, Acumatica ID, number of open Invoices, Total Amount across all invoices, and Open Balance. The balance is color-coded -- green for low, amber for medium, red for high. Click any row to open the full Customer Detail View.',
        position: 'top',
        route: '/customers',
        action: 'Click on any customer row to open their detail view.',
      },
      {
        title: 'Customer Detail View',
        content: 'When you click a customer, a detailed view opens showing: contact information, all invoices with color-coded statuses and aging, payment history, collection tickets, memos/notes, a balance timeline chart, and email tracking. You can add notes, change invoice colors, set promise dates, and create reminders -- all from this view.',
        position: 'center',
      },
    ],
  },

  {
    id: 'customer-detail-tour',
    name: 'Customer Detail View - All Features',
    description: 'Tabs, filters, color statuses, notes, timeline charts, and every action in the detail view.',
    icon: 'users',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Detail View',
        content: 'The Customer Detail View is where you do most of your collection work. It shows everything about a single customer across multiple tabs. Let\'s explore each section. Open a customer from the Customers page to follow along.',
        position: 'center',
        route: '/customers',
        delay: 600,
      },
      {
        title: 'Customer Header',
        content: 'At the top you see the customer name, Acumatica ID, email, phone, and a link to open them directly in Acumatica ERP. The header also shows the total outstanding balance and a "Notes" section where you can leave internal comments about the customer.',
        position: 'center',
      },
      {
        title: 'Invoice Tabs',
        content: 'The detail view has 5 tabs: Open Invoices (unpaid with balance), Balanced Invoices (fully paid), Paid Invoices (closed), Payments (all payments received), and Email Tracking (emails sent to this customer). Switch tabs to see different slices of the customer\'s data.',
        position: 'center',
      },
      {
        title: 'Invoice Filters Inside Detail',
        content: 'Within each tab, you can further filter invoices by date range, amount range, days overdue, color status (Red/Yellow/Green/Blue), and invoice status. You can also sort by date, amount, or balance in ascending/descending order. An "Exclude Credit Memos" toggle hides credit memo entries.',
        position: 'center',
      },
      {
        title: 'Color Status Assignment',
        content: 'Each invoice has a color dot that indicates its collection priority. Click the dot to change the color: Red (high risk), Yellow (at risk), Green (in good standing), Blue (promise to pay), or custom colors configured by your admin. Color changes are logged in the activity history.',
        position: 'center',
      },
      {
        title: 'Invoice Actions',
        content: 'For each invoice, you can: click the memo icon to add a note, click the calendar icon to set a promise date, click the bell icon to create a reminder, and click the reference number to open it in Acumatica. Memos support file attachments for documents like check images.',
        position: 'center',
      },
      {
        title: 'Customer Notes',
        content: 'The Notes section at the bottom lets you add internal notes about the customer. Each note includes your name, timestamp, and a note type (General, Call Log, Email Follow-up, Payment Promise, Dispute). Notes are visible to all team members working this customer.',
        position: 'center',
      },
      {
        title: 'Balance Timeline Chart',
        content: 'The timeline chart shows how the customer\'s balance has changed over time. It plots monthly snapshots showing total balance, amount overdue, and payment activity. Use this to spot trends -- is the balance going up or down? Are they paying consistently?',
        position: 'center',
      },
    ],
  },

  {
    id: 'customer-analytics-tour',
    name: 'Customer Analytics Dashboard',
    description: 'Preset filters, trend charts, export options, and analytics for your entire customer base.',
    icon: 'bar-chart',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Analytics Dashboard',
        content: 'This dashboard gives you a bird\'s-eye view of your entire customer base. It shows distribution of balances, aging trends, and lets you segment customers using powerful preset and custom filters.',
        position: 'center',
        route: '/customer-analytics',
        delay: 600,
      },
      {
        target: '[data-tour="analytics-stats"]',
        title: 'Key Metric Cards',
        content: 'Six metric cards show: Total Customers in the system, Active Customers with outstanding debt, High Balance accounts (over $10,000), Total Outstanding Balance, Average Balance per customer, and Customers with open invoices. These update dynamically as you apply filters.',
        position: 'bottom',
        route: '/customer-analytics',
        delay: 800,
      },
      {
        target: '[data-tour="analytics-presets"]',
        title: 'Preset Filter Buttons',
        content: 'Quick-access buttons let you instantly filter: "High Balance >$10k" for large accounts, "Medium $5k-$10k" for mid-range, "Balance >$500 & >10 Invoices" for complex accounts, "Many Open Invoices >20" for high-volume customers, and "Critical >$20k OR >30 invoices" for the most urgent cases.',
        position: 'bottom',
        route: '/customer-analytics',
        action: 'Click a preset button to see the data filter instantly.',
      },
      {
        target: '[data-tour="analytics-filters"]',
        title: 'Advanced Custom Filters',
        content: 'Click the Filter icon to open advanced filters: set minimum/maximum balance thresholds, invoice count ranges, amount ranges, date ranges, and combine conditions with AND or OR logic. You can create highly specific customer segments for targeted collection campaigns.',
        position: 'bottom',
        route: '/customer-analytics',
        action: 'Click the filter button to explore the advanced filter options.',
      },
      {
        target: '[data-tour="analytics-chart"]',
        title: 'Trend Timeline Chart',
        content: 'This chart shows how your total receivables have changed over time. You can see the monthly progression of total balance, number of customers with debt, and aging distributions. Hover over any data point to see exact values. This helps you track whether collection efforts are improving or if debt is growing.',
        position: 'top',
        route: '/customer-analytics',
      },
      {
        target: '[data-tour="analytics-sort"]',
        title: 'Sort Options',
        content: 'Sort the customer table by Balance (highest to lowest), Invoice Count, or Customer Name. Toggle ascending/descending to change the order. Combined with filters, this lets you create focused priority lists.',
        position: 'bottom',
        route: '/customer-analytics',
      },
      {
        target: '[data-tour="analytics-export"]',
        title: 'Export Analytics to Excel',
        content: 'Export the filtered customer analytics data to an Excel file. The export includes all columns and respects your current filters and sort order -- perfect for sharing reports with management or importing into other tools.',
        position: 'bottom',
        route: '/customer-analytics',
      },
      {
        title: 'Analytics Complete',
        content: 'Customer Analytics is your strategic planning tool. Use preset filters for quick insights, custom filters for specific segments, and the timeline chart to track trends. Export data regularly for management reporting.',
        position: 'center',
      },
    ],
  },

  {
    id: 'customer-statements-tour',
    name: 'Customer Statements',
    description: 'Generate, preview, and email customer statements with template selection and batch operations.',
    icon: 'file-text',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Statements',
        content: 'The Statements page lets you generate, preview, and send professional customer statements showing all outstanding invoices. You can process individual customers or send batch statements to multiple customers at once.',
        position: 'center',
        route: '/customer-statements',
        delay: 600,
      },
      {
        target: '[data-tour="statement-view-toggle"]',
        title: 'View Toggle: All vs Test Customers',
        content: 'Switch between "All Customers" and "Test Customers." Test mode lets you preview and test statement emails with designated test accounts before sending to real customers. This is a safety feature to verify formatting before mass distribution.',
        position: 'bottom',
        route: '/customer-statements',
        delay: 800,
      },
      {
        target: '[data-tour="statement-stats"]',
        title: 'Summary Statistics',
        content: 'Four cards show: Total Customers with balances, Total Outstanding Balance, Total Open Invoices, and Invoices Overdue 30+ Days. These help you understand the scope of statements you need to send.',
        position: 'bottom',
        route: '/customer-statements',
      },
      {
        target: '[data-tour="statement-actions"]',
        title: 'Statement Actions',
        content: 'Select customers using checkboxes, then use the action buttons to: Generate PDF statements for download, Email statements directly to customers using a template, or Export the customer list to Excel. You can select individual customers or use "Select All" for batch processing.',
        position: 'bottom',
        route: '/customer-statements',
      },
      {
        target: '[data-tour="statement-list"]',
        title: 'Customer List with Expand',
        content: 'Each customer row shows their name, balance, and invoice count. Click the expand arrow to see all their individual invoices with dates, amounts, and aging. Use checkboxes to select which customers should receive statements.',
        position: 'top',
        route: '/customer-statements',
        action: 'Click the expand arrow on a customer to see their invoices.',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  FINANCIALS & ANALYTICS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'invoice-analytics-deep-dive',
    name: 'Invoice Analytics - Complete Guide',
    description: 'Every filter, search, sort, color status, view toggle, and export feature for invoices.',
    icon: 'file-text',
    category: 'financials',
    steps: [
      {
        title: 'Invoice Analytics Deep Dive',
        content: 'The Invoice Analytics page is your central hub for finding, filtering, and analyzing every invoice in the system. It has a powerful sidebar with filters, multiple view modes, and detailed drill-down capabilities.',
        position: 'center',
        route: '/invoice-analytics',
        delay: 600,
      },
      {
        target: '[data-tour="invoice-view-toggle"]',
        title: 'View Mode Toggle: Daily / Monthly / Yearly',
        content: 'Switch between three view modes: Daily shows individual invoices grouped by date, Monthly aggregates invoices by month with totals, and Yearly shows annual summaries. Each mode has its own set of data columns and aggregations.',
        position: 'bottom',
        route: '/invoice-analytics',
        delay: 800,
        action: 'Click "Monthly" or "Yearly" to switch the view mode.',
      },
      {
        target: '[data-tour="invoice-date-nav"]',
        title: 'Date Navigation',
        content: 'Use the left/right arrows to move between months or years. The current period is displayed in the center. You can also click the month or year text to jump to a specific period. The data updates instantly as you navigate.',
        position: 'bottom',
        route: '/invoice-analytics',
        action: 'Click the arrows to navigate between months.',
      },
      {
        target: '[data-tour="invoice-sidebar"]',
        title: 'Filter Sidebar',
        content: 'This sidebar contains ALL filter options: Status (Open, Closed, Voided), Type (Invoice, Credit Memo, Debit Memo), Date Range (From/To), Amount Range (Min/Max), Color Status (Red, Yellow, Green, Blue, No Color), and specific Customer selection. You can collapse the sidebar to see more data.',
        position: 'right',
        route: '/invoice-analytics',
        action: 'Try selecting a filter like "Open" status to narrow results.',
      },
      {
        target: '[data-tour="invoice-search"]',
        title: 'Invoice Search',
        content: 'Search by invoice reference number, customer name, or any text field. The search works across all visible columns and combines with your active filters. For example, search for "CM" to find credit memos, or type a customer name to see all their invoices.',
        position: 'bottom',
        route: '/invoice-analytics',
        action: 'Try typing an invoice number or customer name.',
      },
      {
        target: '[data-tour="invoice-summary"]',
        title: 'Summary Statistics Bar',
        content: 'These numbers update in real-time based on your filters: Total number of matching invoices, their combined Amount, and total remaining Balance. Watch these change as you apply or remove filters.',
        position: 'bottom',
        route: '/invoice-analytics',
      },
      {
        target: '[data-tour="invoice-sort"]',
        title: 'Column Sorting',
        content: 'Click any column header in the table to sort by that field. Click again to reverse the order. You can sort by Reference Number, Customer, Date, Due Date, Type, Amount, Balance, Status, or Color. A small arrow indicator shows the current sort direction.',
        position: 'top',
        route: '/invoice-analytics',
        action: 'Click a column header like "Balance" to sort invoices by amount.',
      },
      {
        target: '[data-tour="invoice-export"]',
        title: 'Export to Excel',
        content: 'Export the current filtered and sorted invoice list to an Excel file. All columns including reference number, customer, dates, amounts, balances, status, and color are included. The export respects all your active filters.',
        position: 'bottom',
        route: '/invoice-analytics',
      },
      {
        target: '[data-tour="invoice-refresh"]',
        title: 'Refresh Data',
        content: 'Click refresh to reload the latest data from the database. Use this after making changes (like updating color statuses) to see the most current information.',
        position: 'bottom',
        route: '/invoice-analytics',
      },
      {
        title: 'Color Statuses in Invoice View',
        content: 'Each invoice row shows a color dot indicating its collection priority. You can click the dot to change it. Red = High Risk, Yellow = Needs Attention, Green = Good Standing, Blue = Promise to Pay. Custom colors can be added by admins. All color changes are logged with timestamp and user.',
        position: 'center',
      },
      {
        title: 'Expandable Customer Groups',
        content: 'In the table, click on a customer group row to expand and see all individual invoices for that customer. This grouped view makes it easy to review all invoices for one customer at a time while still seeing the full list.',
        position: 'center',
      },
      {
        title: 'Invoice Analytics Complete',
        content: 'You now know every feature of Invoice Analytics: view modes (Daily/Monthly/Yearly), date navigation, sidebar filters (status, type, date, amount, color, customer), search, sort, export, and color status management. Combine these tools to create any invoice view you need.',
        position: 'center',
      },
    ],
  },

  {
    id: 'payment-analytics-deep-dive',
    name: 'Payment Analytics - Complete Guide',
    description: 'Every view toggle, date filter, sidebar filter, dashboard chart, export option, and drill-down.',
    icon: 'dollar-sign',
    category: 'financials',
    steps: [
      {
        title: 'Payment Analytics Deep Dive',
        content: 'Payment Analytics tracks every payment, credit memo, prepayment, and refund in the system. It has multiple view modes, powerful filters, and an analytics dashboard for visualizing trends.',
        position: 'center',
        route: '/payment-analytics',
        delay: 600,
      },
      {
        target: '[data-tour="payment-view-toggle"]',
        title: 'View Mode Toggle: Daily / Monthly / Yearly',
        content: 'Switch between Daily (individual payments), Monthly (aggregated by month), and Yearly (annual totals). Each mode shows relevant columns and totals. Monthly view is great for trend analysis, Daily for finding specific payments.',
        position: 'bottom',
        route: '/payment-analytics',
        delay: 800,
        action: 'Click between Daily, Monthly, and Yearly to see different views.',
      },
      {
        target: '[data-tour="payment-date-nav"]',
        title: 'Date Period Navigation',
        content: 'Navigate through time using the arrow buttons. In Daily mode, move by day. In Monthly mode, move by month. In Yearly mode, move by year. The current period is always displayed prominently in the center.',
        position: 'bottom',
        route: '/payment-analytics',
        action: 'Click the arrows to navigate between periods.',
      },
      {
        target: '[data-tour="payment-filters"]',
        title: 'Filter Sidebar',
        content: 'The filter sidebar contains: Status (Open, Closed, Voided), Payment Type (Payment, Prepayment, Credit Memo, Debit Memo, Refund, Balance Write-Off), Date Range (From/To), Amount Range, and Customer selection. Multiple filters combine to narrow results.',
        position: 'right',
        route: '/payment-analytics',
        action: 'Try selecting a payment type filter to see only Payments or Credit Memos.',
      },
      {
        target: '[data-tour="payment-search"]',
        title: 'Payment Search',
        content: 'Search by payment reference number, customer name, or check number. Results filter instantly as you type. Combine with sidebar filters for precise lookups.',
        position: 'bottom',
        route: '/payment-analytics',
      },
      {
        target: '[data-tour="payment-dashboard"]',
        title: 'Analytics Dashboard Toggle',
        content: 'Click this button to show or hide the visual Analytics Dashboard. The dashboard displays charts showing payment timing distribution, collection trends over time, and open invoice aging. Toggle it off when you want more space for the data table.',
        position: 'bottom',
        route: '/payment-analytics',
        action: 'Click to toggle the analytics dashboard on or off.',
      },
      {
        target: '[data-tour="payment-sort"]',
        title: 'Column Sorting',
        content: 'Click any column header to sort payments by that field. Available sorts include: Date, Reference Number, Customer, Type, Amount, Applied Amount, and Balance. Click the same column again to reverse the sort direction.',
        position: 'top',
        route: '/payment-analytics',
      },
      {
        target: '[data-tour="payment-export"]',
        title: 'Export to Excel',
        content: 'Export the current payment view to an Excel spreadsheet. Includes all columns, respects your filters and sort order. The exported file includes payment details, application information, and customer data.',
        position: 'bottom',
        route: '/payment-analytics',
      },
      {
        target: '[data-tour="payment-calendar"]',
        title: 'Payment Data Table',
        content: 'The main table shows payment details. Each row includes the reference number, date, customer, type, amount, and status. Click the expand button on any payment to see its Invoice Applications -- which invoices this payment was applied to, with amounts and dates.',
        position: 'top',
        route: '/payment-analytics',
        action: 'Click the expand arrow on a payment to see its invoice applications.',
      },
      {
        title: 'Payment Analytics Complete',
        content: 'You now know every feature: view modes, date navigation, sidebar filters (status, type, date, amount, customer), search, analytics dashboard, sort, export, and invoice application drill-down. Use this page to track collections and verify payment data accuracy.',
        position: 'center',
      },
    ],
  },

  {
    id: 'payment-breakdown-tour',
    name: 'Payment Breakdown & Reconciliation',
    description: 'Month-by-month payment comparison, sync checks, drill-down, CSV export, and credit memo toggle.',
    icon: 'layers',
    category: 'financials',
    steps: [
      {
        title: 'Payment Breakdown',
        content: 'The Payment Breakdown page shows a month-by-month summary of all payments with reconciliation against Acumatica. Use it to verify data accuracy and find discrepancies between the two systems.',
        position: 'center',
        route: '/payment-breakdown',
        delay: 600,
      },
      {
        target: '[data-tour="breakdown-summary"]',
        title: 'Summary Cards',
        content: 'At the top, cards show: Total Payment Amount across all months, Total Transaction Count, the Date Range covered, and any Sync Issues detected. A green status means everything matches Acumatica.',
        position: 'bottom',
        route: '/payment-breakdown',
        delay: 800,
      },
      {
        target: '[data-tour="pbreakdown-search"]',
        title: 'Search by Month',
        content: 'Type to filter the table to specific months. For example, type "2025" to show only 2025 months, or "Jan" to find January entries.',
        position: 'bottom',
        route: '/payment-breakdown',
      },
      {
        target: '[data-tour="pbreakdown-date-filter"]',
        title: 'Date Range Filter',
        content: 'Click to set a start and end date to limit which months are shown. Useful when you only want to review a specific quarter or year.',
        position: 'bottom',
        route: '/payment-breakdown',
      },
      {
        target: '[data-tour="pbreakdown-exclude-cm"]',
        title: 'Exclude Credit Memos Toggle',
        content: 'Toggle this to exclude credit memo amounts from the totals. This shows only actual cash payments received, giving a cleaner picture of collection performance.',
        position: 'bottom',
        route: '/payment-breakdown',
      },
      {
        target: '[data-tour="breakdown-table"]',
        title: 'Monthly Comparison Table',
        content: 'Each row shows one month with columns for: Transaction Count, Total Amount, and a Sync Status indicator. The sync indicator compares your system totals against Acumatica -- green checkmark means they match, warning icon means there is a discrepancy. Amounts are broken down by type: Payments, Prepayments, Credit Memos, Debit Memos, Voided, Refunds, and Balance Write-offs.',
        position: 'top',
        route: '/payment-breakdown',
        action: 'Click on any month row to drill down and see daily payment details.',
      },
      {
        target: '[data-tour="pbreakdown-export"]',
        title: 'Export to CSV',
        content: 'Download the entire breakdown table as a CSV file for spreadsheet analysis or reporting.',
        position: 'bottom',
        route: '/payment-breakdown',
      },
      {
        title: 'Day-Level Drill-Down',
        content: 'When you click a month row, it expands to show daily payment data. Each day shows transaction counts, amounts by type, and individual sync status. You can further expand each day to see individual payment records.',
        position: 'center',
      },
    ],
  },

  {
    id: 'invoice-breakdown-tour',
    name: 'Invoice Breakdown & Reconciliation',
    description: 'Month-by-month invoice analysis, open balance tracking, sync checks, and day-level drill-down.',
    icon: 'file-text',
    category: 'financials',
    steps: [
      {
        title: 'Invoice Breakdown',
        content: 'The Invoice Breakdown page mirrors the Payment Breakdown but for invoices. It shows monthly invoice summaries with open balance tracking and Acumatica reconciliation.',
        position: 'center',
        route: '/invoice-breakdown',
        delay: 600,
      },
      {
        target: '[data-tour="ibreakdown-search"]',
        title: 'Search Months',
        content: 'Filter the table to specific months by typing. Works with month names and years.',
        position: 'bottom',
        route: '/invoice-breakdown',
        delay: 800,
      },
      {
        target: '[data-tour="ibreakdown-date-filter"]',
        title: 'Date Range Filter',
        content: 'Set a start and end date to focus on a specific time period.',
        position: 'bottom',
        route: '/invoice-breakdown',
      },
      {
        target: '[data-tour="ibreakdown-balance-toggle"]',
        title: 'Show Open Balance Toggle',
        content: 'Toggle this to add an Open Balance column to the table. This shows how much of each month\'s invoiced amount remains unpaid today. Extremely useful for aging analysis and understanding collection progress by period.',
        position: 'bottom',
        route: '/invoice-breakdown',
        action: 'Click to toggle the Open Balance column on.',
      },
      {
        target: '[data-tour="ibreakdown-export"]',
        title: 'Export to CSV',
        content: 'Download the complete invoice breakdown as a CSV file.',
        position: 'bottom',
        route: '/invoice-breakdown',
      },
      {
        title: 'Invoice Month Table',
        content: 'Each month row shows: document count, total amount, and sync status vs Acumatica. Amounts are broken down by type: Invoices, Credit Memos, and Debit Memos. With the balance toggle on, you also see the remaining open balance per month.',
        position: 'center',
      },
      {
        title: 'Day-Level Drill-Down',
        content: 'Click any month to expand and see daily invoice data. Each day shows document counts and amounts by type, with sync status indicators. You can identify exactly which day has discrepancies and drill into individual invoices.',
        position: 'center',
      },
    ],
  },

  {
    id: 'revenue-analytics-tour',
    name: 'Revenue Analytics',
    description: 'Revenue trends, monthly charts, and payment type distribution analysis.',
    icon: 'dollar-sign',
    category: 'financials',
    steps: [
      {
        title: 'Revenue Analytics',
        content: 'Revenue Analytics provides a high-level view of your collection revenue over the past 12 months. It shows total revenue, trends, and breakdowns by payment type.',
        position: 'center',
        route: '/revenue-analytics',
        delay: 600,
      },
      {
        title: 'Revenue Summary Cards',
        content: 'Three cards at the top show: Total Revenue (last 12 months), Average Payment Amount, and Total Payment Count. These give you a quick financial snapshot.',
        position: 'center',
        route: '/revenue-analytics',
        delay: 800,
      },
      {
        title: 'Monthly Revenue Chart',
        content: 'A bar chart shows revenue collected each month for the past 12 months. Hover over any bar to see the exact amount. This visualizes seasonal trends and month-over-month growth or decline in collections.',
        position: 'center',
      },
      {
        title: 'Payment Type Breakdown',
        content: 'The table below the chart breaks down payments by type: Regular Payments, Prepayments, Credit Memos, Debit Memos, and others. For each type, you see the count, total amount, and percentage of total revenue.',
        position: 'center',
      },
    ],
  },

  {
    id: 'voided-payment-tour',
    name: 'Voided Payment Analysis',
    description: 'Analyze voided payments, find patterns, and track reversal reasons.',
    icon: 'dollar-sign',
    category: 'financials',
    steps: [
      {
        title: 'Voided Payment Analysis',
        content: 'This page shows all voided payments in the system. Voided payments indicate reversed transactions and can signal issues like returned checks, disputed charges, or data corrections.',
        position: 'center',
        route: '/voided-payment-analysis',
        delay: 600,
      },
      {
        title: 'Voided Payment Table',
        content: 'The table lists every voided payment with: reference number, customer, original amount, voided date, and the original payment date. You can sort by any column and search for specific payments.',
        position: 'center',
        route: '/voided-payment-analysis',
        delay: 800,
      },
      {
        title: 'Void Patterns',
        content: 'Look for patterns: multiple voids from the same customer may indicate payment problems. Voids clustered around certain dates might point to system issues. Use this data to improve your collection quality.',
        position: 'center',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  COLLECTIONS & TICKETS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'ticketing-deep-dive',
    name: 'Ticketing System - Complete Guide',
    description: 'Create tickets, assign collectors, set priorities, filter by status/type, batch actions, and detail view.',
    icon: 'ticket',
    category: 'collections',
    steps: [
      {
        title: 'Collection Ticketing System',
        content: 'The ticketing system is your primary workflow management tool. It organizes collection efforts by grouping invoices into tickets, assigning them to collectors, and tracking progress through status changes. Let\'s explore every feature.',
        position: 'center',
        route: '/collection-ticketing',
        delay: 600,
      },
      {
        target: '[data-tour="ticket-tabs"]',
        title: 'Status Tabs',
        content: 'Filter tickets by status using these tabs: All (every ticket), Open (newly created), In Progress (actively being worked), and Closed (resolved). Each tab shows a count badge so you can see the distribution at a glance. These statuses can be customized in Settings.',
        position: 'bottom',
        route: '/collection-ticketing',
        delay: 800,
        action: 'Click different tabs to filter tickets by status.',
      },
      {
        target: '[data-tour="ticket-create"]',
        title: 'Create New Ticket',
        content: 'Click "New Ticket" to start the creation flow. You will: 1) Select a customer from a searchable dropdown, 2) Choose which invoices to include, 3) Set priority (Low, Medium, High, Critical), 4) Select a ticket type, 5) Assign a collector, 6) Optionally set a due date and promise date, and 7) Add initial notes.',
        position: 'bottom',
        route: '/collection-ticketing',
        action: 'Click the New Ticket button to see the creation form.',
      },
      {
        target: '[data-tour="ticket-search"]',
        title: 'Search Tickets',
        content: 'Search by ticket number, customer name, or notes content. The search works across all ticket data and combines with your active status tab filter.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-priority-filter"]',
        title: 'Priority Filter',
        content: 'Filter tickets by priority level: Low, Medium, High, or Critical. This helps you focus on the most urgent tickets first. Priority is shown as colored badges on each ticket card.',
        position: 'bottom',
        route: '/collection-ticketing',
        action: 'Select "High" or "Critical" to see only urgent tickets.',
      },
      {
        target: '[data-tour="ticket-type-filter"]',
        title: 'Ticket Type Filter',
        content: 'Filter by ticket type. Types are customizable in Settings and might include categories like "Collections," "Dispute," "Payment Plan," or "Follow-up." This helps organize tickets by the nature of the collection effort.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-collector-filter"]',
        title: 'Assigned Collector Filter',
        content: 'Filter to show only tickets assigned to a specific collector. This is useful for managers reviewing a collector\'s workload or for finding unassigned tickets that need attention.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-batch-actions"]',
        title: 'Batch Actions',
        content: 'Select multiple tickets using checkboxes, then use batch actions to: add notes to all selected tickets at once, change color statuses in bulk, or perform other mass operations. This saves significant time when managing large ticket queues.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-list"]',
        title: 'Ticket Cards',
        content: 'Each ticket card shows: Ticket number, Customer name, Priority badge, Status badge, Ticket type, Assigned collector, Number of invoices, Total balance, Due date, and Promise date. Cards are color-coded by priority. Click any card to open the full Ticket Detail page.',
        position: 'top',
        route: '/collection-ticketing',
        action: 'Click on a ticket card to see the full detail view.',
      },
      {
        title: 'Ticket Detail Page',
        content: 'The detail page shows all ticket information in full. You can change status and priority from dropdowns, add/remove invoices, add memos with attachments, set reminders, change invoice colors, view the complete activity history, and set promise dates. Every action is logged.',
        position: 'center',
      },
    ],
  },

  {
    id: 'ticket-detail-tour',
    name: 'Ticket Detail Page - All Actions',
    description: 'Status changes, priority updates, invoice management, memos, notes, promise dates, and activity history.',
    icon: 'ticket',
    category: 'collections',
    steps: [
      {
        title: 'Ticket Detail Page',
        content: 'The Ticket Detail page is where collectors do their day-to-day work. Open any ticket from the Ticketing System to follow along. Let\'s explore every action available.',
        position: 'center',
        route: '/collection-ticketing',
        delay: 600,
      },
      {
        title: 'Ticket Header',
        content: 'The header shows the ticket number, current status badge, priority badge, customer name, assigned collector, created date, and due date. The ticket number is a unique identifier used for tracking and searching.',
        position: 'center',
      },
      {
        title: 'Change Ticket Status',
        content: 'Use the status dropdown in the sidebar to change the ticket status. Available statuses are configured by admins (default: Open, In Progress, Closed). When changing status, you MUST write a note explaining why -- this creates an audit trail. Status changes are timestamped and logged.',
        position: 'center',
      },
      {
        title: 'Change Priority',
        content: 'Use the priority dropdown to change urgency: Low, Medium, High, or Critical. Priority changes are logged in the activity history. Critical tickets should be addressed within 24 hours.',
        position: 'center',
      },
      {
        title: 'Invoice List',
        content: 'The main section shows all invoices attached to this ticket. Each invoice displays: reference number (clickable link to Acumatica), date, amount, balance, color status, and action icons. You can sort invoices by clicking column headers and toggle between showing/hiding paid invoices.',
        position: 'center',
      },
      {
        title: 'Add & Remove Invoices',
        content: 'Click "Add Invoices" to attach more invoices from the customer\'s open invoices. You can also remove invoices if they were added by mistake. When all invoices on a ticket are paid, the system can automatically close the ticket.',
        position: 'center',
      },
      {
        title: 'Memos & Notes',
        content: 'Click the memo button to add a note to the ticket. Notes support rich text and file attachments (PDFs, images, documents). Notes are visible to all team members and create a complete communication history for each ticket.',
        position: 'center',
      },
      {
        title: 'Promise Dates',
        content: 'Set a promise date when a customer commits to paying by a specific date. The system tracks promise dates and can alert you when a promise date passes without payment. Broken promises are flagged and logged.',
        position: 'center',
      },
      {
        title: 'Set Reminders',
        content: 'Create reminders directly from the ticket to follow up on specific dates. Reminders appear in the Reminders panel and send notifications when due.',
        position: 'center',
      },
      {
        title: 'Activity History',
        content: 'The bottom section shows the complete activity log: every status change, priority change, memo added, invoice added/removed, promise date set, and color change. Each entry shows who did it and when. This is your audit trail.',
        position: 'center',
      },
    ],
  },

  {
    id: 'my-assignments-deep-dive',
    name: 'My Assignments - Collector Workflow',
    description: 'View toggle, ticket cards, batch actions, color statuses, memos, and promise dates.',
    icon: 'clipboard-list',
    category: 'collections',
    steps: [
      {
        title: 'My Assignments',
        content: 'My Assignments is the collector\'s personal workspace. It shows only the tickets and invoices assigned to you. This is where you manage your daily collection work.',
        position: 'center',
        route: '/my-assignments',
        delay: 600,
      },
      {
        target: '[data-tour="ticket-tabs"]',
        title: 'Status Tabs',
        content: 'Same as the main ticketing system -- filter your assignments by Open, In Progress, or Closed status. The counts show how many of YOUR tickets are in each status.',
        position: 'bottom',
        route: '/my-assignments',
        delay: 800,
      },
      {
        title: 'Ticket View',
        content: 'In Ticket view, each card represents one collection ticket with all its invoices grouped together. You can expand a card to see individual invoices, add memos, change colors, and set promise dates -- all without leaving the assignments page.',
        position: 'center',
      },
      {
        title: 'Batch Operations',
        content: 'Select multiple tickets using checkboxes, then use batch actions to: add a note to all selected tickets at once, or change color statuses in bulk. This is efficient when processing many similar tickets.',
        position: 'center',
      },
      {
        title: 'Quick Actions per Ticket',
        content: 'Each ticket card has quick-action buttons: memo icon (add note), color dot (change color status), calendar icon (set promise date), and expand arrow (see all invoices). These let you take action without opening the full detail page.',
        position: 'center',
      },
      {
        title: 'Status Changes from Assignments',
        content: 'You can change a ticket\'s status directly from the card. When you mark a ticket "Closed," you must provide a closing note. The system will automatically close tickets when all invoices are paid.',
        position: 'center',
      },
    ],
  },

  {
    id: 'collector-dashboard-tour',
    name: 'Collector Performance Dashboard',
    description: 'Monitor all collectors, their metrics, assignments, closed tickets, and collected amounts.',
    icon: 'activity',
    category: 'collections',
    steps: [
      {
        title: 'Collector Performance Dashboard',
        content: 'This dashboard gives managers a complete view of every collector\'s performance. It shows assignments, activity, collection metrics, and detailed progress tracking.',
        position: 'center',
        route: '/collector-monitoring',
        delay: 600,
      },
      {
        target: '[data-tour="collector-search"]',
        title: 'Search Collectors',
        content: 'Filter the collector list by name or email. Useful when you have many collectors and need to quickly find one.',
        position: 'bottom',
        route: '/collector-monitoring',
        delay: 800,
      },
      {
        target: '[data-tour="collector-date-range"]',
        title: 'Date Range Selector',
        content: 'Choose a time period for performance metrics: Last 7 days, Last 30 days, Last 60 days, or Last 90 days. This affects the activity counts, amounts collected, and other time-based metrics shown on each collector card.',
        position: 'bottom',
        route: '/collector-monitoring',
        action: 'Try changing the date range to see how metrics shift.',
      },
      {
        target: '[data-tour="collector-sort"]',
        title: 'Sort Collectors',
        content: 'Sort the collector list by: Amount Collected (default), Status Changes made, Total Actions, or Name. This helps identify top performers and those who may need more support.',
        position: 'bottom',
        route: '/collector-monitoring',
      },
      {
        target: '[data-tour="collector-cards"]',
        title: 'Collector Performance Cards',
        content: 'Each collector gets a card showing: assigned customer count, open/closed ticket counts, total balance under management, tickets closed in the period, amount collected, average days to close tickets, login count, and last login time. Click "Expand" to see detailed breakdowns.',
        position: 'top',
        route: '/collector-monitoring',
        action: 'Click the expand button on a collector card to see detailed metrics.',
      },
      {
        title: 'Expanded Collector Details',
        content: 'When expanded, you see: a list of all closed tickets with amounts, collected invoices with individual details, customer-level breakdowns, and activity logs. This gives complete transparency into each collector\'s work.',
        position: 'center',
      },
    ],
  },

  {
    id: 'auto-ticket-rules-tour',
    name: 'Auto-Ticket Rules',
    description: 'Create automated rules to generate tickets based on invoice age, payment history, and combined conditions.',
    icon: 'settings',
    category: 'collections',
    steps: [
      {
        title: 'Auto-Ticket Rules',
        content: 'Auto-Ticket Rules automatically create collection tickets when conditions are met. Instead of manually monitoring every invoice, the system checks your rules on a schedule and creates tickets for invoices that need attention.',
        position: 'center',
        route: '/auto-ticket-rules',
        delay: 600,
      },
      {
        target: '[data-tour="rule-create"]',
        title: 'Create a New Rule',
        content: 'Click "Add Rule" to create a new auto-ticket rule. You will configure: 1) The customer this rule applies to, 2) The condition type (Invoice Age, Payment Recency, or Both), 3) Threshold values, 4) Which collector to assign tickets to, and 5) The ticket priority.',
        position: 'bottom',
        route: '/auto-ticket-rules',
        delay: 800,
        action: 'Click the Add Rule button to see the configuration form.',
      },
      {
        title: 'Condition Types',
        content: 'Three condition types: "Invoice Age Only" triggers when invoices are overdue by X days. "Payment Recency Only" triggers when no payment has been received within X days. "Combined (AND/OR)" lets you combine both conditions -- e.g., overdue 90+ days AND no payment in 60 days.',
        position: 'center',
      },
      {
        target: '[data-tour="rule-list"]',
        title: 'Rules Table',
        content: 'The table shows all configured rules with: Customer name, Condition logic, Threshold values, Assigned collector, Priority, and Active/Inactive status. Each rule has edit, delete, and enable/disable buttons.',
        position: 'top',
        route: '/auto-ticket-rules',
      },
      {
        target: '[data-tour="rule-schedule"]',
        title: 'Daily Schedule',
        content: 'Configure what time the auto-ticket rules run each day. The system checks all active rules at the scheduled time and creates tickets for any matching invoices. Times are shown in your local timezone with EST conversion.',
        position: 'bottom',
        route: '/auto-ticket-rules',
      },
      {
        title: 'Enable / Disable Rules',
        content: 'Use the power icon to enable or disable individual rules without deleting them. Disabled rules are grayed out and will not create tickets. This is useful for temporarily pausing rules during holidays or special periods.',
        position: 'center',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  COMMUNICATION
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'email-system-deep-dive',
    name: 'Email System - Complete Guide',
    description: 'Inbox, folders, templates with variables, formulas with schedules, and email tracking.',
    icon: 'mail',
    category: 'communication',
    steps: [
      {
        title: 'Email System Overview',
        content: 'The Email System handles all collection communication. It includes an Inbox for receiving customer replies, Templates for standardized emails, Formulas for automated scheduling, Assignments for customer-email matching, and Email Tracking for delivery monitoring.',
        position: 'center',
      },
      {
        target: '[data-tour="nav-email-system"]',
        title: 'Email Section in Sidebar',
        content: 'The Email System section in the sidebar contains five sub-pages: Inbox, Assignments, Formulas, Templates, and Email Tracking. Let\'s visit each one.',
        position: 'right',
      },
      {
        target: '[data-tour="inbox-folders"]',
        title: 'Inbox Folders',
        content: 'The Inbox has folder navigation: Inbox (unread messages), Sent (outbound emails), Starred (marked important), and Trash. Each folder shows an unread count badge. Click a folder to filter the email list.',
        position: 'right',
        route: '/inbox',
        delay: 600,
      },
      {
        target: '[data-tour="inbox-search"]',
        title: 'Email Search',
        content: 'Search emails by subject, sender, customer name, or email content. You can also filter by date range, attachment presence, and read/unread status using the advanced filters.',
        position: 'bottom',
        route: '/inbox',
      },
      {
        target: '[data-tour="inbox-list"]',
        title: 'Email List',
        content: 'Each email shows: sender, subject, preview text, date, and attachment indicator. Unread emails are bold. Click any email to open the full view where you can read the content, see the full thread, and reply.',
        position: 'top',
        route: '/inbox',
        action: 'Click an email to open and read it.',
      },
      {
        target: '[data-tour="template-create"]',
        title: 'Create Email Template',
        content: 'Click "New Template" to create a reusable email template. Templates support variables that are automatically filled in when sending: {{customer_name}}, {{balance}}, {{invoice_table}}, {{payment_url}}, and more. Use the preview function to see how a template looks with sample data.',
        position: 'bottom',
        route: '/templates',
        delay: 600,
        action: 'Click New Template to see the creation form.',
      },
      {
        target: '[data-tour="template-list"]',
        title: 'Template Library',
        content: 'Your template library shows all saved templates with their names and subjects. Each template has Edit, Preview (eye icon), and Delete buttons. Create templates for different collection stages: friendly reminders, past-due notices, final warnings, and statements.',
        position: 'top',
        route: '/templates',
      },
      {
        target: '[data-tour="formula-create"]',
        title: 'Create Email Formula',
        content: 'Formulas are automated email rules. Click "New Formula" to create one. You define: which template to use, which customers to target, the schedule (specific days of the month and times), and conditions for sending. Formulas run automatically on your schedule.',
        position: 'bottom',
        route: '/formulas',
        delay: 600,
        action: 'Click New Formula to see the automation setup.',
      },
      {
        target: '[data-tour="formula-list"]',
        title: 'Formula List',
        content: 'Each formula card shows its name, the template it uses, the schedule (days and times), and status. You can edit or delete formulas, and enable/disable them individually. Active formulas run automatically at their scheduled times.',
        position: 'top',
        route: '/formulas',
      },
      {
        title: 'Email Tracking',
        content: 'The Email Tracking page shows delivery status for every email sent. You can see which emails were delivered, opened, and clicked. This helps you verify that collection notices are reaching customers and being read.',
        position: 'center',
        route: '/customer-email-tracking',
        delay: 600,
      },
      {
        title: 'Email System Complete',
        content: 'You now know the full email workflow: Receive replies in Inbox, create Templates with variables, automate sending with Formulas, manage customer-email Assignments, and monitor delivery in Email Tracking. This automation significantly reduces manual collection communication work.',
        position: 'center',
      },
    ],
  },

  {
    id: 'ai-assistant-tour',
    name: 'AI Chat Assistant',
    description: 'Ask data questions, generate reports, create tickets, and use voice features.',
    icon: 'sparkles',
    category: 'communication',
    steps: [
      {
        title: 'AI Chat Assistant',
        content: 'The AI Assistant is your intelligent helper. It understands your data and can answer complex questions, generate reports, look up customers, and even create tickets through natural conversation.',
        position: 'center',
      },
      {
        target: '[data-tour="chat-widget"]',
        title: 'Open the Assistant',
        content: 'Click this floating button to open the chat window. It\'s available on every page of the application. The chat window can be minimized or moved.',
        position: 'top',
        action: 'Click to open the AI assistant.',
      },
      {
        title: 'Suggested Questions',
        content: 'When you first open the chat, you see suggested questions to get started. These include: "Who are the top 5 customers by balance?", "How much did we collect this month?", "Show me overdue invoices over $10,000", and "Create a ticket for Customer X". Click any suggestion to ask it.',
        position: 'center',
      },
      {
        title: 'Data Queries',
        content: 'Ask the AI about: customer balances and details, invoice aging and statuses, payment history and trends, collector performance, ticket statistics, and collection KPIs. It queries your live database to give accurate, up-to-date answers.',
        position: 'center',
      },
      {
        title: 'Report Generation',
        content: 'Ask the AI to generate reports: "Create an aging report for all customers", "Summarize collections for this quarter", "List all customers with balance over $50,000". Reports can be exported as PDF or Excel directly from the chat.',
        position: 'center',
      },
      {
        title: 'Voice Input & Output',
        content: 'Click the microphone button to speak your question instead of typing. Toggle the speaker icon to have the AI read responses aloud. This is great for hands-free operation when you are multitasking.',
        position: 'center',
      },
    ],
  },

  {
    id: 'reminders-deep-dive',
    name: 'Reminders System - Complete Guide',
    description: 'Create reminders, filter by date, mark complete, and set up email notifications.',
    icon: 'bell',
    category: 'communication',
    steps: [
      {
        title: 'Reminders System',
        content: 'The Reminders system ensures nothing falls through the cracks. Create reminders for follow-up calls, promise date check-ins, payment verification, and any other collection task. Let\'s explore all the features.',
        position: 'center',
        route: '/reminders',
        delay: 600,
      },
      {
        target: '[data-tour="reminder-create"]',
        title: 'Create New Reminder',
        content: 'Click "New Reminder" to create one. You set: a title, description, date and time, priority (Low, Medium, High), and optionally link it to a specific invoice or customer. You can also enable email notifications to get alerted when the reminder is due.',
        position: 'bottom',
        route: '/reminders',
        delay: 800,
        action: 'Click New Reminder to see the creation form.',
      },
      {
        target: '[data-tour="reminder-tabs"]',
        title: 'Filter Tabs',
        content: 'Six filter tabs help you find reminders: "All Active" shows everything not completed, "Today" shows reminders due today, "Tomorrow" shows upcoming, "This Week" shows the next 7 days, "Overdue" highlights past-due items, and "Completed" shows finished reminders.',
        position: 'bottom',
        route: '/reminders',
        action: 'Click through the tabs to see different reminder groups.',
      },
      {
        target: '[data-tour="reminder-list"]',
        title: 'Reminder Cards',
        content: 'Each reminder card shows: title, description, due date/time, priority badge, and linked invoice (if any). Action buttons let you: mark complete (checkmark), edit (pencil), or delete (trash). Overdue reminders are highlighted in red.',
        position: 'top',
        route: '/reminders',
      },
      {
        title: 'Quick Access from Header',
        content: 'Remember, you can always access your reminders from the bell icon in the header. The sidebar panel shows a condensed view of your upcoming and overdue reminders for quick reference without leaving your current page.',
        position: 'center',
      },
      {
        title: 'Creating Reminders from Other Pages',
        content: 'You can create reminders from multiple places: the Reminders page, inside a Ticket Detail view, from the Customer Detail view, or from any invoice row. When created from a context (like an invoice), the reminder is automatically linked to that item.',
        position: 'center',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  ADMINISTRATION
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'admin-settings-deep-dive',
    name: 'Settings & Admin - Complete Guide',
    description: 'User management, approval, color settings, ticket statuses, email config, API keys, and documentation.',
    icon: 'settings',
    category: 'admin',
    steps: [
      {
        title: 'Administration & Settings',
        content: 'The Settings section contains all system configuration tools. Only admins and managers have access. Let\'s walk through every settings page and what it controls.',
        position: 'center',
      },
      {
        title: 'Invoice Color Settings',
        content: 'Manage the color statuses used to categorize invoices. You can add new colors, rename existing ones, change their display color, reorder them, and delete custom ones. System colors (Red, Yellow, Green, Blue) cannot be deleted but can be renamed.',
        position: 'center',
        route: '/invoice-color-settings',
        delay: 600,
      },
      {
        title: 'Invoice Status Admin Panel',
        content: 'The Invoice Status Admin Panel lets you view and manage invoice statuses across the system. You can see which invoices have which color statuses and make bulk changes when needed.',
        position: 'center',
        route: '/invoice-status-admin',
        delay: 600,
      },
      {
        title: 'Ticket Status Settings',
        content: 'Configure the available ticket statuses. Add new statuses like "On Hold" or "Escalated," change their display colors, and reorder them. System statuses (Open, In Progress, Closed) cannot be deleted but can be customized.',
        position: 'center',
        route: '/ticket-status-settings',
        delay: 600,
      },
      {
        target: '[data-tour="approval-search"]',
        title: 'User Approval',
        content: 'When new users sign up, they appear here as "Pending Approval." You can approve or decline each user. Declined users can have a reason noted. You can search and filter by status (Pending, Approved, Declined).',
        position: 'bottom',
        route: '/user-approval',
        delay: 600,
      },
      {
        title: 'Create New User',
        content: 'Admins can create user accounts directly. Enter their email, full name, and role (Collector, Secretary, or Admin). A temporary password is generated and emailed to them. They will be prompted to change it on first login.',
        position: 'center',
        route: '/create-user',
        delay: 600,
      },
      {
        title: 'User Activity Logs',
        content: 'Track what every user has been doing: logins, actions taken, most common activity, and last login time. Filter by time range (7, 30, 60, or 90 days). Use this to monitor team productivity and ensure accountability.',
        position: 'center',
        route: '/user-activity',
        delay: 600,
      },
      {
        title: 'Email Settings',
        content: 'Configure system email addresses: the AR (Accounts Receivable) sender, no-reply address, and reply-to address. Set your company name and domain. Enable/disable SendGrid tracking for opens and clicks. Test email delivery with the test buttons.',
        position: 'center',
        route: '/email-settings',
        delay: 600,
      },
      {
        target: '[data-tour="api-key-create"]',
        title: 'API Key Management',
        content: 'Create and manage API keys for external integrations. The GPT data API and other external tools use these keys. Each key has a name, optional expiration date, usage tracking, and can be activated or deactivated.',
        position: 'bottom',
        route: '/api-keys',
        delay: 600,
      },
      {
        title: 'Webhooks Configuration',
        content: 'Set up webhooks for Acumatica real-time notifications. When data changes in Acumatica (new invoice, payment, etc.), webhooks push updates to the system immediately instead of waiting for the scheduled sync.',
        position: 'center',
        route: '/webhooks',
        delay: 600,
      },
      {
        title: 'System Documentation',
        content: 'Comprehensive documentation about the entire system: database schemas, API endpoints, feature guides, troubleshooting, and configuration reference. This is a printable resource for training and reference.',
        position: 'center',
        route: '/system-documentation',
        delay: 600,
      },
      {
        title: 'Administration Complete',
        content: 'You now know every admin setting: color statuses, ticket statuses, user management, approval workflow, email configuration, API keys, webhooks, and documentation. Most of these require admin role access.',
        position: 'center',
      },
    ],
  },

  {
    id: 'email-settings-tour',
    name: 'Email Settings Configuration',
    description: 'Configure sender addresses, test email delivery, and set up SendGrid tracking.',
    icon: 'mail',
    category: 'admin',
    steps: [
      {
        title: 'Email Settings',
        content: 'Email Settings controls how the system sends collection emails. You configure sender identities, reply-to addresses, and delivery tracking here.',
        position: 'center',
        route: '/email-settings',
        delay: 600,
      },
      {
        target: '[data-tour="email-ar-settings"]',
        title: 'AR Sender Configuration',
        content: 'Set the "From" name and email address for Accounts Receivable emails. This is what customers see when they receive collection notices. Use a professional name like "Accounts Receivable" or your company name.',
        position: 'bottom',
        route: '/email-settings',
        delay: 800,
      },
      {
        target: '[data-tour="email-test-btns"]',
        title: 'Test Email Buttons',
        content: 'Three test buttons let you send test emails: one from the AR address, one from the reply-to address, and one from the no-reply address. Test emails include sample invoice data so you can verify formatting and delivery.',
        position: 'bottom',
        route: '/email-settings',
        action: 'Click a test button to verify email delivery.',
      },
      {
        target: '[data-tour="email-save"]',
        title: 'Save Changes',
        content: 'After making changes, click Save to apply the new settings. Changes take effect immediately for all future emails.',
        position: 'bottom',
        route: '/email-settings',
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  DATA & SYNC
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'sync-config-tour',
    name: 'Sync Configuration',
    description: 'Acumatica credentials, entity sync settings, intervals, and date range sync tools.',
    icon: 'settings',
    category: 'data-sync',
    steps: [
      {
        title: 'Sync Configuration',
        content: 'The Sync Configuration page controls how data flows from Acumatica ERP into the collections system. You manage credentials, sync intervals, and entity-level settings here.',
        position: 'center',
        route: '/sync-config',
        delay: 600,
      },
      {
        target: '[data-tour="sync-credentials"]',
        title: 'Acumatica Credentials',
        content: 'Enter your Acumatica API credentials: URL, username, password, company, and branch. The system uses these to authenticate with Acumatica\'s REST API. Use the "Test" button to verify connectivity before saving.',
        position: 'bottom',
        route: '/sync-config',
        delay: 800,
        action: 'Click Test Credentials to verify your Acumatica connection.',
      },
      {
        target: '[data-tour="sync-entities"]',
        title: 'Entity Sync Settings',
        content: 'Configure sync for each data type independently: Invoices, Payments, Customers, and Payment Applications. For each entity, you can: enable/disable sync, set the sync interval (in minutes), and configure the lookback window for incremental syncs.',
        position: 'top',
        route: '/sync-config',
      },
      {
        title: 'Sync Intervals',
        content: 'The sync interval determines how often data is pulled from Acumatica. A 5-minute interval means the system checks for changes every 5 minutes. Shorter intervals give fresher data but increase API load. The default is 5 minutes for all entities.',
        position: 'center',
      },
      {
        title: 'Date Range Sync',
        content: 'The Date Range Sync tool lets you manually pull data for a specific date range. This is useful for: initial data loads, backfilling historical data, or re-syncing data that may have had errors. Select start/end dates and the entity type to sync.',
        position: 'center',
      },
      {
        title: 'Sync Health',
        content: 'Visit the Sync Health page to monitor the overall health of your data sync: last successful sync time, error counts, and cron job status. If the sync indicator in the Developer Settings turns red, check this page first.',
        position: 'center',
        route: '/sync-health',
        delay: 600,
      },
    ],
  },

  {
    id: 'sync-monitoring-tour',
    name: 'Sync Monitoring & Health',
    description: 'Monitor sync status, view change logs, live sync tracking, and health checks.',
    icon: 'activity',
    category: 'data-sync',
    steps: [
      {
        title: 'Sync Monitoring',
        content: 'Multiple tools help you monitor the data synchronization between Acumatica and the collections system. Let\'s explore each one.',
        position: 'center',
        route: '/sync-status',
        delay: 600,
      },
      {
        title: 'Sync Status Dashboard',
        content: 'This page shows the real-time status of all sync operations: Invoices, Payments, Customers, and Payment Applications. For each entity, you see: last sync time, records synced, duration, and any errors. Green status means healthy, red means there are issues.',
        position: 'center',
        route: '/sync-status',
        delay: 800,
      },
      {
        title: 'Sync Change Logs',
        content: 'The Change Logs page shows a detailed history of every sync operation: what changed, when, and how many records were affected. This is your audit trail for data changes and helps debug sync issues.',
        position: 'center',
        route: '/sync-logs',
        delay: 600,
      },
      {
        title: 'Live Sync Monitor',
        content: 'The Live Sync Monitor shows real-time progress of active sync operations. You can see the current sync phase, records processed, time elapsed, and estimated completion. Use this when running large syncs or backfills.',
        position: 'center',
        route: '/live-sync-monitor',
        delay: 600,
      },
      {
        title: 'Sync Diagnostic Tool',
        content: 'The Sync Diagnostic tool helps troubleshoot sync problems. It checks API connectivity, compares record counts between systems, identifies missing records, and suggests fixes for common issues.',
        position: 'center',
        route: '/sync-diagnostic',
        delay: 600,
      },
      {
        title: 'Developer Tools Hub',
        content: 'For advanced sync operations (payment resync, backfill, format checking), visit Developer Tools from the sidebar. It contains specialized tools organized by category: Payment Tools, Invoice Tools, Sync Tools, and System Tools.',
        position: 'center',
        route: '/developer-tools',
        delay: 600,
      },
    ],
  },

  // ═══════════════════════════════════════════════════════════════════
  //  REPORTS & STATEMENTS
  // ═══════════════════════════════════════════════════════════════════
  {
    id: 'customer-reports-tour',
    name: 'Customer Reports & Monthly Sheets',
    description: 'Generate PDF reports, batch email with templates, filter customers, and export to Excel.',
    icon: 'file-text',
    category: 'reports',
    steps: [
      {
        title: 'Customer Reports',
        content: 'The Customer Reports page lets you generate, preview, and distribute monthly collection reports. You can create PDF statements, email them to customers, and export data for further analysis.',
        position: 'center',
        route: '/customer-reports',
        delay: 600,
      },
      {
        target: '[data-tour="report-filters"]',
        title: 'Search & Filters',
        content: 'Filter customers by: name search, minimum balance threshold, and date filter (current month, all time, or custom range). This helps you target reports to specific customer segments.',
        position: 'bottom',
        route: '/customer-reports',
        delay: 800,
        action: 'Try setting a minimum balance to filter to high-balance customers.',
      },
      {
        target: '[data-tour="report-template"]',
        title: 'Template Selector',
        content: 'Choose which email template to use when sending reports. Templates contain the email body text with variables like customer name, balance, and invoice table. Select the right template for your audience.',
        position: 'bottom',
        route: '/customer-reports',
      },
      {
        target: '[data-tour="report-select-all"]',
        title: 'Select All / Deselect All',
        content: 'Use these buttons to quickly select or deselect all visible customers. Combined with filters, you can easily select "all customers with balance over $5,000" for batch operations.',
        position: 'bottom',
        route: '/customer-reports',
      },
      {
        target: '[data-tour="report-actions"]',
        title: 'Action Buttons',
        content: 'Four action buttons: "Generate PDFs" creates downloadable PDF statements for selected customers, "Send Emails" delivers reports via email using the selected template, "Export to Excel" downloads the data as a spreadsheet, and "Download" bundles PDFs into a ZIP file.',
        position: 'bottom',
        route: '/customer-reports',
      },
      {
        target: '[data-tour="report-list"]',
        title: 'Customer Report List',
        content: 'Each customer row shows their name, balance, and invoice count. Click the expand arrow to see individual invoices with dates, amounts, and balances. Use checkboxes to select which customers to include in your batch operation.',
        position: 'top',
        route: '/customer-reports',
        action: 'Expand a customer row to preview their invoice details.',
      },
    ],
  },

  {
    id: 'report-templates-tour',
    name: 'Customer Report Templates',
    description: 'Create and manage email templates used for customer reports and statements.',
    icon: 'file-text',
    category: 'reports',
    steps: [
      {
        title: 'Report Templates',
        content: 'Report Templates are email templates specifically designed for customer reports and statements. They use the same variable system as regular email templates but are optimized for report distribution.',
        position: 'center',
        route: '/customer-report-templates',
        delay: 600,
      },
      {
        title: 'Creating Report Templates',
        content: 'Create templates with variables like {{customer_name}}, {{total_balance}}, {{invoice_table}}, and {{payment_url}}. These are automatically replaced with real data when generating reports. You can format the invoice table and include payment links for online payment portals.',
        position: 'center',
      },
      {
        title: 'Template Preview',
        content: 'Use the preview function to see how your template will look with sample data. This helps you catch formatting issues before sending to real customers.',
        position: 'center',
      },
    ],
  },

  {
    id: 'email-analytics-tour',
    name: 'Email Analytics',
    description: 'Track email volume, delivery rates, and formula performance over time.',
    icon: 'mail',
    category: 'reports',
    steps: [
      {
        title: 'Email Analytics',
        content: 'Email Analytics shows you how many emails the system has sent, which formulas are most active, and trends in communication volume.',
        position: 'center',
        route: '/email-analytics',
        delay: 600,
      },
      {
        title: 'Time Range Filter',
        content: 'Filter analytics by time period: Last 7, 30, 60, or 90 days. The metrics and charts update to reflect only the selected period.',
        position: 'center',
        route: '/email-analytics',
        delay: 800,
      },
      {
        title: 'Email Volume Cards',
        content: 'Summary cards show: Total Emails Sent, Census Emails (automated), Report Emails, and Average Emails Per Day. These give you a quick picture of your communication volume.',
        position: 'center',
      },
      {
        title: 'Formula Performance Table',
        content: 'The performance table shows each email formula with the number of emails it sent in the selected period. This helps you identify which automated campaigns are most active and verify that formulas are running correctly.',
        position: 'center',
      },
    ],
  },
];

export function getToursByCategory(categoryId: string): Tour[] {
  return TOURS.filter(t => t.category === categoryId);
}

export function getTourById(tourId: string): Tour | undefined {
  return TOURS.find(t => t.id === tourId);
}
