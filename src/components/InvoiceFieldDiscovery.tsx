import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Database, AlertCircle, CheckCircle, Copy } from 'lucide-react';

interface InvoiceFieldDiscoveryProps {
  onBack?: () => void;
}

export default function InvoiceFieldDiscovery({ onBack }: InvoiceFieldDiscoveryProps) {
  // SECURITY: Credentials are stored in edge functions, NOT in frontend code

  const [entityType, setEntityType] = useState<'invoice' | 'payment'>('invoice');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sampleData, setSampleData] = useState<any>(null);
  const [discoveredFields, setDiscoveredFields] = useState<any[]>([]);

  const handleDiscoverFields = async () => {
    setLoading(true);
    setError('');
    setSampleData(null);
    setDiscoveredFields([]);

    try {
      const endpoint = entityType === 'invoice'
        ? 'acumatica-invoice-discover'
        : 'acumatica-payment-discover';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({}),
        }
      );

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || `Failed to fetch ${entityType}`);
      }

      const data = entityType === 'invoice' ? result.invoice : result.payment;
      setSampleData(data);

      const fields: any[] = [];
      Object.keys(data).forEach(key => {
        if ((key === 'Details' || key === 'ApplicationHistory') && Array.isArray(data[key])) {
          fields.push({
            acumaticaName: key,
            snakeCaseName: key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, ''),
            dataType: 'jsonb',
            sampleValue: `[Array with ${data[key].length} items]`,
            isArray: true,
          });
          return;
        }

        if (data[key] && typeof data[key] === 'object' && 'value' in data[key]) {
          const value = data[key].value;
          const snakeCaseName = key.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');

          let dataType = 'text';
          if (typeof value === 'boolean') {
            dataType = 'boolean';
          } else if (typeof value === 'number') {
            dataType = 'numeric';
          } else if (typeof value === 'string') {
            if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
              dataType = 'timestamptz';
            } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              dataType = 'date';
            } else if (/^-?\d+\.\d+$/.test(value) || /^-?\d+$/.test(value)) {
              dataType = 'numeric';
            }
          }

          fields.push({
            acumaticaName: key,
            snakeCaseName,
            dataType,
            sampleValue: value === null || value === undefined ? 'null' : String(value),
            isArray: false,
          });
        }
      });

      setDiscoveredFields(fields.sort((a, b) => a.acumaticaName.localeCompare(b.acumaticaName)));

    } catch (err: any) {
      setError(err.message || `An error occurred while discovering ${entityType} fields`);
    } finally {
      setLoading(false);
    }
  };

  const copyFieldsAsSQL = () => {
    const sqlColumns = discoveredFields.map(field => {
      return `  ${field.snakeCaseName} ${field.dataType}${field.dataType === 'boolean' ? ' DEFAULT false' : ''}`;
    }).join(',\n');

    const tableName = entityType === 'invoice' ? 'acumatica_invoices' : 'acumatica_payments';
    const sql = `CREATE TABLE ${tableName} (\n  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),\n${sqlColumns},\n  raw_data jsonb,\n  synced_at timestamptz DEFAULT now(),\n  created_at timestamptz DEFAULT now()\n);`;

    navigator.clipboard.writeText(sql);
  };

  const copyFieldMappingAsJSON = () => {
    const mapping: any = {};
    discoveredFields.forEach(field => {
      mapping[field.acumaticaName] = field.snakeCaseName;
    });
    navigator.clipboard.writeText(JSON.stringify(mapping, null, 2));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Acumatica Field Discovery</h1>
          <p className="text-slate-400">
            Fetch a sample {entityType} to discover all available fields and data types
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Connection Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Entity Type
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setEntityType('invoice')}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      entityType === 'invoice'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Invoice
                  </button>
                  <button
                    onClick={() => setEntityType('payment')}
                    className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors ${
                      entityType === 'payment'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Payment
                  </button>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Acumatica URL:</span>
                    <span className="text-slate-300 font-mono">{acumaticaUrl}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Username:</span>
                    <span className="text-slate-300 font-mono">{username || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Password:</span>
                    <span className="text-slate-300">{'•'.repeat(8)}</span>
                  </div>
                  {company && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Company:</span>
                      <span className="text-slate-300 font-mono">{company}</span>
                    </div>
                  )}
                  {branch && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Branch:</span>
                      <span className="text-slate-300 font-mono">{branch}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Using credentials from environment variables
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {discoveredFields.length > 0 && (
                <div className="flex items-start gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-green-400 text-sm">
                    Discovered {discoveredFields.length} fields from sample invoice
                  </p>
                </div>
              )}

              <button
                onClick={handleDiscoverFields}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Discovering Fields...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Discover {entityType === 'invoice' ? 'Invoice' : 'Payment'} Fields
                  </>
                )}
              </button>
            </div>
          </div>

          {discoveredFields.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white">Discovered Fields ({discoveredFields.length})</h2>
                <div className="flex gap-2">
                  <button
                    onClick={copyFieldMappingAsJSON}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                    title="Copy field mapping as JSON"
                  >
                    <Copy className="w-4 h-4" />
                    Mapping
                  </button>
                  <button
                    onClick={copyFieldsAsSQL}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
                    title="Copy as SQL CREATE TABLE"
                  >
                    <Database className="w-4 h-4" />
                    SQL
                  </button>
                </div>
              </div>

              <div className="max-h-[600px] overflow-y-auto space-y-2">
                {discoveredFields.map((field, index) => (
                  <div
                    key={index}
                    className="bg-slate-900 border border-slate-700 rounded-lg p-3 hover:border-blue-500 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="font-mono text-sm text-blue-400">
                          {field.acumaticaName}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          DB: {field.snakeCaseName}
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs font-mono text-slate-300">
                        {field.dataType}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono truncate">
                      Sample: {field.sampleValue}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {sampleData && (
          <div className="mt-6 bg-slate-800 border border-slate-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Raw Sample Data (JSON)</h2>
            <pre className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto max-h-96 overflow-y-auto">
              {JSON.stringify(sampleData, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
