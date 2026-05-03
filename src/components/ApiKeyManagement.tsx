import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Plus, Copy, Check, Trash2, RefreshCw, Eye, EyeOff, Shield, Clock, Activity, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  usage_count: number;
  expires_at: string | null;
  created_at: string;
}

export default function ApiKeyManagement() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyExpiry, setNewKeyExpiry] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showOpenApiSchema, setShowOpenApiSchema] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const baseApiUrl = `${supabaseUrl}/functions/v1/gpt-data-api`;

  useEffect(() => {
    loadKeys();
  }, []);

  const loadKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, key_prefix, is_active, last_used_at, usage_count, expires_at, created_at')
      .order('created_at', { ascending: false });

    if (!error) setKeys(data || []);
    setLoading(false);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${baseApiUrl}/keys/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          name: newKeyName.trim(),
          expires_at: newKeyExpiry || null,
        }),
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error);

      setNewlyCreatedKey(result.api_key);
      setNewKeyName('');
      setNewKeyExpiry('');
      setShowCreateForm(false);
      loadKeys();
    } catch (err: any) {
      alert('Failed to create key: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const toggleKey = async (id: string, currentlyActive: boolean) => {
    setTogglingId(id);
    await supabase
      .from('api_keys')
      .update({ is_active: !currentlyActive, updated_at: new Date().toISOString() })
      .eq('id', id);
    await loadKeys();
    setTogglingId(null);
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const openApiSchema = generateOpenApiSchema(baseApiUrl);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Key Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Manage API keys for GPT and external integrations
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
        >
          <Plus size={16} />
          Create API Key
        </button>
      </div>

      {/* Newly Created Key Warning */}
      {newlyCreatedKey && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle size={24} className="text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-lg font-bold text-amber-900 mb-1">
                Save Your API Key Now
              </h3>
              <p className="text-sm text-amber-700 mb-3">
                This is the only time you will see this key. Copy it now and store it securely.
              </p>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-amber-200 p-3">
                <code className="flex-1 text-sm font-mono text-gray-900 break-all select-all">
                  {newlyCreatedKey}
                </code>
                <button
                  onClick={() => copyToClipboard(newlyCreatedKey, 'newkey')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors shrink-0 ${
                    copied === 'newkey'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copied === 'newkey' ? <Check size={14} /> : <Copy size={14} />}
                  {copied === 'newkey' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <button
                onClick={() => setNewlyCreatedKey(null)}
                className="mt-3 text-sm text-amber-700 hover:text-amber-900 font-medium"
              >
                I have saved the key, dismiss this
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New API Key</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Key Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., My GPT Bot, Collections Dashboard..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiration (optional)
              </label>
              <input
                type="date"
                value={newKeyExpiry}
                onChange={(e) => setNewKeyExpiry(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <p className="text-xs text-gray-400 mt-1">Leave blank for no expiration</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={createKey}
                disabled={creating || !newKeyName.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Key size={14} />
                )}
                {creating ? 'Creating...' : 'Generate Key'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  setNewKeyName('');
                  setNewKeyExpiry('');
                }}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Your API Keys ({keys.length})
          </h3>
          <button
            onClick={loadKeys}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={`text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw size={24} className="animate-spin text-blue-500" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-12">
            <Key size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No API keys yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {keys.map((key) => (
              <div
                key={key.id}
                className={`px-5 py-4 flex items-center gap-4 ${
                  !key.is_active ? 'opacity-60 bg-gray-50' : ''
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    key.is_active ? 'bg-emerald-50' : 'bg-gray-100'
                  }`}
                >
                  <Key
                    size={18}
                    className={key.is_active ? 'text-emerald-600' : 'text-gray-400'}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{key.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        key.is_active
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {key.is_active ? 'Active' : 'Disabled'}
                    </span>
                    {key.expires_at && new Date(key.expires_at) < new Date() && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        Expired
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <code className="text-xs text-gray-400 font-mono">{key.key_prefix}</code>
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Activity size={10} />
                      {key.usage_count.toLocaleString()} requests
                    </span>
                    {key.last_used_at && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={10} />
                        Last used {new Date(key.last_used_at).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Created {new Date(key.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => toggleKey(key.id, key.is_active)}
                  disabled={togglingId === key.id}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                    key.is_active
                      ? 'text-red-700 bg-red-50 border border-red-200 hover:bg-red-100'
                      : 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  {togglingId === key.id ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : key.is_active ? (
                    'Disable'
                  ) : (
                    'Enable'
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GPT Setup Instructions */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">GPT Setup Instructions</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            How to connect your custom GPT to this API
          </p>
        </div>
        <div className="p-5 space-y-5">
          {/* Step 1: Base URL */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">1. Base API URL</h4>
            <div className="flex items-center gap-2 bg-gray-50 rounded-lg p-3 border border-gray-200">
              <code className="flex-1 text-sm font-mono text-gray-800 break-all">
                {baseApiUrl}
              </code>
              <button
                onClick={() => copyToClipboard(baseApiUrl, 'url')}
                className="p-1.5 rounded hover:bg-gray-200 transition-colors shrink-0"
              >
                {copied === 'url' ? (
                  <Check size={14} className="text-emerald-600" />
                ) : (
                  <Copy size={14} className="text-gray-500" />
                )}
              </button>
            </div>
          </div>

          {/* Step 2: Auth */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">2. Authentication</h4>
            <p className="text-sm text-gray-600 mb-2">
              In your GPT Actions config, set the authentication type to{' '}
              <strong>API Key</strong> with:
            </p>
            <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
              <li>
                Auth Type:{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">API Key</code>
              </li>
              <li>
                Header Name:{' '}
                <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">X-Api-Key</code>
              </li>
              <li>Value: Your API key from above</li>
            </ul>
          </div>

          {/* Step 3: Endpoints */}
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">3. Available Endpoints</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Method</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">Path</th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-600">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {endpointList.map(([method, path, desc]) => (
                    <tr key={path} className="hover:bg-gray-50">
                      <td className="py-2 px-3">
                        <code className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-semibold">
                          {method}
                        </code>
                      </td>
                      <td className="py-2 px-3">
                        <code className="text-xs text-gray-800 font-mono">{path}</code>
                      </td>
                      <td className="py-2 px-3 text-gray-600">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Step 4: OpenAPI Schema */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-800">
                4. OpenAPI Schema (paste into GPT Actions)
              </h4>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(openApiSchema, 'schema')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 transition-colors"
                >
                  {copied === 'schema' ? <Check size={12} /> : <Copy size={12} />}
                  {copied === 'schema' ? 'Copied' : 'Copy Schema'}
                </button>
                <button
                  onClick={() => setShowOpenApiSchema(!showOpenApiSchema)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 transition-colors"
                >
                  {showOpenApiSchema ? <EyeOff size={12} /> : <Eye size={12} />}
                  {showOpenApiSchema ? 'Hide' : 'Show'} Schema
                </button>
              </div>
            </div>
            {showOpenApiSchema && (
              <pre className="bg-gray-900 text-green-400 rounded-lg p-4 overflow-auto max-h-96 text-xs font-mono whitespace-pre">
                {openApiSchema}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const endpointList: [string, string, string][] = [
  ['GET', '/customers', 'Search/list customers with balance, status, class filtering'],
  ['GET', '/customers/{id}', 'Customer detail with invoice stats, assignments, tickets'],
  ['GET', '/invoices', 'Search invoices by date, status, type, amount, customer, color'],
  ['GET', '/invoices/{ref}', 'Invoice detail with memos, status history, payments'],
  ['GET', '/payments', 'Search payments by date, type, amount, customer'],
  ['GET', '/payments/{ref}', 'Payment detail with invoice applications'],
  ['GET', '/tickets', 'Search collection tickets by status, priority, collector'],
  ['GET', '/tickets/{number}', 'Ticket detail with invoices, notes, activity'],
  ['GET', '/collectors', 'List collectors with assignments and open ticket counts'],
  ['GET', '/analytics/overview', 'Dashboard metrics: balances, tickets, payments this month'],
  ['GET', '/analytics/aging', 'AR aging report with 6 buckets and top 25 customers'],
  ['GET', '/analytics/monthly-summary', 'Month-by-month invoice or payment summaries'],
  ['GET', '/analytics/customer-balances', 'Customers ranked by outstanding balance'],
  ['GET', '/emails', 'Email history with delivery/open tracking'],
  ['GET', '/search', 'Global search across customers, invoices, payments'],
];

function generateOpenApiSchema(baseUrl: string): string {
  const schema = {
    openapi: '3.1.0',
    info: {
      title: 'Collections Management API',
      description:
        'API for querying accounts receivable data including customers, invoices, payments, collection tickets, and analytics.',
      version: '1.0.0',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/customers': {
        get: {
          operationId: 'listCustomers',
          summary: 'Search and list customers',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by name, ID, or email' },
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Filter by customer status' },
            { name: 'customer_class', in: 'query', schema: { type: 'string' } },
            { name: 'country', in: 'query', schema: { type: 'string' } },
            { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'customer_name' } },
            { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Customer list with pagination' } },
        },
      },
      '/customers/{customer_id}': {
        get: {
          operationId: 'getCustomerDetail',
          summary: 'Get full customer details with invoice stats, assignments, tickets, and emails',
          parameters: [{ name: 'customer_id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Customer detail' } },
        },
      },
      '/invoices': {
        get: {
          operationId: 'listInvoices',
          summary: 'Search and list invoices',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' }, description: 'Search by reference, customer, or description' },
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'Open, Closed, etc.' },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Invoice, Credit Memo, Debit Memo' },
            { name: 'customer_id', in: 'query', schema: { type: 'string' } },
            { name: 'color_status', in: 'query', schema: { type: 'string' }, description: 'green, yellow, orange, red' },
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'due_date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'due_date_to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'min_amount', in: 'query', schema: { type: 'number' } },
            { name: 'max_amount', in: 'query', schema: { type: 'number' } },
            { name: 'min_balance', in: 'query', schema: { type: 'number' } },
            { name: 'max_balance', in: 'query', schema: { type: 'number' } },
            { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'date' } },
            { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Invoice list with pagination' } },
        },
      },
      '/invoices/{reference_number}': {
        get: {
          operationId: 'getInvoiceDetail',
          summary: 'Get invoice details with memos, status history, and payment applications',
          parameters: [{ name: 'reference_number', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Invoice detail' } },
        },
      },
      '/payments': {
        get: {
          operationId: 'listPayments',
          summary: 'Search and list payments',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'type', in: 'query', schema: { type: 'string' }, description: 'Payment, Prepayment, Credit Memo, Voided Payment' },
            { name: 'customer_id', in: 'query', schema: { type: 'string' } },
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'min_amount', in: 'query', schema: { type: 'number' } },
            { name: 'max_amount', in: 'query', schema: { type: 'number' } },
            { name: 'payment_method', in: 'query', schema: { type: 'string' } },
            { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'application_date' } },
            { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Payment list with pagination' } },
        },
      },
      '/payments/{reference_number}': {
        get: {
          operationId: 'getPaymentDetail',
          summary: 'Get payment details with invoice applications',
          parameters: [{ name: 'reference_number', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Payment detail' } },
        },
      },
      '/tickets': {
        get: {
          operationId: 'listTickets',
          summary: 'Search and list collection tickets',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' }, description: 'open, in_progress, resolved, closed' },
            { name: 'priority', in: 'query', schema: { type: 'string' }, description: 'low, medium, high, urgent' },
            { name: 'customer_id', in: 'query', schema: { type: 'string' } },
            { name: 'collector_id', in: 'query', schema: { type: 'string' } },
            { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'created_at' } },
            { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Ticket list with pagination' } },
        },
      },
      '/tickets/{ticket_number}': {
        get: {
          operationId: 'getTicketDetail',
          summary: 'Get ticket details with invoices, notes, and activity',
          parameters: [{ name: 'ticket_number', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Ticket detail' } },
        },
      },
      '/collectors': {
        get: {
          operationId: 'listCollectors',
          summary: 'List active collectors with assignments and ticket counts',
          responses: { '200': { description: 'Collector list' } },
        },
      },
      '/analytics/overview': {
        get: {
          operationId: 'getAnalyticsOverview',
          summary: 'High-level dashboard metrics',
          responses: { '200': { description: 'Overview metrics' } },
        },
      },
      '/analytics/aging': {
        get: {
          operationId: 'getAgingReport',
          summary: 'Accounts receivable aging report',
          responses: { '200': { description: 'AR aging with 6 buckets and top 25 customers' } },
        },
      },
      '/analytics/monthly-summary': {
        get: {
          operationId: 'getMonthlySummary',
          summary: 'Month-by-month summary',
          parameters: [
            { name: 'entity', in: 'query', schema: { type: 'string', enum: ['invoices', 'payments'], default: 'invoices' } },
          ],
          responses: { '200': { description: 'Monthly summary' } },
        },
      },
      '/analytics/customer-balances': {
        get: {
          operationId: 'getCustomerBalances',
          summary: 'Customers ranked by outstanding balance',
          parameters: [
            { name: 'sort_by', in: 'query', schema: { type: 'string', default: 'balance' } },
            { name: 'sort_order', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'] } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Customer balances' } },
        },
      },
      '/emails': {
        get: {
          operationId: 'listEmails',
          summary: 'Email sending history with tracking',
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'customer_id', in: 'query', schema: { type: 'string' } },
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'date_from', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'date_to', in: 'query', schema: { type: 'string', format: 'date' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: { '200': { description: 'Email logs' } },
        },
      },
      '/search': {
        get: {
          operationId: 'globalSearch',
          summary: 'Search across customers, invoices, and payments',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2 }, description: 'Search query (min 2 chars)' },
          ],
          responses: { '200': { description: 'Search results' } },
        },
      },
    },
  };

  return JSON.stringify(schema, null, 2);
}
