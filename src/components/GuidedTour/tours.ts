export interface TourStep {
  target?: string; // CSS selector or data-tour attribute value
  title: string;
  content: string;
  route?: string; // Navigate to this route before showing step
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: string; // Instruction like "Click this button"
  delay?: number; // ms to wait before showing (for page load)
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
];

export const TOURS: Tour[] = [
  // ─── Getting Started ───────────────────────────────────────────────
  {
    id: 'app-overview',
    name: 'App Overview',
    description: 'A quick walkthrough of the main navigation and layout of the application.',
    icon: 'compass',
    category: 'getting-started',
    steps: [
      {
        title: 'Welcome to Your Collections Portal',
        content: 'This guided tour will show you around the application. You can pause or exit at any time. Let\'s start with the navigation sidebar.',
        position: 'center',
      },
      {
        target: '[data-tour="sidebar"]',
        title: 'Navigation Sidebar',
        content: 'This is your main navigation panel. It contains links to all sections of the application. You can collapse it using the arrow button at the top to save screen space.',
        position: 'right',
        route: '/dashboard',
      },
      {
        target: '[data-tour="sidebar-collapse"]',
        title: 'Collapse Sidebar',
        content: 'Click this button to collapse or expand the sidebar. Your preference is saved automatically.',
        position: 'right',
      },
      {
        target: '[data-tour="global-search"]',
        title: 'Global Search',
        content: 'Use this search bar to quickly find any customer, invoice, or payment across the entire system. Just start typing and results appear instantly.',
        position: 'bottom',
      },
      {
        target: '[data-tour="reminders-btn"]',
        title: 'Reminders',
        content: 'This button opens the reminders panel. When you have overdue reminders, it will pulse red to alert you. Click it to see all your upcoming and past-due reminders.',
        position: 'bottom',
      },
      {
        target: '[data-tour="chat-widget"]',
        title: 'AI Assistant',
        content: 'This is your AI-powered assistant. Click it to ask any question about customers, invoices, payments, or analytics. It can also create tickets and generate reports for you.',
        position: 'top',
      },
      {
        title: 'Tour Complete!',
        content: 'That covers the basics of the app layout. You can take more specific tours from the tour menu to learn about individual features like Customers, Invoices, Payments, and more.',
        position: 'center',
      },
    ],
  },

  // ─── Customer Management ───────────────────────────────────────────
  {
    id: 'customers-tour',
    name: 'Customer Management',
    description: 'Learn how to search, view, and manage customers with balances, analytics, and assignments.',
    icon: 'users',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Management',
        content: 'Let\'s explore the Customer Management section. This is where you view all your customers, their balances, and manage collection assignments.',
        position: 'center',
      },
      {
        target: '[data-tour="nav-customers"]',
        title: 'Customers Menu',
        content: 'Click "Customers" in the sidebar to open the customer list. This shows all customers synced from your Acumatica ERP system.',
        position: 'right',
        route: '/customers',
        delay: 500,
      },
      {
        target: '[data-tour="customer-stats"]',
        title: 'Customer Statistics',
        content: 'At the top you\'ll see summary statistics: total customers, how many have outstanding debt, the total amount owed, and the average balance per customer.',
        position: 'bottom',
        route: '/customers',
        delay: 800,
      },
      {
        target: '[data-tour="customer-search"]',
        title: 'Search Customers',
        content: 'Use this search bar to find customers by name, email, or customer ID. You can also filter by balance range, days overdue, and other criteria using the filter options.',
        position: 'bottom',
        route: '/customers',
      },
      {
        target: '[data-tour="customer-filters"]',
        title: 'Advanced Filters',
        content: 'These filter options let you narrow down customers by date range, minimum/maximum balance, invoice count, days overdue, and more. You can also save filter presets for quick access.',
        position: 'bottom',
        route: '/customers',
      },
      {
        target: '[data-tour="customer-export"]',
        title: 'Export to Excel',
        content: 'Click the Export button to download the current customer list as an Excel spreadsheet. The export respects your current filters and sorting.',
        position: 'bottom',
        route: '/customers',
      },
      {
        target: '[data-tour="customer-list"]',
        title: 'Customer List',
        content: 'Each row shows a customer with their name, ID, outstanding balance, and number of open invoices. Click on any customer to see their full detail view with invoices, payments, and memos.',
        position: 'top',
        route: '/customers',
      },
      {
        title: 'Customer Detail View',
        content: 'When you click a customer, you see their complete profile: contact info, all invoices with color-coded statuses, payment history, collection tickets, memos, and a timeline chart showing balance trends over time.',
        position: 'center',
      },
    ],
  },

  {
    id: 'customer-analytics-tour',
    name: 'Customer Analytics',
    description: 'Explore the analytics dashboard for customer insights, aging, and trends.',
    icon: 'bar-chart',
    category: 'customer-management',
    steps: [
      {
        title: 'Customer Analytics',
        content: 'The Customer Analytics page gives you deep insights into your customer base -- balance distributions, aging trends, and performance metrics.',
        position: 'center',
        route: '/customer-analytics',
        delay: 500,
      },
      {
        target: '[data-tour="analytics-stats"]',
        title: 'Key Metrics',
        content: 'These cards show your most important metrics at a glance: total customers, those with active debt, high-balance accounts, and overall outstanding amounts.',
        position: 'bottom',
        route: '/customer-analytics',
        delay: 800,
      },
      {
        target: '[data-tour="analytics-filters"]',
        title: 'Analytics Filters',
        content: 'Use preset filters like "High Balance (>$10k)" or create custom filters to focus on specific customer segments. This helps you prioritize collection efforts.',
        position: 'bottom',
        route: '/customer-analytics',
      },
      {
        target: '[data-tour="analytics-chart"]',
        title: 'Trend Charts',
        content: 'The timeline chart shows how your total receivables have changed over time. You can switch between different views to see balance trends, customer counts, and aging distributions.',
        position: 'top',
        route: '/customer-analytics',
      },
      {
        title: 'Analytics Complete',
        content: 'Customer Analytics helps you identify trends and make data-driven decisions about your collection strategy. Use the filters and charts to find patterns in payment behavior.',
        position: 'center',
      },
    ],
  },

  // ─── Financials & Analytics ────────────────────────────────────────
  {
    id: 'invoice-tour',
    name: 'Invoice Analytics',
    description: 'Learn how to search, filter, and analyze invoices with color statuses and aging.',
    icon: 'file-text',
    category: 'financials',
    steps: [
      {
        title: 'Invoice Analytics',
        content: 'The Invoice Analytics page lets you search, filter, and analyze all invoices in the system. Let\'s explore its features.',
        position: 'center',
        route: '/invoice-analytics',
        delay: 500,
      },
      {
        target: '[data-tour="invoice-sidebar"]',
        title: 'Filter Sidebar',
        content: 'This sidebar contains all your filter options. Filter by status (Open, Closed), type (Invoice, Credit Memo, Debit Memo), date ranges, amounts, and color statuses.',
        position: 'right',
        route: '/invoice-analytics',
        delay: 800,
      },
      {
        target: '[data-tour="invoice-summary"]',
        title: 'Summary Statistics',
        content: 'These numbers show the filtered totals: how many invoices match your criteria, their total amount, total balance remaining, and the count breakdown.',
        position: 'bottom',
        route: '/invoice-analytics',
      },
      {
        target: '[data-tour="invoice-list"]',
        title: 'Invoice List',
        content: 'The main table shows all matching invoices. Each row displays the reference number, customer, date, amount, balance, status, and color code. Click any invoice to see its details, memos, and payment history.',
        position: 'top',
        route: '/invoice-analytics',
      },
      {
        title: 'Color Status System',
        content: 'Invoices can be marked with color statuses (Red, Yellow, Green, Blue) to indicate collection priority. Red typically means high-risk or severely overdue. Colors can be set manually by collectors or automatically by the system based on age thresholds.',
        position: 'center',
      },
      {
        title: 'Invoice Analytics Complete',
        content: 'You now know how to find and analyze any invoice in the system. Use the filters to create focused views and the export button to download results.',
        position: 'center',
      },
    ],
  },

  {
    id: 'payment-tour',
    name: 'Payment Analytics',
    description: 'Explore payment tracking, monthly breakdowns, and collection trends.',
    icon: 'dollar-sign',
    category: 'financials',
    steps: [
      {
        title: 'Payment Analytics',
        content: 'Payment Analytics shows you all collected payments, monthly trends, and breakdowns by payment type. This is essential for tracking collection performance.',
        position: 'center',
        route: '/payment-analytics',
        delay: 500,
      },
      {
        target: '[data-tour="payment-view-toggle"]',
        title: 'View Options',
        content: 'Switch between Daily, Monthly, and Yearly views to see payment data at different granularity levels. Each view shows totals, counts, and trends.',
        position: 'bottom',
        route: '/payment-analytics',
        delay: 800,
      },
      {
        target: '[data-tour="payment-calendar"]',
        title: 'Payment Calendar',
        content: 'The calendar or table view shows payments organized by date. You can see how much was collected each day/month, with breakdowns by payment type (Payment, Prepayment, Credit Memo, etc.).',
        position: 'top',
        route: '/payment-analytics',
      },
      {
        title: 'Payment Breakdown',
        content: 'For deeper analysis, visit the Payment Breakdown page. It shows month-by-month comparison tables with Acumatica totals vs. system totals, helping you verify data accuracy.',
        position: 'center',
      },
      {
        title: 'Payment Analytics Complete',
        content: 'Use Payment Analytics to track collection performance over time. Compare months, identify trends, and ensure all payments are properly synced from Acumatica.',
        position: 'center',
      },
    ],
  },

  {
    id: 'invoice-breakdown-tour',
    name: 'Invoice & Payment Breakdown',
    description: 'Learn about detailed month-by-month breakdowns and data reconciliation.',
    icon: 'layers',
    category: 'financials',
    steps: [
      {
        title: 'Breakdown Reports',
        content: 'The Breakdown pages show detailed month-by-month summaries with reconciliation between your system data and Acumatica. Let\'s look at the Payment Breakdown first.',
        position: 'center',
        route: '/payment-breakdown',
        delay: 500,
      },
      {
        target: '[data-tour="breakdown-table"]',
        title: 'Monthly Comparison Table',
        content: 'This table shows each month with columns for count, total amount, and a sync status indicator. Green checkmarks mean the data matches Acumatica; warnings indicate discrepancies.',
        position: 'top',
        route: '/payment-breakdown',
        delay: 800,
      },
      {
        target: '[data-tour="breakdown-summary"]',
        title: 'Summary Cards',
        content: 'At the top, summary cards show the overall totals, the date range covered, and any sync issues that need attention.',
        position: 'bottom',
        route: '/payment-breakdown',
      },
      {
        title: 'Invoice Breakdown',
        content: 'The Invoice Breakdown page works the same way but for invoices. It helps you verify that all invoices from Acumatica are properly synced into the collections system.',
        position: 'center',
      },
    ],
  },

  // ─── Collections & Tickets ─────────────────────────────────────────
  {
    id: 'ticketing-tour',
    name: 'Ticketing System',
    description: 'Learn how to create, manage, and track collection tickets for customers.',
    icon: 'ticket',
    category: 'collections',
    steps: [
      {
        title: 'Collection Ticketing System',
        content: 'The ticketing system helps you organize and track collection efforts. Tickets group invoices by customer and are assigned to collectors for follow-up.',
        position: 'center',
        route: '/collection-ticketing',
        delay: 500,
      },
      {
        target: '[data-tour="ticket-tabs"]',
        title: 'Ticket Status Tabs',
        content: 'Filter tickets by status: All, Open, In Progress, or Closed. Each tab shows the count of tickets in that status.',
        position: 'bottom',
        route: '/collection-ticketing',
        delay: 800,
      },
      {
        target: '[data-tour="ticket-create"]',
        title: 'Create New Ticket',
        content: 'Click "New Ticket" to create a collection ticket. You\'ll select a customer, set priority, add invoices, assign a collector, and write notes.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-search"]',
        title: 'Search & Filter',
        content: 'Search tickets by number, customer name, or notes. You can also filter by priority (Low, Medium, High, Critical) and assigned collector.',
        position: 'bottom',
        route: '/collection-ticketing',
      },
      {
        target: '[data-tour="ticket-list"]',
        title: 'Ticket List',
        content: 'Each ticket card shows the customer name, ticket number, priority level, assigned collector, number of invoices, and total balance. Click a ticket to see its full details.',
        position: 'top',
        route: '/collection-ticketing',
      },
      {
        title: 'Ticket Detail View',
        content: 'Inside a ticket, you can see all associated invoices with their balances, add memos and notes, change the status (with a required note), set promise dates, and track the complete activity history.',
        position: 'center',
      },
      {
        title: 'Auto-Ticket Rules',
        content: 'You can set up automatic rules that create tickets when conditions are met -- for example, when an invoice is overdue by 90+ days or when a customer\'s balance exceeds a threshold. These run on a schedule.',
        position: 'center',
      },
      {
        title: 'Ticketing Complete',
        content: 'The ticketing system is your primary tool for managing collection workflows. Combine it with reminders and email templates for effective follow-up.',
        position: 'center',
      },
    ],
  },

  {
    id: 'my-assignments-tour',
    name: 'My Assignments',
    description: 'Explore how collectors manage their assigned customers and tickets.',
    icon: 'clipboard-list',
    category: 'collections',
    steps: [
      {
        title: 'My Assignments',
        content: 'The My Assignments page is where collectors see all their assigned work -- both customer assignments and collection tickets. Let\'s explore it.',
        position: 'center',
        route: '/my-assignments',
        delay: 500,
      },
      {
        target: '[data-tour="assignment-view-toggle"]',
        title: 'View Toggle',
        content: 'Switch between Tickets view and Individual Invoices view. The Tickets view groups invoices by ticket, while Individual shows all assigned invoices in a flat list.',
        position: 'bottom',
        route: '/my-assignments',
        delay: 800,
      },
      {
        target: '[data-tour="assignment-list"]',
        title: 'Assignment Cards',
        content: 'Each card shows a ticket or customer with their invoices, total balance, and collection status. You can expand cards to see individual invoices, add memos, set promise dates, and change color statuses.',
        position: 'top',
        route: '/my-assignments',
      },
      {
        title: 'Collector Actions',
        content: 'From your assignments, you can: add memos to invoices, set promise dates for when customers commit to pay, change invoice color statuses, add ticket notes, and change ticket statuses -- all with a complete audit trail.',
        position: 'center',
      },
    ],
  },

  {
    id: 'collector-hub-tour',
    name: 'Collector Dashboard',
    description: 'Monitor collector performance, assignments, and collection progress.',
    icon: 'activity',
    category: 'collections',
    steps: [
      {
        title: 'Collector Dashboard',
        content: 'The Collector Dashboard gives managers a bird\'s-eye view of all collectors\' performance, assignments, and collection progress.',
        position: 'center',
        route: '/collector-monitoring',
        delay: 500,
      },
      {
        target: '[data-tour="collector-cards"]',
        title: 'Collector Cards',
        content: 'Each collector gets a card showing their assigned customers, open/closed ticket counts, total balance under management, and recent activity. Expand a card for detailed metrics.',
        position: 'top',
        route: '/collector-monitoring',
        delay: 800,
      },
      {
        title: 'Performance Tracking',
        content: 'Track key metrics per collector: tickets closed, average days to close, amount collected, and collection rate. This helps identify top performers and those who may need support.',
        position: 'center',
      },
    ],
  },

  // ─── Communication ─────────────────────────────────────────────────
  {
    id: 'email-system-tour',
    name: 'Email System',
    description: 'Learn about email templates, formulas, inbox management, and email tracking.',
    icon: 'mail',
    category: 'communication',
    steps: [
      {
        title: 'Email System Overview',
        content: 'The email system lets you send collection emails, manage templates, set up automated email schedules, and track delivery and open rates.',
        position: 'center',
      },
      {
        target: '[data-tour="nav-email-system"]',
        title: 'Email Section',
        content: 'The Email System section in the sidebar contains Inbox, Assignments, Formulas, Templates, and Email Logs. Let\'s walk through each one.',
        position: 'right',
      },
      {
        title: 'Inbox',
        content: 'The Inbox shows all inbound emails from customers. Emails are automatically matched to customer accounts when possible. You can read, reply, and categorize messages.',
        position: 'center',
        route: '/inbox',
        delay: 500,
      },
      {
        title: 'Email Templates',
        content: 'Templates let you create reusable email content for collection notices. You can use variables like customer name, balance, and invoice details that are automatically filled in when sending.',
        position: 'center',
        route: '/templates',
        delay: 500,
      },
      {
        title: 'Email Formulas',
        content: 'Formulas are automated email rules. Set conditions (like "balance over $5,000" or "overdue 30+ days") and the system will automatically send the right template to matching customers on your schedule.',
        position: 'center',
        route: '/formulas',
        delay: 500,
      },
      {
        title: 'Email Logs',
        content: 'The Email Logs page shows every email sent with delivery status, open tracking, and timestamps. Use this to verify emails were delivered and opened.',
        position: 'center',
        route: '/email-logs',
        delay: 500,
      },
      {
        title: 'Email System Complete',
        content: 'The email system automates much of your collection communication. Set up templates and formulas to send professional collection notices on a schedule.',
        position: 'center',
      },
    ],
  },

  {
    id: 'ai-assistant-tour',
    name: 'AI Chat Assistant',
    description: 'Learn how to use the AI assistant for data queries, reports, and ticket creation.',
    icon: 'sparkles',
    category: 'communication',
    steps: [
      {
        title: 'AI Chat Assistant',
        content: 'The AI Assistant can answer questions about your data, find customers and invoices, generate summaries, and even create tickets -- all through natural language conversation.',
        position: 'center',
      },
      {
        target: '[data-tour="chat-widget"]',
        title: 'Opening the Chat',
        content: 'Click this floating button to open the AI assistant. It\'s available on every page of the application.',
        position: 'top',
      },
      {
        title: 'Suggested Questions',
        content: 'When you first open the chat, you\'ll see suggested questions like "Who are the high-risk customers?" and "How much payments did we receive?" Click any suggestion to ask it instantly.',
        position: 'center',
      },
      {
        title: 'What You Can Ask',
        content: 'The AI can: find customers by name or balance, look up specific invoices, show payment totals for any period, generate aging reports, identify top collectors, create tickets, and answer complex data questions.',
        position: 'center',
      },
      {
        title: 'Voice Features',
        content: 'Use the microphone button for voice input, and toggle the speaker icon to have responses read aloud. Great for hands-free operation.',
        position: 'center',
      },
    ],
  },

  // ─── Administration ────────────────────────────────────────────────
  {
    id: 'admin-settings-tour',
    name: 'Settings & Admin',
    description: 'Explore user management, sync configuration, color settings, and system administration.',
    icon: 'settings',
    category: 'admin',
    steps: [
      {
        title: 'Administration & Settings',
        content: 'The Settings section contains tools for managing users, configuring the system, and monitoring synchronization with Acumatica.',
        position: 'center',
      },
      {
        title: 'User Management',
        content: 'From the sidebar, use "Manage Users" to view all users, change roles, approve/decline new registrations, and manage permissions. The "User Approval" page handles new signups.',
        position: 'center',
        route: '/user-approval',
        delay: 500,
      },
      {
        title: 'Invoice Color Settings',
        content: 'Configure the color status options (Red, Yellow, Green, Blue, etc.) that collectors use to prioritize invoices. You can set automatic rules that change colors based on days overdue.',
        position: 'center',
        route: '/invoice-color-settings',
        delay: 500,
      },
      {
        title: 'Ticket Status Settings',
        content: 'Customize the ticket status options available in the ticketing system. Add new statuses, change display names, colors, and sort order.',
        position: 'center',
        route: '/ticket-status-settings',
        delay: 500,
      },
      {
        title: 'Auto-Ticket Rules',
        content: 'Set up rules that automatically create collection tickets when conditions are met -- like when an invoice becomes overdue by a certain number of days or when a customer\'s balance exceeds a threshold.',
        position: 'center',
        route: '/auto-ticket-rules',
        delay: 500,
      },
      {
        title: 'Synchronization Status',
        content: 'Monitor the data sync between Acumatica and this system. See when the last sync ran, its status, and any errors that occurred. You can trigger manual syncs here.',
        position: 'center',
        route: '/sync-status',
        delay: 500,
      },
      {
        title: 'System Documentation',
        content: 'The Documentation page provides comprehensive technical and user documentation about the entire system, including database schemas, API endpoints, and feature guides.',
        position: 'center',
        route: '/system-documentation',
        delay: 500,
      },
      {
        title: 'Administration Complete',
        content: 'You now know where all the administrative tools are. Most settings require admin or manager role access.',
        position: 'center',
      },
    ],
  },

  {
    id: 'reminders-tour',
    name: 'Reminders System',
    description: 'Learn how to create, manage, and receive reminders for invoices and follow-ups.',
    icon: 'bell',
    category: 'admin',
    steps: [
      {
        title: 'Reminders System',
        content: 'Reminders help you stay on top of collection tasks. Set reminders for specific invoices, customers, or general follow-ups.',
        position: 'center',
        route: '/reminders',
        delay: 500,
      },
      {
        target: '[data-tour="reminders-btn"]',
        title: 'Quick Access',
        content: 'The bell icon in the header gives quick access to your reminders panel. When you have overdue reminders, it pulses red.',
        position: 'bottom',
      },
      {
        title: 'Creating Reminders',
        content: 'You can create reminders from the Reminders page, or directly from an invoice detail view. Set a date, priority, and description. The system will notify you when it\'s due.',
        position: 'center',
        route: '/reminders',
      },
      {
        title: 'Reminders Complete',
        content: 'Use reminders to ensure nothing falls through the cracks. Set them for promise dates, follow-ups, and critical collection deadlines.',
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
