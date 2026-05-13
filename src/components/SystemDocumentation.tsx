import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import html2pdf from 'html2pdf.js';
import {
  ArrowLeft, ChevronRight, ChevronDown, FileText, Database, Mail, RefreshCw,
  Bell, Users, DollarSign, BarChart3, Shield, Clock, Globe, Search,
  Settings, Layers, Zap, Server, Key, Inbox, Ticket, Activity,
  CheckCircle2, AlertTriangle, BookOpen, Download
} from 'lucide-react';

interface SystemDocumentationProps {
  onBack?: () => void;
}

interface Section {
  id: string;
  title: string;
  icon: any;
  subsections?: { id: string; title: string }[];
}

const SECTIONS: Section[] = [
  { id: 'overview', title: 'System Overview', icon: BookOpen },
  {
    id: 'auth', title: 'Authentication & Permissions', icon: Shield,
    subsections: [
      { id: 'auth-flow', title: 'Authentication Flow' },
      { id: 'auth-roles', title: 'Roles & Permissions' },
      { id: 'auth-impersonation', title: 'Impersonation System' },
      { id: 'auth-approval', title: 'User Approval Workflow' },
    ]
  },
  {
    id: 'sync', title: 'Acumatica Sync System', icon: RefreshCw,
    subsections: [
      { id: 'sync-overview', title: 'Sync Architecture' },
      { id: 'sync-master', title: 'Master Sync Orchestrator' },
      { id: 'sync-invoices', title: 'Invoice Sync' },
      { id: 'sync-payments', title: 'Payment Sync' },
      { id: 'sync-customers', title: 'Customer Sync' },
      { id: 'sync-tables', title: 'Sync Database Tables' },
      { id: 'sync-monitoring', title: 'Sync Monitoring Pages' },
    ]
  },
  {
    id: 'customers', title: 'Customer Management', icon: Users,
    subsections: [
      { id: 'customers-list', title: 'Customer List & Filters' },
      { id: 'customers-detail', title: 'Customer Detail View' },
      { id: 'customers-analytics', title: 'Customer Analytics' },
      { id: 'customers-statements', title: 'Statements & Reports' },
      { id: 'customers-monthly', title: 'Monthly Communication Sheet' },
      { id: 'customers-assignments', title: 'Email Assignments' },
      { id: 'customers-database', title: 'Customer Database Schema' },
    ]
  },
  {
    id: 'invoices', title: 'Invoice System', icon: FileText,
    subsections: [
      { id: 'invoices-analytics', title: 'Invoice Analytics Page' },
      { id: 'invoices-breakdown', title: 'Invoice Breakdown' },
      { id: 'invoices-colors', title: 'Color Status System' },
      { id: 'invoices-memos', title: 'Invoice Memos' },
      { id: 'invoices-database', title: 'Invoice Database Schema' },
    ]
  },
  {
    id: 'payments', title: 'Payment System', icon: DollarSign,
    subsections: [
      { id: 'payments-analytics', title: 'Payment Analytics' },
      { id: 'payments-breakdown', title: 'Payment Breakdown' },
      { id: 'payments-applications', title: 'Payment Applications' },
      { id: 'payments-attachments', title: 'Check Images & Attachments' },
      { id: 'payments-database', title: 'Payment Database Schema' },
    ]
  },
  {
    id: 'ticketing', title: 'Collection Ticketing', icon: Ticket,
    subsections: [
      { id: 'ticketing-overview', title: 'Ticketing Overview' },
      { id: 'ticketing-workflow', title: 'Ticket Workflow' },
      { id: 'ticketing-auto-rules', title: 'Auto-Ticket Rules' },
      { id: 'ticketing-notes', title: 'Notes & Activity Log' },
      { id: 'ticketing-statuses', title: 'Status & Type Management' },
      { id: 'ticketing-database', title: 'Ticketing Database Schema' },
    ]
  },
  {
    id: 'collector', title: 'Collector System', icon: Activity,
    subsections: [
      { id: 'collector-dashboard', title: 'Collector Dashboard' },
      { id: 'collector-assignments', title: 'My Assignments' },
      { id: 'collector-hub', title: 'Collector Hub (Manager View)' },
      { id: 'collector-control', title: 'Collector Control Panel' },
    ]
  },
  {
    id: 'email', title: 'Email System', icon: Mail,
    subsections: [
      { id: 'email-overview', title: 'Email Architecture' },
      { id: 'email-inbox', title: 'Inbox & Inbound Emails' },
      { id: 'email-scheduler', title: 'Email Scheduler' },
      { id: 'email-templates', title: 'Email Templates' },
      { id: 'email-formulas', title: 'Email Formulas (Schedules)' },
      { id: 'email-sending', title: 'Sending Emails' },
      { id: 'email-tracking', title: 'Email Tracking & Analytics' },
      { id: 'email-settings', title: 'Email Settings & Senders' },
      { id: 'email-database', title: 'Email Database Schema' },
    ]
  },
  {
    id: 'reminders', title: 'Reminder System', icon: Bell,
    subsections: [
      { id: 'reminders-overview', title: 'Reminders Overview' },
      { id: 'reminders-creation', title: 'Creating Reminders' },
      { id: 'reminders-notifications', title: 'Notifications & Emails' },
      { id: 'reminders-database', title: 'Reminders Database Schema' },
    ]
  },
  {
    id: 'cron', title: 'Cron Jobs & Scheduled Tasks', icon: Clock,
    subsections: [
      { id: 'cron-list', title: 'All Cron Jobs' },
      { id: 'cron-monitoring', title: 'Cron Monitoring' },
      { id: 'cron-control', title: 'Cron Job Control' },
    ]
  },
  {
    id: 'api', title: 'GPT Data API', icon: Globe,
    subsections: [
      { id: 'api-overview', title: 'API Overview' },
      { id: 'api-auth', title: 'API Authentication' },
      { id: 'api-endpoints', title: 'All Endpoints' },
    ]
  },
  {
    id: 'admin', title: 'Admin & System Pages', icon: Settings,
    subsections: [
      { id: 'admin-dashboard', title: 'Admin Dashboard' },
      { id: 'admin-users', title: 'User Management' },
      { id: 'admin-sync-config', title: 'Sync Configuration' },
      { id: 'admin-webhooks', title: 'Webhook Configuration' },
      { id: 'admin-developer', title: 'Developer Tools' },
      { id: 'admin-global-search', title: 'Global Search' },
    ]
  },
  {
    id: 'activity', title: 'User Activity & Logging', icon: Activity,
    subsections: [
      { id: 'activity-logging', title: 'Activity Logging System' },
      { id: 'activity-analytics', title: 'Activity Analytics' },
    ]
  },
  {
    id: 'routes', title: 'All Application Routes', icon: Layers,
    subsections: [
      { id: 'routes-core', title: 'Core Routes' },
      { id: 'routes-admin', title: 'Admin & System Routes' },
      { id: 'routes-developer', title: 'Developer & Diagnostic Routes' },
    ]
  },
  {
    id: 'edge-functions', title: 'Edge Functions Reference', icon: Zap,
    subsections: [
      { id: 'ef-sync', title: 'Sync Functions' },
      { id: 'ef-email', title: 'Email Functions' },
      { id: 'ef-admin', title: 'Admin & User Functions' },
      { id: 'ef-analytics', title: 'Analytics Functions' },
      { id: 'ef-diagnostic', title: 'Diagnostic Functions' },
    ]
  },
];

function SectionHeading({ id, title }: { id: string; title: string }) {
  return <h2 id={id} className="text-2xl font-bold text-gray-800 mb-4 pt-6 border-b border-gray-200 pb-2 scroll-mt-20">{title}</h2>;
}

function SubHeading({ id, title }: { id: string; title: string }) {
  return <h3 id={id} className="text-lg font-semibold text-gray-700 mt-6 mb-3 scroll-mt-20">{title}</h3>;
}

