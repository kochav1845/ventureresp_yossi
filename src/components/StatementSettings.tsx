import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, FileSpreadsheet, FileText } from 'lucide-react';
import CustomerReportTemplates from './CustomerReportTemplates';
import ExcelTemplatesPanel from './CustomerStatements/ExcelTemplatesPanel';
import PdfStatementPanel from './CustomerStatements/PdfStatementPanel';

type Tab = 'email' | 'excel' | 'pdf';

const TABS: { id: Tab; name: string; icon: typeof Mail; hint: string }[] = [
  { id: 'email', name: 'Email message', icon: Mail, hint: 'Subject & body of the statement email' },
  { id: 'excel', name: 'Excel sheet', icon: FileSpreadsheet, hint: 'The attached spreadsheet layout' },
  { id: 'pdf', name: 'PDF', icon: FileText, hint: 'The attached PDF statement' },
];

export default function StatementSettings() {
  const navigate = useNavigate();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const initial = (searchParams.get('tab') as Tab) || 'email';
  const [tab, setTab] = useState<Tab>(['email', 'excel', 'pdf'].includes(initial) ? initial : 'email');

  const selectTab = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(searchParams);
    next.set('tab', t);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(`/${orgSlug}/customer-statements`)}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to Statements"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Statement Settings</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure what customers receive — the email message, the Excel sheet, and the PDF.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex flex-wrap gap-1">
          {TABS.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => selectTab(t.id)}
                title={t.hint}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Panel */}
      <div>
        {tab === 'email' && <CustomerReportTemplates />}
        {tab === 'excel' && <ExcelTemplatesPanel />}
        {tab === 'pdf' && <PdfStatementPanel />}
      </div>
    </div>
  );
}
