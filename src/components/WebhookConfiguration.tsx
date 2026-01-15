import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Webhook, Activity, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { formatDateTime as formatDateTimeUtil } from '../lib/dateUtils';

interface WebhookConfigurationProps {
  onBack?: () => void;
}

export default function WebhookConfiguration({ onBack }: WebhookConfigurationProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState<string | null>(null);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const webhooks = [
    {
      name: 'Customer Webhook',
      type: 'customer',
      url: `${supabaseUrl}/functions/v1/acumatica-customer-webhook`,
      description: 'Receives notifications when customers are created or updated in Acumatica',
      color: 'blue'
    },
    {
      name: 'Invoice Webhook',
      type: 'invoice',
      url: `${supabaseUrl}/functions/v1/acumatica-invoice-webhook`,
      description: 'Receives notifications when invoices are created or updated in Acumatica',
      color: 'green'
    },
    {
      name: 'Payment Webhook',
      type: 'payment',
      url: `${supabaseUrl}/functions/v1/acumatica-payment-webhook`,
      description: 'Receives notifications when payments are created or updated in Acumatica',
      color: 'purple'
    }
  ];

  useEffect(() => {
    loadWebhookLogs();
  }, []);

  const loadWebhookLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('webhook_logs')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setWebhookLogs(data || []);
    } catch (error) {
      console.error('Error loading webhook logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processed':
        return 'text-green-500';
      case 'pending_credentials':
        return 'text-yellow-500';
      case 'error':
        return 'text-red-500';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processed':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending_credentials':
        return <Clock className="w-4 h-4" />;
      case 'error':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Main Menu
        </button>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Acumatica Webhook Configuration</h1>
          <p className="text-slate-400">
            Configure webhooks in Acumatica to automatically sync data changes in real-time
          </p>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Complete Setup Guide</h2>
          <p className="text-slate-300 mb-4">
            Acumatica uses <strong className="text-white">Generic Inquiries with Push Notifications</strong> to send real-time data changes to external systems.
            You'll create a Generic Inquiry to track the data you want, then configure a Push Notification to send changes to our webhook URLs.
          </p>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400 mb-2">Step 1</div>
              <div className="text-sm text-slate-300">Create Generic Inquiry</div>
            </div>
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400 mb-2">Step 2</div>
              <div className="text-sm text-slate-300">Create Push Destination</div>
            </div>
            <div className="bg-purple-900/20 border border-purple-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400 mb-2">Step 3</div>
              <div className="text-sm text-slate-300">Link GI to Destination</div>
            </div>
          </div>
        </div>

        <div className="space-y-6 mb-8">
          <h2 className="text-2xl font-bold text-white">Webhook URLs</h2>

          {webhooks.map((webhook) => (
            <div
              key={webhook.type}
              className="bg-slate-800 border border-slate-700 rounded-lg p-6 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Webhook className={`w-6 h-6 text-${webhook.color}-500`} />
                  <div>
                    <h3 className="text-xl font-semibold text-white">{webhook.name}</h3>
                    <p className="text-sm text-slate-400">{webhook.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 font-mono text-sm text-slate-300 overflow-x-auto">
                  {webhook.url}
                </div>
                <button
                  onClick={() => copyToClipboard(webhook.url, webhook.type)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-colors ${
                    copied === webhook.type
                      ? 'bg-green-600 text-white'
                      : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                  }`}
                >
                  {copied === webhook.type ? (
                    <>
                      <Check className="w-5 h-5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-5 h-5" />
                      Copy
                    </>
                  )}
                </button>
              </div>

              <div className="mt-4 bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-white mb-3">STEP 1: Create Generic Inquiry (Screen SM208000)</h4>
                <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700 rounded text-sm">
                  <p className="text-blue-400 mb-2"><strong>Create a Generic Inquiry</strong> to track {webhook.type === 'customer' ? 'Customer' : webhook.type === 'invoice' ? 'Invoice' : 'Payment'} changes:</p>
                  <ol className="space-y-1 text-slate-300 text-xs">
                    <li>1. Go to <strong className="text-white">System → Customization → Generic Inquiry (SM208000)</strong></li>
                    <li>2. Click <strong className="text-white">Add New Record</strong></li>
                    <li>3. Name it something like: <code className="text-white bg-slate-800 px-1">{webhook.name.replace(' Webhook', ' GI')}</code></li>
                    <li>4. Add the {webhook.type === 'customer' ? 'Customer (AR.Customer)' : webhook.type === 'invoice' ? 'Invoice (AR.Invoice)' : 'Payment (AR.Payment)'} table</li>
                    <li>5. Add fields you want to track (e.g., {webhook.type === 'customer' ? 'CustomerID, CustomerName, Status' : webhook.type === 'invoice' ? 'RefNbr, DocDate, Status, DocBal' : 'RefNbr, DocDate, Status, CuryOrigDocAmt'})</li>
                    <li>6. <strong className="text-yellow-400">Important:</strong> Do NOT use aggregation, grouping, or formulas</li>
                    <li>7. Save the Generic Inquiry</li>
                  </ol>
                </div>

                <div className="space-y-3 text-sm bg-green-900/10 border border-green-700 rounded p-3 mb-3">
                  <p className="text-green-400 mb-2"><strong>Configure Push Notification Destination:</strong></p>
                  <ol className="space-y-1 text-slate-300 text-xs">
                    <li>1. Go to <strong className="text-white">System → Integration → Push Notifications (SM302000)</strong></li>
                    <li>2. Click <strong className="text-white">Add New Record</strong> (plus icon)</li>
                    <li>3. Fill in the fields as shown below:</li>
                  </ol>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-3 gap-4 bg-slate-800/50 p-2 rounded">
                    <div className="text-slate-400 font-medium">Field Name</div>
                    <div className="col-span-2 text-slate-400 font-medium">Value to Enter</div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-2 border-t border-slate-700">
                    <div className="text-slate-300">Destination Name</div>
                    <div className="col-span-2">
                      <div className="text-white font-mono text-xs bg-slate-800 px-2 py-1 rounded mb-1">
                        {webhook.name.replace(' Webhook', ' Destination')}
                      </div>
                      <div className="text-xs text-slate-500">Any descriptive name</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-2 border-t border-slate-700">
                    <div className="text-slate-300">Active</div>
                    <div className="col-span-2">
                      <div className="text-white">✓ Check this checkbox</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-2 border-t border-slate-700">
                    <div className="text-slate-300">Destination Type</div>
                    <div className="col-span-2">
                      <div className="text-white mb-1">Webhook</div>
                      <div className="text-xs text-slate-500">
                        Select from dropdown
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 py-2 border-t border-slate-700">
                    <div className="text-slate-300">Address</div>
                    <div className="col-span-2">
                      <div className="text-white font-mono text-xs bg-slate-900 px-2 py-1 rounded break-all mb-1">
                        {webhook.url}
                      </div>
                      <div className="text-xs text-slate-500">
                        Copy and paste this URL
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-slate-800 border border-slate-600 rounded">
                  <div className="text-xs text-slate-400 mb-2">Push Notification Destination Configuration:</div>

                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">Destination URL:</div>
                    <div className="text-white font-mono text-xs break-all bg-slate-900 px-2 py-1 rounded">
                      {webhook.url}
                    </div>
                  </div>

                  <div className="border-t border-slate-700 pt-3">
                    <div className="text-xs text-slate-400 mb-2 font-semibold">Headers to Add:</div>

                    <div className="space-y-2">
                      <div className="bg-slate-900 p-2 rounded">
                        <div className="text-xs text-slate-500">Header Name:</div>
                        <div className="text-white font-mono text-xs">Content-Type</div>
                      </div>
                      <div className="bg-slate-900 p-2 rounded">
                        <div className="text-xs text-slate-500">Header Value:</div>
                        <div className="text-white font-mono text-xs">application/json</div>
                      </div>
                    </div>

                    <div className="mt-3 text-xs text-slate-500">
                      Optional: Add more headers if needed for authentication
                    </div>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-green-900/20 border border-green-700 rounded">
                  <div className="text-green-400 font-medium mb-2">📋 STEP 3: Link Generic Inquiry to Destination</div>
                  <div className="text-slate-300 text-xs space-y-1">
                    <p>1. Stay in the <strong className="text-white">Push Notifications (SM302000)</strong> screen</p>
                    <p>2. Click on the <strong className="text-white">"Generic Inquiries"</strong> tab at the bottom</p>
                    <p>3. Click <strong className="text-white">Add Row</strong></p>
                    <p>4. In "Inquiry Title", select the Generic Inquiry you created in Step 1</p>
                    <p>5. Check the <strong className="text-white">Active</strong> checkbox</p>
                    <p>6. Save</p>
                    <p className="mt-2 text-yellow-400">✓ Done! Acumatica will now send Inserted/Deleted records when data changes</p>
                  </div>
                </div>

                <div className="mt-3 p-3 bg-slate-800/50 border border-slate-600 rounded">
                  <div className="text-slate-400 font-medium mb-2 text-xs">📊 Testing & Monitoring:</div>
                  <div className="text-slate-300 text-xs space-y-1">
                    <p>• View sent notifications: <strong className="text-white">Process Push Notifications (SM502000)</strong></p>
                    <p>• Test by creating/updating a {webhook.type} in Acumatica</p>
                    <p>• Check the webhook logs below to see if data was received</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Recent Webhook Activity</h2>
            <button
              onClick={loadWebhookLogs}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white rounded-lg font-medium transition-colors"
            >
              <Activity className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-400">Loading webhook logs...</p>
            </div>
          ) : webhookLogs.length === 0 ? (
            <div className="text-center py-12">
              <Webhook className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 text-lg mb-2">No webhook activity yet</p>
              <p className="text-slate-500 text-sm">
                Once you configure webhooks in Acumatica, activity will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhookLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={getStatusColor(log.status)}>
                        {getStatusIcon(log.status)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="px-2 py-1 bg-blue-600/20 text-blue-400 text-xs font-medium rounded">
                            {log.webhook_type}
                          </span>
                          <span className="text-white font-medium">{log.entity_id}</span>
                        </div>
                        <p className={`text-sm ${getStatusColor(log.status)}`}>
                          {log.status === 'processed' && 'Successfully processed'}
                          {log.status === 'pending_credentials' && 'Awaiting Acumatica credentials'}
                          {log.status === 'error' && (log.error_message || 'Processing failed')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right text-sm text-slate-400">
                      {formatDateTimeUtil(log.received_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