function InfoCard({ title, children, color = 'blue' }: { title: string; children: React.ReactNode; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    amber: 'bg-amber-50 border-amber-200',
    red: 'bg-red-50 border-red-200',
    gray: 'bg-gray-50 border-gray-200',
  };
  return (
    <div className={`rounded-lg border p-4 mb-4 ${colors[color] || colors.blue}`}>
      <h4 className="font-semibold text-gray-800 mb-2">{title}</h4>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function TableDef({ columns }: { columns: { name: string; type: string; desc: string }[] }) {
  return (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead><tr className="bg-gray-100"><th className="px-3 py-2 text-left font-semibold text-gray-700">Column</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Type</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th></tr></thead>
        <tbody>{columns.map((c, i) => <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}><td className="px-3 py-1.5 font-mono text-xs text-blue-700">{c.name}</td><td className="px-3 py-1.5 font-mono text-xs text-gray-600">{c.type}</td><td className="px-3 py-1.5 text-gray-700">{c.desc}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function CronRow({ name, schedule, desc }: { name: string; schedule: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 p-3 bg-white border border-gray-200 rounded-lg mb-2">
      <div className="flex-shrink-0 w-48">
        <p className="font-mono text-sm font-semibold text-gray-800">{name}</p>
        <p className="font-mono text-xs text-blue-600 mt-0.5">{schedule}</p>
      </div>
      <p className="text-sm text-gray-700">{desc}</p>
    </div>
  );
}

function RouteRow({ path, component, desc }: { path: string; component: string; desc: string }) {
  return (
    <tr className="border-b border-gray-100">
      <td className="px-3 py-1.5 font-mono text-xs text-blue-700 whitespace-nowrap">{path}</td>
      <td className="px-3 py-1.5 font-mono text-xs text-gray-600">{component}</td>
      <td className="px-3 py-1.5 text-sm text-gray-700">{desc}</td>
    </tr>
  );
}

export default function SystemDocumentation({ onBack }: SystemDocumentationProps) {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('overview');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const generatePdf = useCallback(async () => {
    if (!contentRef.current || isGeneratingPdf) return;
    setIsGeneratingPdf(true);

    try {
      const source = contentRef.current;

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '800px';
      container.style.fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif';
      container.style.color = '#1a1a2e';
      container.style.lineHeight = '1.6';
      container.style.fontSize = '11px';
      document.body.appendChild(container);

      const cover = document.createElement('div');
      cover.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:1040px;text-align:center;';
      cover.innerHTML = `
        <h1 style="font-size:32px;font-weight:800;color:#1e40af;margin-bottom:8px;letter-spacing:-0.5px;">Venture Respiratory</h1>
        <div style="width:80px;height:3px;background:linear-gradient(to right,#2563eb,#06b6d4);border-radius:2px;margin:24px auto;"></div>
        <div style="font-size:18px;color:#475569;margin-bottom:40px;">AR Management System Documentation</div>
        <p style="color:#64748b;font-size:13px;max-width:500px;line-height:1.7;">
          Complete reference guide for the Accounts Receivable management platform,
          including Acumatica sync, collection ticketing, email automation,
          analytics, and administration.
        </p>
        <div style="font-size:12px;color:#94a3b8;margin-top:60px;">
          <p><strong style="color:#64748b;">Generated:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong style="color:#64748b;">Version:</strong> Production</p>
        </div>
      `;
      container.appendChild(cover);

      const toc = document.createElement('div');
      toc.style.cssText = 'padding-top:40px;';
      toc.innerHTML = `
        <h2 style="font-size:22px;color:#1e40af;margin-bottom:20px;font-weight:700;">Table of Contents</h2>
        ${SECTIONS.map((s, i) => `
          <div style="padding:6px 0;border-bottom:1px solid #f1f5f9;">
            <span style="color:#334155;font-weight:600;font-size:13px;">${i + 1}. ${s.title}</span>
            ${s.subsections ? s.subsections.map((sub, j) => `
              <div style="margin-left:20px;padding:3px 0;"><span style="font-size:11px;color:#64748b;">${i + 1}.${j + 1} ${sub.title}</span></div>
            `).join('') : ''}
          </div>
        `).join('')}
      `;
      container.appendChild(toc);

      const content = source.cloneNode(true) as HTMLElement;
      content.querySelectorAll('button').forEach(btn => btn.remove());
      content.querySelectorAll('svg').forEach(svg => svg.remove());
      container.appendChild(content);

      const filename = `Venture-Respiratory-Documentation-${new Date().toISOString().split('T')[0]}.pdf`;

      await html2pdf().set({
        margin: [0.5, 0.6, 0.5, 0.6],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      }).from(container).save();

      document.body.removeChild(container);
      setIsGeneratingPdf(false);
    } catch (err) {
      console.error('PDF generation error:', err);
      setIsGeneratingPdf(false);
    }
  }, [isGeneratingPdf]);

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const scrollTo = (id: string) => {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
    );
    const headings = document.querySelectorAll('h2[id], h3[id]');
    headings.forEach(h => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  const filteredSections = searchTerm
    ? SECTIONS.filter(s =>
        s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.subsections?.some(sub => sub.title.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : SECTIONS;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-600" />
                System Documentation
              </h1>
              <p className="text-xs text-gray-500">Complete system reference for all modules, pages, and processes</p>
            </div>
          </div>
          <button
            onClick={generatePdf}
            disabled={isGeneratingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {isGeneratingPdf ? 'Generating PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar TOC */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <div className="p-3">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search sections..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <nav className="space-y-0.5">
              {filteredSections.map(section => (
                <div key={section.id}>
                  <button
                    onClick={() => { toggleSection(section.id); scrollTo(section.id); }}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left text-sm transition-colors ${
                      activeSection === section.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <section.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 truncate">{section.title}</span>
                    {section.subsections && (
                      expandedSections.has(section.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                  {section.subsections && expandedSections.has(section.id) && (
                    <div className="ml-6 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2">
                      {section.subsections.map(sub => (
                        <button
                          key={sub.id}
                          onClick={() => scrollTo(sub.id)}
                          className={`w-full text-left px-2 py-1 text-xs rounded transition-colors ${
                            activeSection === sub.id ? 'text-blue-700 font-medium bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                          }`}
                        >
                          {sub.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div ref={contentRef} className="flex-1 max-w-5xl px-8 py-6 overflow-y-auto">

          {/* ========== OVERVIEW ========== */}
          <SectionHeading id="overview" title="System Overview" />
          <p className="text-gray-700 mb-4">This platform is a comprehensive <strong>Accounts Receivable (AR) management and collections automation system</strong> integrated with Acumatica ERP. It provides real-time invoice and payment synchronization, automated email campaigns, collection ticketing workflows, and detailed financial analytics.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <InfoCard title="Data Sources" color="blue"><p>Syncs with Acumatica ERP every 5 minutes for customers, invoices, and payments. All data is stored locally in Supabase PostgreSQL with full audit trails.</p></InfoCard>
            <InfoCard title="Email Automation" color="green"><p>Automated email campaigns via SendGrid with configurable schedules (formulas), templates, and per-customer assignments. Inbound email parsing via Mailgun with AI intent detection.</p></InfoCard>
            <InfoCard title="Collection Workflow" color="amber"><p>Ticket-based collection system with auto-rule engine, collector assignments, status tracking, promise dates, notes with voice/image/document attachments, and comprehensive activity logging.</p></InfoCard>
          </div>

          <InfoCard title="Technology Stack" color="gray">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Frontend:</strong> React 18 + TypeScript + Tailwind CSS + Vite</li>
              <li><strong>Backend:</strong> Supabase (PostgreSQL + Edge Functions + Storage + Auth)</li>
              <li><strong>Email:</strong> SendGrid (outbound) + Mailgun (inbound parsing)</li>
              <li><strong>AI:</strong> OpenAI GPT-4 for email intent analysis</li>
              <li><strong>ERP:</strong> Acumatica REST API (invoice, payment, customer sync)</li>
              <li><strong>Scheduling:</strong> pg_cron for automated tasks (17 active cron jobs)</li>
              <li><strong>Charts:</strong> Recharts for analytics visualization</li>
            </ul>
          </InfoCard>

          <InfoCard title="Main Sidebar Navigation" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Customer Management:</strong> Customers, My Assignments</li>
              <li><strong>Invoice Management:</strong> Invoice Analytics</li>
              <li><strong>Payment Management:</strong> Payment Analytics</li>
              <li><strong>Reminders:</strong> My Reminders</li>
              <li><strong>Administration:</strong> Ticketing System</li>
              <li><strong>Admin Dashboard (collapsible):</strong> Collector Dashboard, Customer Analytics, Invoice Analytics, Payment Analytics, Payment Breakdown, Invoice Breakdown</li>
              <li><strong>Settings (collapsible):</strong> Invoice Color Settings, User Approval, Create New User, User Activity, Synchronization Status, Ticket Status Settings, Auto-Ticket Rules, Email Settings, Documentation</li>
              <li><strong>Email System (collapsible):</strong> Inbox, Assignments, Formulas, Templates, Email Logs</li>
              <li><strong>Developer Settings (collapsible):</strong> Developer Tools, System Health, Sync Change Logs, Scheduler, System Logs</li>
            </ul>
          </InfoCard>

          {/* ========== AUTH ========== */}
          <SectionHeading id="auth" title="Authentication & Permissions" />

          <SubHeading id="auth-flow" title="Authentication Flow" />
          <p className="text-sm text-gray-700 mb-3">The system uses Supabase email/password authentication. Email confirmation is disabled -- new accounts require admin approval.</p>
          <InfoCard title="Sign In Process" color="blue">
            <ol className="list-decimal pl-4 space-y-1">
              <li>User enters email and password on the Sign In page</li>
              <li>System calls <code className="bg-gray-100 px-1 rounded text-xs">supabase.auth.signInWithPassword()</code></li>
              <li>On success, loads user profile from <code className="bg-gray-100 px-1 rounded text-xs">user_profiles</code> table</li>
              <li>Logs login activity via <code className="bg-gray-100 px-1 rounded text-xs">log_user_login</code> RPC</li>
              <li>Redirects based on role: admins to Payment Analytics, collectors to My Assignments, others to Customers</li>
            </ol>
          </InfoCard>
          <InfoCard title="Sign Up Process" color="green">
            <ol className="list-decimal pl-4 space-y-1">
              <li>User submits email, password, and full name</li>
              <li>Record is created in <code className="bg-gray-100 px-1 rounded text-xs">pending_users</code> table with status "pending"</li>
              <li>Admin receives notification and reviews the request in User Approval Panel</li>
              <li>On approval: auth user is created, user_profiles record is added, pending_users updated</li>
              <li>On decline: pending_users status set to "declined" with reason</li>
            </ol>
          </InfoCard>
          <InfoCard title="Security Features" color="amber">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Inactivity Timeout:</strong> 4-hour automatic logout with activity detection (mouse, keyboard, scroll)</li>
              <li><strong>Activity Throttling:</strong> Activity checks throttled to once per minute to reduce overhead</li>
              <li><strong>Session Persistence:</strong> Sessions maintained via Supabase JWT tokens</li>
              <li><strong>Password Reset:</strong> Token-based password reset via edge function with email delivery</li>
            </ul>
          </InfoCard>

          <SubHeading id="auth-roles" title="Roles & Permissions" />
          <p className="text-sm text-gray-700 mb-3">The system uses 4 roles with 21 consolidated permission groups. Admins bypass all permission checks.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <InfoCard title="Admin" color="blue"><p>Full system access. Can manage users, configure sync settings, impersonate users, access all analytics and diagnostic tools. All permissions automatically granted.</p></InfoCard>
            <InfoCard title="Manager" color="green"><p>Management and analytics access. Can view and manage customer data, run reports, monitor collectors, access email system. Cannot modify system configuration.</p></InfoCard>
            <InfoCard title="Collector" color="amber"><p>Customer-facing operations. Sees assigned tickets and invoices via My Assignments. Can add memos, change color statuses, add ticket notes and promise dates. Limited dashboard access.</p></InfoCard>
            <InfoCard title="Viewer" color="gray"><p>Read-only access. Can view customer data, invoices, payments, and reports. Cannot modify any records or access administrative features.</p></InfoCard>
          </div>

          <InfoCard title="21 Permission Groups" color="gray">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              <p><strong>Dashboard:</strong> DASHBOARD_MAIN, ANALYTICS_BASIC, ANALYTICS_ADVANCED</p>
              <p><strong>Core:</strong> CUSTOMERS, INVOICES, PAYMENTS, EMAILS</p>
              <p><strong>Features:</strong> REMINDERS, MY_ASSIGNMENTS, COLLECTION_TICKETING</p>
              <p><strong>Reports:</strong> REPORTS, STRIPE, MONITORING</p>
              <p><strong>Admin:</strong> ADMIN_USERS, ADMIN_ROLES, ADMIN_SYNC_CONFIG, ADMIN_WEBHOOKS, ADMIN_COLLECTOR_CONTROL, ADMIN_DASHBOARD</p>
              <p><strong>Technical:</strong> ACUMATICA, DIAGNOSTICS</p>
            </div>
            <p className="mt-2 text-xs text-gray-500">Each permission has 4 actions: can_view, can_create, can_edit, can_delete</p>
          </InfoCard>

          <SubHeading id="auth-impersonation" title="Impersonation System" />
          <p className="text-sm text-gray-700 mb-3">Admins can impersonate any user to test their experience. Impersonation state is stored in localStorage and persists across page refreshes. A yellow banner shows at the top of the page when impersonation is active. All impersonation start/stop events are logged.</p>

          <SubHeading id="auth-approval" title="User Approval Workflow" />
          <p className="text-sm text-gray-700 mb-3">New user registrations go to a pending queue. The User Approval Panel (<code className="bg-gray-100 px-1 rounded text-xs">/user-approval</code>) shows all pending, approved, and declined users. Admins can approve (which triggers the <code className="bg-gray-100 px-1 rounded text-xs">approve-pending-user</code> edge function to create the actual auth account) or decline with a reason.</p>

          {/* ========== SYNC ========== */}
          <SectionHeading id="sync" title="Acumatica Sync System" />

          <SubHeading id="sync-overview" title="Sync Architecture" />
          <p className="text-sm text-gray-700 mb-3">The sync system maintains a local copy of Acumatica ERP data (customers, invoices, payments) in Supabase. Syncs run every 5 minutes via a cron job that triggers the master sync edge function.</p>
          <InfoCard title="Sync Flow" color="blue">
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Cron trigger:</strong> <code className="bg-gray-100 px-1 rounded text-xs">acumatica-auto-sync</code> fires every 5 minutes</li>
              <li><strong>Master sync:</strong> <code className="bg-gray-100 px-1 rounded text-xs">acumatica-master-sync</code> orchestrates sequential sync: Customer, Invoice, Payment</li>
              <li><strong>Session management:</strong> Shared Acumatica session manager handles login/logout, respecting concurrent user limits</li>
              <li><strong>Incremental sync:</strong> Each entity sync queries by LastModifiedDateTime to fetch only changed records</li>
              <li><strong>Upsert logic:</strong> Records are upserted by unique reference (customer_id, reference_number+type)</li>
              <li><strong>Change logging:</strong> All creates, updates, deletes, and status changes are logged to <code className="bg-gray-100 px-1 rounded text-xs">sync_change_logs</code></li>
            </ol>
          </InfoCard>

          <SubHeading id="sync-master" title="Master Sync Orchestrator" />
          <p className="text-sm text-gray-700 mb-3">The <code className="bg-gray-100 px-1 rounded text-xs">acumatica-master-sync</code> edge function loads credentials from <code className="bg-gray-100 px-1 rounded text-xs">acumatica_sync_credentials</code>, then calls each entity sync function sequentially. It updates <code className="bg-gray-100 px-1 rounded text-xs">sync_status</code> with progress and results (records synced, created, updated, duration, errors). On failure, retry_count is incremented.</p>

          <SubHeading id="sync-invoices" title="Invoice Sync" />
          <InfoCard title="acumatica-invoice-incremental-sync" color="green">
            <ul className="list-disc pl-4 space-y-1">
              <li>Queries Acumatica for invoices modified since last sync (configurable lookback window, default 10,000 minutes)</li>
              <li>Maps fields: ReferenceNbr, Status, Date, Customer, Amount, Balance, DueDate, Terms, Description, etc.</li>
              <li>Normalizes reference numbers to 6-digit zero-padded format</li>
              <li>Upserts by (reference_number, type) unique constraint</li>
              <li>Detects status transitions (Open to Closed, Closed to Reopened) and logs them</li>
              <li>Stores complete raw API response for audit/recovery</li>
            </ul>
          </InfoCard>

          <SubHeading id="sync-payments" title="Payment Sync" />
          <InfoCard title="acumatica-payment-incremental-sync" color="green">
            <p className="mb-2">The most complex sync with three major subsystems:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Core Payment Sync:</strong> Fetches payments with DocDate, FinPeriodID custom fields. Maps Type, Status, PaymentAmount, CustomerID, PaymentMethod, CashAccount, etc.</li>
              <li><strong>Voided Payment Auto-Fetch:</strong> When a payment status changes to "Voided", automatically fetches the corresponding "Voided Payment" record and stores it separately</li>
              <li><strong>Application History:</strong> For each payment, fetches ApplicationHistory from Acumatica. Upserts into <code className="bg-gray-100 px-1 rounded text-xs">payment_invoice_applications</code> with amount_paid, application_date, doc_type, balance, cash_discount_taken. Auto-fetches missing invoices referenced by applications.</li>
              <li><strong>Check Images:</strong> Downloads file attachments from payments, uploads to <code className="bg-gray-100 px-1 rounded text-xs">payment-check-images</code> storage bucket, stores metadata in <code className="bg-gray-100 px-1 rounded text-xs">payment_attachments</code></li>
            </ul>
          </InfoCard>

          <SubHeading id="sync-customers" title="Customer Sync" />
          <p className="text-sm text-gray-700 mb-3">Syncs customer master data including CustomerID, Name, Status, Class, CreditLimit, Contact info (phone, email), CreditVerificationRules, CreditHold, StatementType, PrimaryContact. Expands MainContact relationship for full details.</p>

          <SubHeading id="sync-tables" title="Sync Database Tables" />
          <InfoCard title="sync_status" color="gray">
            <p>One row per entity type (customer, invoice, payment, all). Tracks: status (idle/running/completed/failed), last_successful_sync, records_synced/created/updated, sync_duration_ms, errors (jsonb array), retry_count, sync_enabled, sync_interval_minutes, lookback_minutes.</p>
          </InfoCard>
          <InfoCard title="sync_change_logs" color="gray">
            <p>Comprehensive change audit trail. Fields: sync_type (customer/invoice/payment/payment_application), action_type (created/updated/closed/reopened/status_changed/application_fetched/attachment_fetched), entity_id, entity_reference, entity_name, change_summary, change_details (jsonb with old/new values), sync_source. Cleaned up daily (older than 30 days).</p>
          </InfoCard>
          <InfoCard title="async_sync_jobs" color="gray">
            <p>Tracks async background sync operations (date range syncs, bulk fetches). Fields: entity_type, start_date, end_date, status (pending/running/completed/failed), progress (jsonb with created/updated/total/errors), error_message, created_by.</p>
          </InfoCard>

          <SubHeading id="sync-monitoring" title="Sync Monitoring Pages" />
          <div className="space-y-2 mb-4">
            <InfoCard title="/sync-status - Sync Status Dashboard" color="blue"><p>Shows current sync status for each entity type with last sync time, record counts, and error details.</p></InfoCard>
            <InfoCard title="/sync-health - Sync Health Dashboard" color="blue"><p>Monitors health of Acumatica sync. Identifies "stuck" syncs (running over 10 minutes) and can auto-fix them. Shows recent sync history.</p></InfoCard>
            <InfoCard title="/live-sync-monitor - Live Sync Monitor" color="blue"><p>Real-time dashboard updating every 1 second. Shows active sync progress (items processed, current item, status) and last 10 completed syncs.</p></InfoCard>
            <InfoCard title="/sync-logs - Sync Change Logs" color="blue"><p>Searchable, filterable view of all sync changes. Filter by entity type, action type, date range. Shows detailed change diffs.</p></InfoCard>
            <InfoCard title="/sync-config - Sync Configuration" color="blue"><p>Configure Acumatica credentials, per-entity sync settings (interval, lookback, enabled), trigger date range syncs, manage sync report recipients.</p></InfoCard>
          </div>

          {/* ========== CUSTOMERS ========== */}
          <SectionHeading id="customers" title="Customer Management" />

          <SubHeading id="customers-list" title="Customer List & Filters" />
          <p className="text-sm text-gray-700 mb-3">The Customers page (<code className="bg-gray-100 px-1 rounded text-xs">/customers</code>) is the central hub for viewing and managing all customers. It loads data via the <code className="bg-gray-100 px-1 rounded text-xs">get_customers_with_balance</code> RPC function which computes live balances from invoices.</p>
          <InfoCard title="Features" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Advanced Filtering:</strong> Balance ranges (min/max), invoice count ranges, days overdue ranges, date context, color status, customer class</li>
              <li><strong>Search:</strong> Full-text search across customer name, ID, and email</li>
              <li><strong>Sorting:</strong> By balance, invoice count, customer name, days overdue, average days to collect</li>
              <li><strong>Batch Operations:</strong> Bulk color status changes, bulk Excel export, bulk email actions</li>
              <li><strong>Quick Filters:</strong> User-saved filter presets with drag-and-drop reordering (stored in <code className="bg-gray-100 px-1 rounded text-xs">user_quick_filters</code>)</li>
              <li><strong>Pagination:</strong> Loads 1,000 customers per batch for performance</li>
              <li><strong>Exclude toggles:</strong> Exclude test customers, exclude credit memos from balance calculations</li>
            </ul>
          </InfoCard>

          <SubHeading id="customers-detail" title="Customer Detail View" />
          <p className="text-sm text-gray-700 mb-3">Clicking a customer opens a detailed view with tabs for invoices, payments, balance breakdown, collection tickets, communication history, and a customer timeline chart showing balance progression over time.</p>

          <SubHeading id="customers-analytics" title="Customer Analytics" />
          <p className="text-sm text-gray-700 mb-3">The Customer Analytics page (<code className="bg-gray-100 px-1 rounded text-xs">/customer-analytics</code>) provides portfolio-level analytics: total customers, active count, high-balance count, total/average balance. Features preset filters (High Balance &gt;$10k, Medium $5k-$10k, etc.) and a custom filter builder with AND/OR logic. Includes Excel export capability.</p>

          <SubHeading id="customers-statements" title="Statements & Reports" />
          <InfoCard title="Customer Statements (/customer-statements)" color="green">
            <p>Statement distribution dashboard. Select multiple customers, choose an email template, generate PDF statements, and send via email. Shows statistics: total customers, total balance, open invoice count.</p>
          </InfoCard>
          <InfoCard title="Customer Reports Monthly (/customer-reports)" color="green">
            <p>Batch statement generation tool. Select customers with balance filtering, choose template with variable substitution (customer_name, balance, invoice_table, payment_table, days_overdue, etc.), generate PDFs, send emails. Tracks progress of generation and sending.</p>
          </InfoCard>
          <InfoCard title="Report Templates (/customer-report-templates)" color="green">
            <p>CRUD interface for email statement templates. Fields: name, subject, body. Supports variables: {'{'}{'{'} customer_name {'}'}{'}'}, {'{'}{'{'} balance {'}'}{'}'}, {'{'}{'{'} total_invoices {'}'}{'}'}, {'{'}{'{'} date_from {'}'}{'}'}, {'{'}{'{'} date_to {'}'}{'}'}, etc. Copy, test, preview, and set default template.</p>
          </InfoCard>

          <SubHeading id="customers-monthly" title="Monthly Communication Sheet" />
          <p className="text-sm text-gray-700 mb-3">Calendar-style monthly tracking per customer. Shows status per month (pending, active, sent, responded, postponed, inactive, no_response). Tracks emails sent/received, file uploads, and notes. Stored in <code className="bg-gray-100 px-1 rounded text-xs">customer_monthly_tracking</code> table.</p>

          <SubHeading id="customers-assignments" title="Email Assignments" />
          <p className="text-sm text-gray-700 mb-3">Links customers to email automation campaigns. Each assignment connects a customer to an email formula (schedule) and template (content) with a configurable start day of month and timezone. The email scheduler cron evaluates these assignments to determine when to send.</p>

          <SubHeading id="customers-database" title="Customer Database Schema" />
          <TableDef columns={[
            { name: 'customer_id', type: 'text UNIQUE', desc: 'Acumatica customer code (e.g., "15279059")' },
            { name: 'customer_name', type: 'text', desc: 'Full customer legal name' },
            { name: 'customer_status', type: 'text', desc: 'Active/Inactive status' },
            { name: 'customer_class', type: 'text', desc: 'Classification (distributor, retailer, etc.)' },
            { name: 'balance', type: 'numeric', desc: 'Current account balance from Acumatica' },
            { name: 'credit_limit', type: 'numeric', desc: 'Credit limit assigned' },
            { name: 'terms', type: 'text', desc: 'Payment terms code' },
            { name: 'general_email', type: 'text', desc: 'General contact email' },
            { name: 'billing_email', type: 'text', desc: 'Invoice billing email' },
            { name: 'is_active', type: 'boolean', desc: 'Whether customer is active for collections' },
            { name: 'postpone_until', type: 'timestamptz', desc: 'Postpone all outreach until this date' },
            { name: 'responded_this_month', type: 'boolean', desc: 'Customer response tracking flag' },
            { name: 'raw_data', type: 'jsonb', desc: 'Complete raw Acumatica API response' },
          ]} />

          {/* ========== INVOICES ========== */}
          <SectionHeading id="invoices" title="Invoice System" />

          <SubHeading id="invoices-analytics" title="Invoice Analytics Page" />
          <p className="text-sm text-gray-700 mb-3">The Invoice Analytics page (<code className="bg-gray-100 px-1 rounded text-xs">/invoice-analytics</code>) provides a calendar-based view of invoices with three zoom levels: daily, monthly, and yearly.</p>
          <InfoCard title="Calendar Views" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Daily View:</strong> Month calendar grid showing per-day net amount (invoices minus credit memos), open CM deduction, and open balance</li>
              <li><strong>Monthly View:</strong> 12-month grid showing per-month totals with net amount, credit memo deduction, open balance breakdown (open invoices + balanced - open CMs), and balanced invoice count</li>
              <li><strong>Yearly View:</strong> Multi-year cards with the same breakdown at yearly granularity</li>
            </ul>
          </InfoCard>
          <InfoCard title="Customer-Grouped Table" color="green">
            <p>Below the calendar, a table groups invoices by customer showing: customer name, invoice count, total amount, open balance. Expandable rows show individual invoices with reference number, type, status, date, due date, amount, balance, and color status. Supports search, sorting, and filtering by status/type.</p>
          </InfoCard>
          <InfoCard title="Data Loading" color="gray">
            <p>Uses progressive batch loading (500 invoices per batch) for fast initial render. Monthly/yearly views use <code className="bg-gray-100 px-1 rounded text-xs">cached_invoice_analytics</code> table refreshed hourly by cron. Daily view queries <code className="bg-gray-100 px-1 rounded text-xs">acumatica_invoices</code> directly with date range pagination.</p>
          </InfoCard>

          <SubHeading id="invoices-breakdown" title="Invoice Breakdown" />
          <p className="text-sm text-gray-700 mb-3">The Invoice Breakdown page (<code className="bg-gray-100 px-1 rounded text-xs">/invoice-breakdown</code>) provides month-by-month invoice comparison with daily drill-down. Shows monthly totals by type (Invoice, Credit Memo, Debit Memo), date range filtering, and Acumatica verification tools for data integrity checks. Includes CSV export.</p>

          <SubHeading id="invoices-colors" title="Color Status System" />
          <InfoCard title="Invoice Color Statuses" color="amber">
            <ul className="list-disc pl-4 space-y-1">
              <li>Invoices can be assigned color statuses (Red, Yellow, Green, etc.) by collectors for visual tracking</li>
              <li><strong>Auto-Red System:</strong> Cron job (<code className="bg-gray-100 px-1 rounded text-xs">auto-red-status-checker</code>) runs every 5 minutes. Marks invoices RED when past due or untouched for 30+ days. Clears RED when paid.</li>
              <li>Color statuses are managed in <code className="bg-gray-100 px-1 rounded text-xs">invoice_color_status_options</code> table via <code className="bg-gray-100 px-1 rounded text-xs">/invoice-color-settings</code></li>
              <li>All color changes are logged in <code className="bg-gray-100 px-1 rounded text-xs">user_activity_logs</code></li>
            </ul>
          </InfoCard>

          <SubHeading id="invoices-memos" title="Invoice Memos" />
          <p className="text-sm text-gray-700 mb-3">Collectors and admins can add memos to invoices. Memos support text content and document attachments (stored in <code className="bg-gray-100 px-1 rounded text-xs">memo-attachments</code> storage bucket). Adding a memo to an invoice that belongs to a ticket also logs it to the ticket's activity log.</p>

          <SubHeading id="invoices-database" title="Invoice Database Schema" />
          <TableDef columns={[
            { name: 'reference_number', type: 'text', desc: 'Acumatica invoice reference (6-digit zero-padded)' },
            { name: 'type', type: 'text', desc: 'Invoice, Credit Memo, Debit Memo, Credit WO' },
            { name: 'status', type: 'text', desc: 'Open, Closed, Balanced, Canceled, On Hold' },
            { name: 'date', type: 'text', desc: 'Invoice date' },
            { name: 'due_date', type: 'text', desc: 'Payment due date' },
            { name: 'amount', type: 'numeric', desc: 'Original invoice amount' },
            { name: 'balance', type: 'numeric', desc: 'Remaining unpaid balance' },
            { name: 'customer', type: 'text', desc: 'Customer ID reference' },
            { name: 'customer_name', type: 'text', desc: 'Denormalized customer name' },
            { name: 'color_status', type: 'text', desc: 'Visual tracking color (red, yellow, green, etc.)' },
            { name: 'promise_date', type: 'date', desc: 'Customer promised payment date' },
            { name: 'last_modified_datetime', type: 'text', desc: 'Last modified in Acumatica' },
          ]} />

          {/* ========== PAYMENTS ========== */}
          <SectionHeading id="payments" title="Payment System" />

          <SubHeading id="payments-analytics" title="Payment Analytics" />
          <p className="text-sm text-gray-700 mb-3">The Payment Analytics page (<code className="bg-gray-100 px-1 rounded text-xs">/payment-analytics</code>) shows detailed payment data with month/year navigation. Displays a table with: Date, Reference Number, Customer, Payment Method, Type, Amount, Status, and expandable Invoice Applications showing how each payment was applied to invoices. Includes search, sorting, and Excel export.</p>

          <SubHeading id="payments-breakdown" title="Payment Breakdown" />
          <p className="text-sm text-gray-700 mb-3">The Payment Breakdown page (<code className="bg-gray-100 px-1 rounded text-xs">/payment-breakdown</code>) provides month-by-month payment comparison similar to Invoice Breakdown. Shows totals by payment type (Payment, Prepayment, Voided Payment, Refund, Balance WO, Credit Memo, Debit Memo). Daily drill-down capability, date range filtering, Acumatica verification, and CSV export.</p>

          <SubHeading id="payments-applications" title="Payment Applications" />
          <InfoCard title="Payment-Invoice Links" color="green">
            <p>The <code className="bg-gray-100 px-1 rounded text-xs">payment_invoice_applications</code> table tracks how payments are applied to invoices. Each application record links a payment to an invoice with amount_paid, application_date, doc_type, balance, cash_discount_taken. These are synced from Acumatica's ApplicationHistory during payment sync.</p>
          </InfoCard>

          <SubHeading id="payments-attachments" title="Check Images & Attachments" />
          <p className="text-sm text-gray-700 mb-3">Payment attachments (check images, documents) are synced from Acumatica and stored in the <code className="bg-gray-100 px-1 rounded text-xs">payment-check-images</code> Supabase storage bucket. Metadata tracked in <code className="bg-gray-100 px-1 rounded text-xs">payment_attachments</code> table with fields: file_name, file_type, file_size, storage_path, is_check_image.</p>

          <SubHeading id="payments-database" title="Payment Database Schema" />
          <TableDef columns={[
            { name: 'reference_number', type: 'text', desc: 'Acumatica payment reference number' },
            { name: 'type', type: 'text', desc: 'Payment, Prepayment, Voided Payment, Refund, Credit Memo, etc.' },
            { name: 'status', type: 'text', desc: 'Open, Closed, Voided, Released, etc.' },
            { name: 'payment_amount', type: 'numeric', desc: 'Payment amount' },
            { name: 'available_balance', type: 'numeric', desc: 'Unapplied balance' },
            { name: 'customer_id', type: 'text', desc: 'Customer ID reference' },
            { name: 'customer_name', type: 'text', desc: 'Denormalized customer name' },
            { name: 'payment_method', type: 'text', desc: 'Check, ACH, Wire, Credit Card, etc.' },
            { name: 'application_date', type: 'text', desc: 'Date payment was applied' },
            { name: 'doc_date', type: 'text', desc: 'Document date from Acumatica' },
            { name: 'financial_period', type: 'text', desc: 'Financial period (e.g., 012026)' },
          ]} />

          {/* ========== TICKETING ========== */}
          <SectionHeading id="ticketing" title="Collection Ticketing" />

          <SubHeading id="ticketing-overview" title="Ticketing Overview" />
          <p className="text-sm text-gray-700 mb-3">The collection ticketing system groups invoices into manageable work units assigned to collectors. Tickets are the primary workflow mechanism for tracking collection efforts on customer accounts.</p>

          <SubHeading id="ticketing-workflow" title="Ticket Workflow" />
          <InfoCard title="Ticket Lifecycle" color="blue">
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>Creation:</strong> Tickets can be created manually or automatically via auto-ticket rules</li>
              <li><strong>Assignment:</strong> Each ticket is assigned to a collector who sees it in their My Assignments view</li>
              <li><strong>Invoice Linking:</strong> One or more invoices are linked to a ticket via <code className="bg-gray-100 px-1 rounded text-xs">ticket_invoices</code> junction table</li>
              <li><strong>Working:</strong> Collector adds notes, changes statuses, sets promise dates, adds memos to individual invoices</li>
              <li><strong>Status Progression:</strong> open &rarr; pending &rarr; promised &rarr; paid &rarr; closed (customizable)</li>
              <li><strong>Auto-Close (Trigger):</strong> Real-time trigger on <code className="bg-gray-100 px-1 rounded text-xs">acumatica_invoices</code> fires when an invoice status changes to "Closed" or balance drops to 0. Checks if all invoices on linked tickets are paid and auto-closes the ticket.</li>
              <li><strong>Auto-Close (Cron):</strong> Safety net cron (<code className="bg-gray-100 px-1 rounded text-xs">auto-close-paid-tickets</code>) runs every 10 minutes. Catches tickets missed by the trigger (e.g., invoices arriving already closed from Acumatica bulk sync, tickets with zero invoices, direct DB changes).</li>
            </ol>
          </InfoCard>

          <SubHeading id="ticketing-auto-rules" title="Auto-Ticket Rules" />
          <InfoCard title="Auto-Ticket Rule Engine" color="green">
            <ul className="list-disc pl-4 space-y-1">
              <li>Configured per customer at <code className="bg-gray-100 px-1 rounded text-xs">/auto-ticket-rules</code></li>
              <li><strong>Invoice Age Rule:</strong> Creates tickets when invoices are between min_days_old and max_days_old</li>
              <li><strong>Payment Recency Rule:</strong> Creates tickets when no payment received within configured day range</li>
              <li><strong>Combined Logic:</strong> Supports invoice_only, payment_only, both_and, both_or conditions</li>
              <li>Processed daily at 6 AM UTC by <code className="bg-gray-100 px-1 rounded text-xs">process-auto-ticket-rules</code> (also callable via the DB function <code className="bg-gray-100 px-1 rounded text-xs">process_auto_ticket_rules()</code>)</li>
              <li>Idempotent: adds new invoices to existing tickets rather than duplicating</li>
            </ul>
          </InfoCard>

          <SubHeading id="ticketing-notes" title="Notes & Activity Log" />
          <InfoCard title="Ticket Notes" color="amber">
            <ul className="list-disc pl-4 space-y-1">
              <li>Rich notes with text, voice memos, images, and document attachments</li>
              <li>Attachments stored in <code className="bg-gray-100 px-1 rounded text-xs">ticket-note-attachments</code> storage bucket</li>
              <li>Document uploads support multiple files per note via <code className="bg-gray-100 px-1 rounded text-xs">document_urls</code> array</li>
              <li>All note creations auto-logged to <code className="bg-gray-100 px-1 rounded text-xs">ticket_activity_log</code> with metadata</li>
            </ul>
          </InfoCard>
          <InfoCard title="Activity Log" color="amber">
            <p>Every ticket operation is tracked: note additions, status changes, assignment changes, invoice additions/removals, ticket creation. Stored in <code className="bg-gray-100 px-1 rounded text-xs">ticket_activity_log</code> with activity_type, description, created_by, and metadata (jsonb). Status changes also tracked separately in <code className="bg-gray-100 px-1 rounded text-xs">ticket_status_history</code> with old_status, new_status, and optional notes.</p>
          </InfoCard>

          <SubHeading id="ticketing-statuses" title="Status & Type Management" />
          <p className="text-sm text-gray-700 mb-3">Ticket statuses and types are configurable by admins:</p>
          <ul className="list-disc pl-6 text-sm text-gray-700 mb-4 space-y-1">
            <li><strong>Status Options</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/ticket-status-settings</code>): Default statuses include open, pending, promised, paid, disputed, closed. Each has a display name, color class, sort order. System statuses cannot be deleted.</li>
            <li><strong>Type Options</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/ticket-status-settings</code>): Default types include overdue payment, settlement, partial payment, chargeback, dispute, follow up, payment plan, other. Each has a label, value, display order, and active flag.</li>
          </ul>

          <SubHeading id="ticketing-database" title="Ticketing Database Schema" />
          <TableDef columns={[
            { name: 'ticket_number', type: 'text UNIQUE', desc: 'Auto-generated ID (TKT000001-999999)' },
            { name: 'customer_id', type: 'text', desc: 'Acumatica customer ID' },
            { name: 'customer_name', type: 'text', desc: 'Denormalized customer name' },
            { name: 'assigned_collector_id', type: 'uuid FK', desc: 'Assigned collector (user_profiles)' },
            { name: 'status', type: 'text', desc: 'open, pending, promised, paid, disputed, closed' },
            { name: 'priority', type: 'text', desc: 'low, medium, high, urgent' },
            { name: 'ticket_type', type: 'text', desc: 'Overdue payment, settlement, etc.' },
            { name: 'promise_date', type: 'date', desc: 'Customer promised payment date' },
            { name: 'due_date', type: 'date', desc: 'Ticket due date' },
            { name: 'notes', type: 'text', desc: 'General ticket notes' },
            { name: 'created_by', type: 'uuid FK', desc: 'User who created the ticket' },
            { name: 'resolved_at', type: 'timestamptz', desc: 'When ticket was resolved' },
          ]} />

          {/* ========== COLLECTOR ========== */}
          <SectionHeading id="collector" title="Collector System" />

          <SubHeading id="collector-dashboard" title="Collector Dashboard" />
          <p className="text-sm text-gray-700 mb-3">The collector's personal work interface for managing assigned invoices and tickets. Shows tickets grouped by customer with associated invoices, balances, statuses. Supports adding memos, changing color statuses, creating ticket notes, and setting promise dates. Real-time subscription to data changes for automatic refresh.</p>

          <SubHeading id="collector-assignments" title="My Assignments" />
          <p className="text-sm text-gray-700 mb-3">The My Assignments page (<code className="bg-gray-100 px-1 rounded text-xs">/my-assignments</code>) is the collector's primary view. Shows only tickets assigned to the current user. Features batch operations (bulk status change, bulk color change), ticket history expansion, and individual invoice management.</p>

          <SubHeading id="collector-hub" title="Collector Hub (Manager View)" />
          <p className="text-sm text-gray-700 mb-3">The Collector Hub (<code className="bg-gray-100 px-1 rounded text-xs">/collector-performance</code>) is a management dashboard showing all collectors' performance metrics: amount collected, status changes made, actions completed, working days. Date range filtering (default 30 days). Expandable details per collector showing closed tickets and collected invoices.</p>

          <SubHeading id="collector-control" title="Collector Control Panel" />
          <p className="text-sm text-gray-700 mb-3">Admin interface at <code className="bg-gray-100 px-1 rounded text-xs">/collector-control-panel</code> with three tabs: Invoices (assigned invoice management with color statuses), Assignments (create/manage customer-level collector assignments), and Emails (view scheduled email campaigns per collector).</p>

          {/* ========== EMAIL ========== */}
          <SectionHeading id="email" title="Email System" />

          <SubHeading id="email-overview" title="Email Architecture" />
          <InfoCard title="Email Infrastructure" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Outbound:</strong> SendGrid for all email sending (statements, automated campaigns, reminders, sync reports)</li>
              <li><strong>Inbound:</strong> Mailgun webhook routes incoming customer emails to <code className="bg-gray-100 px-1 rounded text-xs">email-receiver</code> edge function</li>
              <li><strong>AI Processing:</strong> GPT-4 analyzes inbound email intent (file_attached, stop, postpone, question, general)</li>
              <li><strong>Tracking:</strong> SendGrid webhooks update delivery status, open counts, click counts, bounce reasons</li>
              <li><strong>Department Senders:</strong> Configurable per-department from/reply-to addresses (AR, Census, Tickets, Reminders, NoReply)</li>
            </ul>
          </InfoCard>

          <SubHeading id="email-inbox" title="Inbox & Inbound Emails" />
          <p className="text-sm text-gray-700 mb-3">The Inbox Dashboard (<code className="bg-gray-100 px-1 rounded text-xs">/inbox</code>) provides a Gmail-like email client with folders (inbox, archive, starred, important, spam, trash). Shows inbound emails with sender, subject, received date, and AI analysis results (detected intent, confidence score, action taken). Supports advanced search with date filters and attachment filtering. Pagination at 20 emails per page.</p>

          <SubHeading id="email-scheduler" title="Email Scheduler" />
          <InfoCard title="How Email Scheduling Works" color="green">
            <ol className="list-decimal pl-4 space-y-1">
              <li>Each customer can have one or more <strong>assignments</strong> linking them to a formula (schedule) and template (content)</li>
              <li>The <code className="bg-gray-100 px-1 rounded text-xs">email-scheduler</code> edge function runs every minute via cron</li>
              <li>It evaluates all active assignments against their formula's schedule (day of month + time slots)</li>
              <li>Respects customer timezone settings for accurate send timing</li>
              <li>Skips inactive, postponed, or already-sent-today customers</li>
              <li>Prevents duplicate sends via <code className="bg-gray-100 px-1 rounded text-xs">dedup_key</code> in email_logs</li>
              <li>Sends via SendGrid and logs results to <code className="bg-gray-100 px-1 rounded text-xs">email_logs</code> and <code className="bg-gray-100 px-1 rounded text-xs">scheduler_execution_logs</code></li>
            </ol>
          </InfoCard>

          <SubHeading id="email-templates" title="Email Templates" />
          <p className="text-sm text-gray-700 mb-3">Reusable templates stored in <code className="bg-gray-100 px-1 rounded text-xs">email_templates</code>. Each has name, subject, and body supporting variable substitution: {'{'}{'{'} customer_name {'}'}{'}'}, {'{'}{'{'} balance {'}'}{'}'}, {'{'}{'{'} invoice_table {'}'}{'}'}, {'{'}{'{'} payment_table {'}'}{'}'}, {'{'}{'{'} date_from {'}'}{'}'}, {'{'}{'{'} date_to {'}'}{'}'}, {'{'}{'{'} days_overdue {'}'}{'}'}. Managed at <code className="bg-gray-100 px-1 rounded text-xs">/templates</code>.</p>

          <SubHeading id="email-formulas" title="Email Formulas (Schedules)" />
          <p className="text-sm text-gray-700 mb-3">Formulas define when emails should be sent. Each formula has a name, description, and schedule (JSONB array of day + time entries, e.g., "Day 1 at 9:00 AM, Day 15 at 2:00 PM"). Managed at <code className="bg-gray-100 px-1 rounded text-xs">/formulas</code>.</p>

          <SubHeading id="email-sending" title="Sending Emails" />
          <InfoCard title="Email Sending Functions" color="green">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>send-email-reply:</strong> General-purpose email sending via SendGrid. Supports flexible from/reply-to, text/HTML content, department-based sender config.</li>
              <li><strong>send-customer-invoice-email:</strong> Sends formatted invoice statements with HTML tables, PDF/Excel attachments, variable substitution. Tracks in <code className="bg-gray-100 px-1 rounded text-xs">customer_email_logs</code>.</li>
              <li><strong>send-reminder-emails:</strong> Internal staff notifications for due reminders. Includes priority indicators, action links, and due dates.</li>
              <li><strong>send-sync-report:</strong> Twice-daily HTML sync status reports to configured recipients.</li>
              <li><strong>send-temporary-password:</strong> Welcome emails to new admin users with temporary passwords and login instructions.</li>
            </ul>
          </InfoCard>

          <SubHeading id="email-tracking" title="Email Tracking & Analytics" />
          <p className="text-sm text-gray-700 mb-3">SendGrid webhooks (<code className="bg-gray-100 px-1 rounded text-xs">sendgrid-webhook</code> edge function) track: delivered, opened (with count), clicked (with count), bounced (with reason), dropped. Status updated in <code className="bg-gray-100 px-1 rounded text-xs">customer_email_logs</code>. The Customer Email Tracking page (<code className="bg-gray-100 px-1 rounded text-xs">/customer-email-tracking</code>) shows per-customer email history with delivery status. The Email Analytics page (<code className="bg-gray-100 px-1 rounded text-xs">/email-analytics</code>) shows aggregate metrics over time.</p>

          <SubHeading id="email-settings" title="Email Settings & Senders" />
          <p className="text-sm text-gray-700 mb-3">Global email settings at <code className="bg-gray-100 px-1 rounded text-xs">/email-settings</code>: AR from email, noreply email, reply-to addresses, company name, domain, SendGrid tracking toggles. Department-specific sender overrides for AR, Census, Tickets, Reminders, and NoReply departments.</p>

          <SubHeading id="email-database" title="Email Database Schema" />
          <p className="text-sm text-gray-700 mb-2">Key email tables:</p>
          <div className="space-y-2 mb-4">
            <InfoCard title="inbound_emails" color="gray"><p>Stores all received customer emails: sender_email, subject, body, processing_status (pending/processed/manual_review), folder (inbox/spam/archive/trash), is_read, is_starred, thread_id, message_id</p></InfoCard>
            <InfoCard title="email_analysis" color="gray"><p>AI analysis results: detected_intent (file_attached/postpone/stop/general/unclear), confidence_score (0.0-1.0), keywords_found, action_taken</p></InfoCard>
            <InfoCard title="email_logs" color="gray"><p>Scheduler email audit trail: customer_id, assignment_id, template_id, subject, sent_at, status (pending/sent/failed), dedup_key, sendgrid_message_id</p></InfoCard>
            <InfoCard title="customer_email_logs" color="gray"><p>Customer statement email tracking: delivery status, open_count, click_count, bounce_reason, sendgrid_message_id, invoice_count, total_balance</p></InfoCard>
            <InfoCard title="outbound_replies" color="gray"><p>Audit trail of replies sent to inbound emails: sent_to, subject, body, sent_by user_id</p></InfoCard>
          </div>

          {/* ========== REMINDERS ========== */}
          <SectionHeading id="reminders" title="Reminder System" />

          <SubHeading id="reminders-overview" title="Reminders Overview" />
          <p className="text-sm text-gray-700 mb-3">Internal reminder system for scheduling follow-ups on invoices and tickets. Reminders can be created manually and trigger notifications (in-app popup + optional email) when due.</p>

          <SubHeading id="reminders-creation" title="Creating Reminders" />
          <InfoCard title="Reminder Fields" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Title:</strong> Short description (required)</li>
              <li><strong>Description:</strong> Detailed notes (optional)</li>
              <li><strong>Reminder Date/Time:</strong> When the reminder should trigger</li>
              <li><strong>Priority:</strong> urgent, high, medium, low (color-coded)</li>
              <li><strong>Reminder Type:</strong> call, email, meeting, payment, follow_up, general</li>
              <li><strong>Link to:</strong> Can be linked to an invoice (by reference) or a ticket (by ID)</li>
              <li><strong>Email Notification:</strong> Toggle to send email when reminder is due</li>
            </ul>
          </InfoCard>

          <SubHeading id="reminders-notifications" title="Notifications & Emails" />
          <InfoCard title="Notification Flow" color="green">
            <ol className="list-decimal pl-4 space-y-1">
              <li><strong>check-invoice-reminders</strong> cron runs every minute and marks due reminders as triggered</li>
              <li><strong>In-app popup</strong> (<code className="bg-gray-100 px-1 rounded text-xs">ReminderPopup</code>) shows floating notifications for today's reminders</li>
              <li><strong>Sidebar widget</strong> (<code className="bg-gray-100 px-1 rounded text-xs">RemindersSidebar</code>) shows counts: today, tomorrow, this week, overdue</li>
              <li><strong>send-reminder-emails</strong> cron runs every 5 minutes and emails reminders with email notification enabled</li>
              <li><strong>Full management</strong> at <code className="bg-gray-100 px-1 rounded text-xs">/reminders</code> (RemindersPortal) with filtering, editing, bulk actions</li>
            </ol>
          </InfoCard>

          <SubHeading id="reminders-database" title="Reminders Database Schema" />
          <TableDef columns={[
            { name: 'user_id', type: 'uuid FK', desc: 'User who owns the reminder' },
            { name: 'invoice_id', type: 'text', desc: 'Linked invoice reference (optional)' },
            { name: 'ticket_id', type: 'uuid FK', desc: 'Linked ticket ID (optional)' },
            { name: 'title', type: 'text', desc: 'Reminder title' },
            { name: 'reminder_date', type: 'timestamptz', desc: 'When to trigger' },
            { name: 'priority', type: 'text', desc: 'urgent, high, medium, low' },
            { name: 'reminder_type', type: 'text', desc: 'call, email, meeting, payment, follow_up, general' },
            { name: 'send_email_notification', type: 'boolean', desc: 'Send email when due' },
            { name: 'email_sent', type: 'boolean', desc: 'Whether email has been sent' },
            { name: 'completed_at', type: 'timestamptz', desc: 'When marked complete (null = active)' },
          ]} />

          {/* ========== CRON JOBS ========== */}
          <SectionHeading id="cron" title="Cron Jobs & Scheduled Tasks" />

          <SubHeading id="cron-list" title="All Cron Jobs" />
          <p className="text-sm text-gray-700 mb-3">The system runs 17 scheduled cron jobs via the pg_cron PostgreSQL extension:</p>

          <div className="space-y-1 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Every Minute</p>
            <CronRow name="email-scheduler-job" schedule="* * * * *" desc="Evaluates active customer email assignments against formulas and sends scheduled emails via SendGrid" />
            <CronRow name="check-invoice-reminders" schedule="* * * * *" desc="Checks for due invoice reminders and triggers notifications" />
            <CronRow name="auto-backfill-payment-data" schedule="* * * * *" desc="Backfills payment application history and attachments for payments missing this data" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Every 5 Minutes</p>
            <CronRow name="acumatica-auto-sync" schedule="*/5 * * * *" desc="Triggers the master Acumatica sync: customers, invoices, and payments sequentially" />
            <CronRow name="send-reminder-emails" schedule="*/5 * * * *" desc="Sends email notifications for reminders that have email notification enabled" />
            <CronRow name="auto-red-status-checker" schedule="*/5 * * * *" desc="Auto-marks invoices RED when past due or untouched 30+ days; clears RED when paid" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Every 10 Minutes</p>
            <CronRow name="auto-close-paid-tickets" schedule="*/10 * * * *" desc="Safety net: auto-closes collection tickets where all linked invoices are paid, closed, or voided. Catches cases missed by the real-time trigger (bulk syncs, direct DB updates, invoices arriving already closed)." />
            <CronRow name="refresh-payment-month-summary" schedule="*/10 * * * *" desc="Refreshes materialized view of monthly payment aggregates for Payment Breakdown page" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Hourly</p>
            <CronRow name="refresh-payment-analytics" schedule="0 * * * *" desc="Refreshes daily, monthly, and yearly cached payment analytics" />
            <CronRow name="refresh-invoice-month-summary" schedule="15 * * * *" desc="Refreshes invoice month summary materialized view" />
            <CronRow name="refresh-invoice-analytics" schedule="30 * * * *" desc="Refreshes cached invoice analytics (monthly + yearly) for Invoice Analytics page" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Daily</p>
            <CronRow name="cleanup-old-sync-logs" schedule="0 2 * * *" desc="Deletes sync_change_logs older than 30 days in 10K row batches (2:00 AM UTC)" />
            <CronRow name="reconcile-balanced-invoices" schedule="0 5 * * *" desc="Daily reconciliation of Balanced invoices with Acumatica (5:00 AM UTC)" />
            <CronRow name="process-auto-ticket-rules" schedule="0 6 * * *" desc="Processes all active auto-ticket rules and creates/updates collection tickets (6:00 AM UTC)" />
            <CronRow name="payment-sync-health-check" schedule="0 6 * * *" desc="Samples 100 recent payments and verifies data integrity with Acumatica (6:00 AM UTC)" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mt-4 mb-2">Twice Daily</p>
            <CronRow name="send-sync-report-morning" schedule="0 12 * * *" desc="Sends morning sync status report to recipients (8:00 AM Eastern)" />
            <CronRow name="send-sync-report-evening" schedule="0 21 * * *" desc="Sends evening sync status report to recipients (5:00 PM Eastern)" />
          </div>

          <SubHeading id="cron-monitoring" title="Cron Monitoring" />
          <p className="text-sm text-gray-700 mb-3">The Cron Monitor page (<code className="bg-gray-100 px-1 rounded text-xs">/schedule</code>) shows the last 50 cron execution logs with job name, timestamp, status (success/failed), response data, and execution time. Auto-refreshes every 30 seconds. Includes manual trigger buttons.</p>

          <SubHeading id="cron-control" title="Cron Job Control" />
          <p className="text-sm text-gray-700 mb-3">The Cron Job Control component allows admins to enable/disable individual cron jobs managed by pg_cron. Displays job name, schedule expression, and active status with toggle switches. Auto-refreshes every 10 seconds. Accessible from the Sync Configuration page.</p>

          {/* ========== API ========== */}
          <SectionHeading id="api" title="GPT Data API" />

          <SubHeading id="api-overview" title="API Overview" />
          <p className="text-sm text-gray-700 mb-3">The GPT Data API (<code className="bg-gray-100 px-1 rounded text-xs">gpt-data-api</code> edge function) provides a RESTful API for external systems (like ChatGPT, custom integrations) to query system data. All endpoints return JSON.</p>

          <SubHeading id="api-auth" title="API Authentication" />
          <InfoCard title="API Key Authentication" color="amber">
            <ul className="list-disc pl-4 space-y-1">
              <li>Requires <code className="bg-gray-100 px-1 rounded text-xs">X-Api-Key</code> header or <code className="bg-gray-100 px-1 rounded text-xs">api_key</code> query parameter</li>
              <li>Keys are stored hashed in <code className="bg-gray-100 px-1 rounded text-xs">api_keys</code> table with key_hash, key_prefix, is_active, expires_at</li>
              <li>Usage tracked: last_used_at, usage_count updated on each request</li>
              <li>Key generation requires Bearer token + admin/developer role via POST /keys/generate</li>
              <li>API key management UI at <code className="bg-gray-100 px-1 rounded text-xs">/api-keys</code></li>
            </ul>
          </InfoCard>

          <SubHeading id="api-endpoints" title="All Endpoints" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-100"><th className="px-3 py-2 text-left font-semibold text-gray-700">Method</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Endpoint</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th></tr></thead>
              <tbody>
                {[
                  ['GET', '/customers', 'List/search customers with pagination'],
                  ['GET', '/customers/:id', 'Full customer detail with invoice stats, assignments, recent tickets'],
                  ['GET', '/invoices', 'List/search invoices with date, status, type, amount filters'],
                  ['GET', '/invoices/:ref', 'Full invoice detail with memos, status history, payment applications'],
                  ['GET', '/payments', 'List/search payments with date, type, amount, method filters'],
                  ['GET', '/payments/:ref', 'Full payment detail with invoice applications'],
                  ['GET', '/tickets', 'List/search collection tickets by status, priority, customer, collector'],
                  ['GET', '/tickets/:number', 'Full ticket detail with invoices, notes, activity log, status history'],
                  ['GET', '/collectors', 'List all active collectors with assignment/ticket counts'],
                  ['GET', '/analytics/overview', 'Dashboard KPIs: customer count, balances, ticket counts, recent payments'],
                  ['GET', '/analytics/aging', 'AR aging buckets (current, 1-30, 31-60, 61-90, 91-120, 121+)'],
                  ['GET', '/analytics/monthly-summary', 'Month-by-month invoice or payment summaries'],
                  ['GET', '/analytics/customer-balances', 'Customers ranked by outstanding balance'],
                  ['GET', '/emails', 'Email sending history with delivery/open tracking'],
                  ['GET', '/search', 'Global search across customers, invoices, payments, tickets'],
                  ['GET', '/endpoints', 'List all endpoints (public, no auth required)'],
                  ['POST', '/keys/generate', 'Generate new API key (requires Bearer token + admin role)'],
                ].map(([method, path, desc], i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-3 py-1.5 font-mono text-xs"><span className={method === 'GET' ? 'text-green-600' : 'text-blue-600'}>{method}</span></td>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-700">{path}</td>
                    <td className="px-3 py-1.5 text-gray-700">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ========== ADMIN ========== */}
          <SectionHeading id="admin" title="Admin & System Pages" />

          <SubHeading id="admin-dashboard" title="Admin Dashboard" />
          <InfoCard title="Admin Dashboard Structure" color="blue">
            <p className="mb-2">The Admin Dashboard is organized into two main sections accessible from a left sidebar:</p>
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Analytics:</strong> My Assignments, Collector Dashboard, Invoice Analytics, Customer Analytics, Payment Analytics, Payment Breakdown, Invoice Breakdown</li>
              <li><strong>Settings (collapsible):</strong> Invoice Color Settings, User Approval, Create New User, User Activity, Synchronization Status, Ticket Status Settings, Ticket Type Settings, Auto-Ticket Rules, Email Settings, Documentation</li>
            </ul>
          </InfoCard>

          <SubHeading id="admin-users" title="User Management" />
          <InfoCard title="User Management Features" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>User Approval Panel</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/user-approval</code>): Review and approve/decline pending registrations</li>
              <li><strong>Admin Create User</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/create-user</code>): Create users with auto-generated 12-character temporary passwords (uppercase, lowercase, number, special character required)</li>
              <li><strong>User Management Sidebar</strong>: View all users, change roles, manage per-user permissions (21 permission groups x 4 actions), view activity logs, impersonate users</li>
              <li><strong>Resend Temporary Password</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/resend-temp-password</code>): Resend welcome emails with new temporary passwords</li>
              <li><strong>Force Delete User</strong> (<code className="bg-gray-100 px-1 rounded text-xs">/force-delete-user</code>): Permanently delete user accounts</li>
            </ul>
          </InfoCard>

          <SubHeading id="admin-sync-config" title="Sync Configuration" />
          <p className="text-sm text-gray-700 mb-3">At <code className="bg-gray-100 px-1 rounded text-xs">/sync-config</code>: Configure Acumatica credentials (URL, username, password, company, branch), per-entity sync settings (enabled, interval, lookback), trigger date range syncs, manage sync report recipients, and control cron jobs.</p>

          <SubHeading id="admin-webhooks" title="Webhook Configuration" />
          <p className="text-sm text-gray-700 mb-3">At <code className="bg-gray-100 px-1 rounded text-xs">/webhooks</code>: View and configure Acumatica webhook endpoints for customers, invoices, and payments. Shows webhook URLs for copying into Acumatica. Displays execution logs with status indicators.</p>

          <SubHeading id="admin-developer" title="Developer Tools" />
          <p className="text-sm text-gray-700 mb-3">The Developer Tools page (<code className="bg-gray-100 px-1 rounded text-xs">/developer-tools</code>) is a navigation hub providing access to 20+ diagnostic and maintenance utilities organized by category: payment diagnostics, invoice diagnostics, sync diagnostics, system tools, and API tools.</p>

          <SubHeading id="admin-global-search" title="Global Search" />
          <p className="text-sm text-gray-700 mb-3">Command palette style search (Cmd+K) that searches across all entity types: invoices, customers, payments, tickets, and collectors. Results are grouped by category with icons and colors. Clicking a result navigates to the appropriate detail page. Recent searches are cached in localStorage.</p>

          {/* ========== ACTIVITY ========== */}
          <SectionHeading id="activity" title="User Activity & Logging" />

          <SubHeading id="activity-logging" title="Activity Logging System" />
          <InfoCard title="What Gets Logged" color="blue">
            <ul className="list-disc pl-4 space-y-1">
              <li><strong>Login/Logout:</strong> Every sign-in and sign-out event with timestamps</li>
              <li><strong>Invoice Status Changes:</strong> Old and new status values captured in details jsonb</li>
              <li><strong>Color Status Changes:</strong> When collectors change invoice color statuses</li>
              <li><strong>Memo Additions:</strong> When memos are added to invoices</li>
              <li><strong>Impersonation:</strong> Start and stop of user impersonation sessions</li>
              <li><strong>Ticket Operations:</strong> Status changes, note additions, assignment changes (via ticket_activity_log)</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500">All activity stored in <code className="bg-gray-100 px-1 rounded text-xs">user_activity_logs</code> with: user_id, action_type, entity_type, entity_id, details (jsonb), created_at</p>
          </InfoCard>

          <SubHeading id="activity-analytics" title="Activity Analytics" />
          <p className="text-sm text-gray-700 mb-3">The User Activity Analytics page (<code className="bg-gray-100 px-1 rounded text-xs">/user-activity</code>) aggregates activity across all users with time range selector (7/30/90 days). Shows: total users, active today, login counts, total actions, most common actions per user, and user ranking by activity level. Drill-down into individual user logs.</p>

          {/* ========== ROUTES ========== */}
          <SectionHeading id="routes" title="All Application Routes" />

          <SubHeading id="routes-core" title="Core Routes" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-100"><th className="px-3 py-2 text-left font-semibold text-gray-700">Path</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Component</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th></tr></thead>
              <tbody>
                <RouteRow path="/signin" component="SignIn" desc="Login / Sign Up / Forgot Password" />
                <RouteRow path="/reset-password" component="ResetPassword" desc="Password reset flow" />
                <RouteRow path="/customers" component="Customers" desc="Customer list with advanced filtering" />
                <RouteRow path="/customer-analytics" component="CustomerAnalyticsPage" desc="Customer portfolio analytics" />
                <RouteRow path="/customer-statements" component="CustomerStatements" desc="Statement distribution" />
                <RouteRow path="/customer-reports" component="CustomerReportsMonthly" desc="Batch statement generation" />
                <RouteRow path="/customer-report-templates" component="CustomerReportTemplates" desc="Statement template management" />
                <RouteRow path="/customer-email-tracking" component="CustomerEmailTracking" desc="Per-customer email history" />
                <RouteRow path="/assignments" component="CustomerAssignments" desc="Email campaign assignments" />
                <RouteRow path="/my-assignments" component="MyAssignments" desc="Collector's assigned tickets" />
                <RouteRow path="/collection-ticketing" component="CollectionTicketing" desc="Create/manage tickets" />
                <RouteRow path="/ticket/:ticketId" component="TicketDetailPage" desc="Individual ticket detail" />
                <RouteRow path="/invoice-analytics" component="InvoiceAnalyticsPage" desc="Calendar-based invoice analytics" />
                <RouteRow path="/invoice-breakdown" component="InvoiceBreakdown" desc="Month-by-month invoice comparison" />
                <RouteRow path="/payment-analytics" component="PaymentAnalytics" desc="Payment detail analytics" />
                <RouteRow path="/payment-breakdown" component="PaymentBreakdown" desc="Month-by-month payment comparison" />
                <RouteRow path="/reminders" component="RemindersPortal" desc="Full reminder management" />
                <RouteRow path="/inbox" component="InboxDashboard" desc="Inbound email inbox" />
                <RouteRow path="/formulas" component="EmailFormulas" desc="Email schedule formulas" />
                <RouteRow path="/templates" component="EmailTemplates" desc="Email templates" />
                <RouteRow path="/email-settings" component="EmailSettings" desc="Email configuration" />
                <RouteRow path="/email-analytics" component="EmailAnalytics" desc="Email sending metrics" />
                <RouteRow path="/collector-performance" component="CollectorHub" desc="Collector performance dashboard" />
                <RouteRow path="/collector-control-panel" component="CollectorControlPanel" desc="Collector management" />
              </tbody>
            </table>
          </div>

          <SubHeading id="routes-admin" title="Admin & System Routes" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-100"><th className="px-3 py-2 text-left font-semibold text-gray-700">Path</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Component</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th></tr></thead>
              <tbody>
                <RouteRow path="/user-approval" component="UserApprovalPanel" desc="Approve/decline user registrations" />
                <RouteRow path="/create-user" component="AdminCreateUser" desc="Create users with temp passwords" />
                <RouteRow path="/resend-temp-password" component="ResendTemporaryPassword" desc="Resend welcome emails" />
                <RouteRow path="/force-delete-user" component="ForceDeleteUser" desc="Permanently delete users" />
                <RouteRow path="/sync-config" component="SyncConfiguration" desc="Acumatica sync settings" />
                <RouteRow path="/sync-status" component="SyncStatusDashboard" desc="Sync status overview" />
                <RouteRow path="/sync-health" component="SyncHealthDashboard" desc="Sync health monitoring" />
                <RouteRow path="/sync-logs" component="SyncChangeLogsViewer" desc="Sync change audit logs" />
                <RouteRow path="/live-sync-monitor" component="LiveSyncMonitor" desc="Real-time sync progress" />
                <RouteRow path="/schedule" component="CronMonitor" desc="Cron job execution logs" />
                <RouteRow path="/logs" component="SchedulerLogs" desc="Scheduler execution logs" />
                <RouteRow path="/webhooks" component="WebhookConfiguration" desc="Webhook endpoint config" />
                <RouteRow path="/ticket-status-settings" component="TicketStatusManagement" desc="Ticket status config" />
                <RouteRow path="/invoice-color-settings" component="InvoiceColorStatusManagement" desc="Color status config" />
                <RouteRow path="/auto-ticket-rules" component="AutoTicketRules" desc="Auto-ticket rule engine" />
                <RouteRow path="/api-keys" component="ApiKeyManagement" desc="GPT data API key management" />
                <RouteRow path="/user-activity" component="UserActivityAnalytics" desc="User activity analytics" />
                <RouteRow path="/revenue-analytics" component="RevenueAnalytics" desc="Revenue analytics" />
                <RouteRow path="/system-documentation" component="SystemDocumentation" desc="This page" />
              </tbody>
            </table>
          </div>

          <SubHeading id="routes-developer" title="Developer & Diagnostic Routes" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead><tr className="bg-gray-100"><th className="px-3 py-2 text-left font-semibold text-gray-700">Path</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Component</th><th className="px-3 py-2 text-left font-semibold text-gray-700">Description</th></tr></thead>
              <tbody>
                <RouteRow path="/developer-tools" component="DeveloperTools" desc="Hub for all diagnostic tools" />
                <RouteRow path="/payment-diagnostic" component="PaymentStructureDiagnostic" desc="Payment data structure analysis" />
                <RouteRow path="/payment-attachment-test" component="PaymentAttachmentTest" desc="Test payment attachment fetch" />
                <RouteRow path="/payment-count" component="PaymentCountComparison" desc="Compare payment counts with Acumatica" />
                <RouteRow path="/payment-app-status" component="PaymentApplicationStatus" desc="Payment application status" />
                <RouteRow path="/payment-app-resync" component="PaymentApplicationResync" desc="Resync payment applications" />
                <RouteRow path="/payment-app-diagnostic" component="PaymentApplicationDiagnostic" desc="Diagnose payment applications" />
                <RouteRow path="/payment-sync-health" component="PaymentSyncHealthCheck" desc="Payment sync health check" />
                <RouteRow path="/payment-sync-diagnostic" component="PaymentSyncDiagnostic" desc="Payment sync diagnostics" />
                <RouteRow path="/payment-date-range-resync" component="PaymentDateRangeResync" desc="Resync payments by date range" />
                <RouteRow path="/orphaned-invoice-fixer" component="OrphanedInvoiceFixer" desc="Fix orphaned invoices" />
                <RouteRow path="/orphaned-application-diagnostic" component="OrphanedApplicationDiagnostic" desc="Diagnose orphaned applications" />
                <RouteRow path="/invoice-format-checker" component="InvoiceFormatChecker" desc="Check invoice data formats" />
                <RouteRow path="/invoice-variation-checker" component="InvoiceVariationChecker" desc="Check invoice variations" />
                <RouteRow path="/invoice-date-comparison" component="InvoiceDateComparison" desc="Compare invoice dates" />
                <RouteRow path="/application-date-diagnostic" component="ApplicationDateDiagnostic" desc="Diagnose application dates" />
                <RouteRow path="/batch-fetcher" component="BatchApplicationFetcher" desc="Batch fetch applications" />
                <RouteRow path="/bulk-fetcher" component="BulkApplicationFetcher" desc="Bulk fetch applications" />
                <RouteRow path="/recent-sync-app-check" component="RecentSyncApplicationCheck" desc="Check recent sync applications" />
                <RouteRow path="/auto-backfill" component="AutoBackfillMonitor" desc="Monitor auto-backfill progress" />
                <RouteRow path="/voided-payment-analysis" component="VoidedPaymentAnalysis" desc="Analyze voided payments" />
                <RouteRow path="/voided-payments-by-date" component="VoidedPaymentsByDate" desc="Search voided payments by date" />
                <RouteRow path="/backfill-doc-dates" component="BackfillDocDates" desc="Backfill document dates" />
                <RouteRow path="/test-payment-sync" component="TestPaymentAppAndAttachmentSync" desc="Test payment sync pipeline" />
              </tbody>
            </table>
          </div>

          {/* ========== EDGE FUNCTIONS ========== */}
          <SectionHeading id="edge-functions" title="Edge Functions Reference" />
          <p className="text-sm text-gray-700 mb-4">All backend logic runs as Supabase Edge Functions (Deno runtime). Below is a categorized reference of all deployed functions.</p>

          <SubHeading id="ef-sync" title="Sync Functions" />
          <div className="space-y-2 mb-4">
            {[
              ['acumatica-master-sync', 'Orchestrates sequential sync of all entities (Customer > Invoice > Payment)'],
              ['acumatica-invoice-incremental-sync', 'Fetches and upserts recently modified invoices from Acumatica'],
              ['acumatica-invoice-bulk-fetch', 'Bulk fetch of all invoices for initial load or recovery'],
              ['acumatica-invoice-date-range-sync', 'Syncs invoices within a specific date range'],
              ['acumatica-payment-incremental-sync', 'Fetches payments with applications, voided payments, and check images'],
              ['acumatica-payment-bulk-fetch', 'Bulk fetch of all payments for initial load or recovery'],
              ['acumatica-payment-date-range-sync', 'Syncs payments within a specific date range'],
              ['acumatica-customer-incremental-sync', 'Fetches and upserts recently modified customers'],
              ['acumatica-customer-bulk-fetch', 'Bulk fetch of all customers for initial load or recovery'],
              ['acumatica-customer-date-range-sync', 'Syncs customers within a specific date range'],
              ['acumatica-invoice-webhook', 'Handles real-time invoice change webhooks from Acumatica'],
              ['acumatica-payment-webhook', 'Handles real-time payment change webhooks from Acumatica'],
              ['acumatica-customer-webhook', 'Handles real-time customer change webhooks from Acumatica'],
              ['reconcile-balanced-invoices', 'Daily reconciliation of Balanced invoices with Acumatica status'],
              ['verify-payment-sync-health', 'Samples recent payments and verifies data integrity'],
              ['payment-invoice-links-sync', 'Syncs payment-to-invoice application links'],
              ['auto-backfill-payment-data', 'Backfills payment applications and attachments for existing payments'],
              ['backfill-payment-applications', 'Targeted backfill of payment application history'],
              ['backfill-payment-doc-dates', 'Backfills document dates for payments missing this field'],
              ['backfill-credit-memo-dates', 'Backfills dates for credit memo payments'],
              ['force-logout-acumatica', 'Force logout from Acumatica API session'],
            ].map(([name, desc], i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                <Zap className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-mono text-xs font-semibold text-gray-800">{name}</span><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
              </div>
            ))}
          </div>

          <SubHeading id="ef-email" title="Email Functions" />
          <div className="space-y-2 mb-4">
            {[
              ['email-receiver', 'Receives inbound customer emails via Mailgun webhook, analyzes intent with GPT-4, stores attachments'],
              ['email-scheduler', 'Processes scheduled email campaigns based on formula schedules and customer assignments'],
              ['send-email-reply', 'General-purpose email sending via SendGrid with department sender support'],
              ['send-customer-invoice-email', 'Sends formatted invoice statements with HTML tables and PDF/Excel attachments'],
              ['send-reminder-emails', 'Sends internal reminder notifications to staff for due reminders'],
              ['send-sync-report', 'Generates and sends comprehensive HTML sync status reports twice daily'],
              ['send-temporary-password', 'Sends welcome emails with temporary passwords to new users'],
              ['sendgrid-webhook', 'Processes SendGrid delivery events (delivered, opened, clicked, bounced, dropped)'],
            ].map(([name, desc], i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                <Mail className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-mono text-xs font-semibold text-gray-800">{name}</span><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
              </div>
            ))}
          </div>

          <SubHeading id="ef-admin" title="Admin & User Functions" />
          <div className="space-y-2 mb-4">
            {[
              ['approve-pending-user', 'Creates auth user and user_profiles for approved pending registrations'],
              ['force-delete-user', 'Permanently deletes a user account from auth and user_profiles'],
              ['request-password-reset', 'Generates a token-based password reset link and sends via email'],
              ['validate-and-reset-password', 'Validates reset token and updates user password'],
              ['test-acumatica-credentials', 'Tests Acumatica API connection with provided credentials'],
              ['gpt-data-api', 'RESTful API for external systems with 17 endpoints across all entities'],
              ['process-auto-ticket-rules', 'Evaluates auto-ticket rules and creates/updates collection tickets'],
            ].map(([name, desc], i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                <Key className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-mono text-xs font-semibold text-gray-800">{name}</span><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
              </div>
            ))}
          </div>

          <SubHeading id="ef-analytics" title="Analytics Functions" />
          <div className="space-y-2 mb-4">
            {[
              ['calculate-payment-analytics', 'Computes and caches payment analytics (daily/monthly/yearly aggregates)'],
              ['calculate-invoice-analytics', 'Computes and caches invoice analytics'],
              ['refresh-invoice-summary', 'Refreshes invoice month summary materialized view'],
              ['check-invoice-reminders', 'Checks for due reminders and triggers notifications'],
            ].map(([name, desc], i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                <BarChart3 className="w-4 h-4 text-teal-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-mono text-xs font-semibold text-gray-800">{name}</span><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
              </div>
            ))}
          </div>

          <SubHeading id="ef-diagnostic" title="Diagnostic Functions" />
          <div className="space-y-2 mb-4">
            {[
              ['diagnose-payment-structure', 'Analyzes payment data structure from Acumatica API'],
              ['diagnose-application-dates', 'Diagnoses issues with payment application dates'],
              ['diagnose-application-history', 'Investigates payment application history discrepancies'],
              ['diagnose-invoice-by-reference', 'Fetches and analyzes a specific invoice by reference number'],
              ['diagnose-invoice-dates', 'Compares invoice dates between local DB and Acumatica'],
              ['diagnose-single-payment', 'Deep diagnosis of a single payment record'],
              ['check-invoice-formats', 'Validates invoice data format consistency'],
              ['check-invoice-variations', 'Identifies invoice field variations across records'],
              ['compare-invoice-dates', 'Compares invoice dates between systems'],
              ['compare-invoice-refs', 'Compares invoice reference numbers between systems'],
              ['compare-invoice-totals', 'Compares invoice totals between systems'],
              ['search-invoice-by-amount', 'Searches Acumatica for invoices by amount'],
              ['list-open-invoices', 'Lists all currently open invoices from Acumatica'],
              ['list-recent-acumatica-invoices', 'Lists recently created/modified invoices from Acumatica'],
              ['fetch-missing-invoices', 'Fetches invoices that exist in Acumatica but not in local DB'],
              ['find-missing-invoices', 'Identifies invoices missing from local database'],
            ].map(([name, desc], i) => (
              <div key={i} className="flex items-start gap-3 p-2 bg-white border border-gray-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                <div><span className="font-mono text-xs font-semibold text-gray-800">{name}</span><p className="text-xs text-gray-600 mt-0.5">{desc}</p></div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-200 mb-8">
            <p className="text-xs text-gray-400 text-center">System Documentation -- Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
