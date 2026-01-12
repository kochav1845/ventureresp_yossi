import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  onBack?: () => void;
}

interface FetchResult {
  status: string;
  success: boolean;
  message: string;
  invoice?: any;
  error?: string;
}

export default function AcumaticaInvoiceTest({ onBack }: Props) {
  const navigate = useNavigate();
  const [acumaticaUrl, setAcumaticaUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [branch, setBranch] = useState('');
  const [loading, setLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState(false);
  const [results, setResults] = useState<FetchResult[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [fetchingCustomer, setFetchingCustomer] = useState(false);
  const [fetchingCustomerFull, setFetchingCustomerFull] = useState(false);
  const [customerFullData, setCustomerFullData] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [fetchingBulk, setFetchingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [autoFetch, setAutoFetch] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(1);

  useEffect(() => {
    // Test component - credentials must be manually entered
    // DO NOT pre-fill from environment variables for security
  }, []);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/customers');
    }
  };

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionSuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-invoice-sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company,
            branch,
            action: 'test-connection',
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setConnectionSuccess(true);
        alert('Connection successful!');
      } else {
        alert(`Connection failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Connection test error:', error);
      alert(`Error: ${error}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const fetchCustomerName = async () => {
    if (!customerId.trim()) {
      alert('Please enter a customer ID');
      return;
    }

    setFetchingCustomer(true);
    setCustomerName('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-invoice-sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company,
            branch,
            action: 'fetch-customer',
            customerId: customerId.trim(),
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setCustomerName(result.customerName);
      } else {
        alert(`Customer not found: ${result.error || 'Unknown error'}`);
        setCustomerName('');
      }
    } catch (error) {
      console.error('Customer fetch error:', error);
      alert(`Error: ${error}`);
      setCustomerName('');
    } finally {
      setFetchingCustomer(false);
    }
  };

  const fetchCustomerFull = async () => {
    setFetchingCustomerFull(true);
    setCustomerFullData(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-invoice-sync`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company,
            branch,
            action: 'fetch-customer-full',
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setCustomerFullData({
          transformed: result.customer,
          raw: result.rawCustomer
        });

        const { data: customers } = await supabase
          .from('acumatica_customers')
          .select('*')
          .order('synced_at', { ascending: false })
          .limit(10);

        if (customers) {
          setCustomers(customers);
        }
      } else {
        alert(`Customer fetch failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Customer fetch error:', error);
      alert(`Error: ${error}`);
    } finally {
      setFetchingCustomerFull(false);
    }
  };

  const fetchBulkCustomers = async (batchNumber: number = 1, isAutoFetch: boolean = false) => {
    setFetchingBulk(true);
    setCurrentBatch(batchNumber);
    const skip = (batchNumber - 1) * 100;
    setBulkProgress({ current: skip, total: 2571 });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        setAutoFetch(false);
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-customer-bulk-fetch`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company,
            branch,
            count: 100,
            skip,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        const totalSaved = skip + result.savedCount;
        setBulkProgress({ current: totalSaved, total: 2571 });

        const startRange = skip + 1;
        const endRange = skip + result.totalFetched;

        console.log(`Batch ${batchNumber} complete! Fetched customers ${startRange}-${endRange}, Saved: ${result.savedCount}`);

        const { data: customers } = await supabase
          .from('acumatica_customers')
          .select('*')
          .order('synced_at', { ascending: false })
          .limit(10);

        if (customers) {
          setCustomers(customers);
        }

        if (isAutoFetch && batchNumber < 26) {
          setTimeout(() => {
            fetchBulkCustomers(batchNumber + 1, true);
          }, 1000);
        } else {
          setFetchingBulk(false);
          if (batchNumber === 26) {
            alert(`All batches complete! Successfully fetched all 2571 customers.`);
            setAutoFetch(false);
          } else if (!isAutoFetch) {
            alert(`Batch ${batchNumber} complete!\nFetched customers ${startRange}-${endRange}\nSaved: ${result.savedCount}\nTotal saved: ${totalSaved}/2571`);
          }
        }
      } else {
        setFetchingBulk(false);
        setAutoFetch(false);
        alert(`Bulk fetch failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Bulk fetch error:', error);
      setFetchingBulk(false);
      setAutoFetch(false);
      alert(`Error: ${error}`);
    }
  };

  const startAutoFetch = () => {
    setAutoFetch(true);
    fetchBulkCustomers(1, true);
  };

  const stopAutoFetch = () => {
    setAutoFetch(false);
  };

  const fetchInvoices = async () => {
    setLoading(true);
    setResults([]);
    setInvoices([]);

    const statusesToTest = ['Open', 'Canceled', 'Closed', 'Balanced'];
    const fetchResults: FetchResult[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      for (const status of statusesToTest) {
        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-invoice-sync`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                acumaticaUrl,
                username,
                password,
                company,
                branch,
                action: 'fetch-one',
                status,
              }),
            }
          );

          const result = await response.json();

          if (result.success) {
            fetchResults.push({
              status,
              success: true,
              message: result.message,
              invoice: result.invoice,
            });
          } else {
            fetchResults.push({
              status,
              success: false,
              message: result.message || 'No invoice found',
            });
          }
        } catch (error) {
          fetchResults.push({
            status,
            success: false,
            message: `Error: ${error}`,
          });
        }
      }

      setResults(fetchResults);

      // Fetch all invoices from database
      const { data: dbInvoices, error } = await supabase
        .from('acumatica_invoices')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching invoices from DB:', error);
      } else {
        setInvoices(dbInvoices || []);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      alert(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Dashboard
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-8">
          <div className="flex items-center gap-3 mb-8">
            <Database className="w-8 h-8 text-blue-400" />
            <h1 className="text-3xl font-bold text-white">Acumatica Invoice Test</h1>
          </div>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Acumatica URL
              </label>
              <input
                type="text"
                value={acumaticaUrl}
                onChange={(e) => setAcumaticaUrl(e.target.value)}
                placeholder="https://your-instance.acumatica.com"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Company (optional)
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="Company"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Branch (optional)
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Branch"
                className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="border-t border-slate-700 my-8"></div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Customer Lookup</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Customer ID
                </label>
                <input
                  type="text"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && fetchCustomerName()}
                  placeholder="e.g., CUST001"
                  className="w-full px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Customer Name (Auto-filled)
                </label>
                <input
                  type="text"
                  value={customerName}
                  readOnly
                  placeholder="Enter Customer ID and click Fetch"
                  className="w-full px-4 py-2 bg-slate-600 border border-slate-600 rounded-lg text-slate-300 placeholder-slate-500 cursor-not-allowed"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={fetchCustomerName}
                  disabled={fetchingCustomer || !customerId.trim() || !acumaticaUrl || !username || !password}
                  className="w-full px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {fetchingCustomer ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Database className="w-5 h-5" />
                      Fetch Customer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-700 my-8"></div>

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-white mb-4">Fetch Customers from Acumatica</h3>
            <p className="text-sm text-slate-400 mb-4">
              Fetch customers in batches of 100. Use auto-fetch to automatically fetch all batches sequentially.
            </p>

            <div className="mb-4 flex gap-4">
              <button
                onClick={fetchCustomerFull}
                disabled={fetchingCustomerFull || fetchingBulk || !acumaticaUrl || !username || !password}
                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                {fetchingCustomerFull ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    Fetch First Customer (Test)
                  </>
                )}
              </button>

              {!autoFetch ? (
                <button
                  onClick={startAutoFetch}
                  disabled={fetchingBulk || fetchingCustomerFull || !acumaticaUrl || !username || !password}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Database className="w-5 h-5" />
                  Auto-Fetch All 26 Batches
                </button>
              ) : (
                <button
                  onClick={stopAutoFetch}
                  className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  <Loader className="w-5 h-5 animate-spin" />
                  Stop Auto-Fetch
                </button>
              )}
            </div>

            <div className="border-t border-slate-700 my-4 pt-4">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Batch Fetching (2571 customers total)</h4>
              <p className="text-xs text-slate-400 mb-4">
                Click any batch to fetch 100 customers at a time. There are 26 batches to cover all customers.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2 max-h-[500px] overflow-y-auto p-2">
                {Array.from({ length: 26 }, (_, i) => {
                  const batchNum = i + 1;
                  const start = i * 100 + 1;
                  const end = Math.min((i + 1) * 100, 2571);

                  let colorClass = 'bg-blue-600 hover:bg-blue-700';
                  if (batchNum > 20) {
                    colorClass = 'bg-red-600 hover:bg-red-700';
                  } else if (batchNum > 15) {
                    colorClass = 'bg-orange-600 hover:bg-orange-700';
                  } else if (batchNum > 10) {
                    colorClass = 'bg-yellow-600 hover:bg-yellow-700';
                  } else if (batchNum > 5) {
                    colorClass = 'bg-green-600 hover:bg-green-700';
                  }

                  return (
                    <button
                      key={batchNum}
                      onClick={() => fetchBulkCustomers(batchNum)}
                      disabled={fetchingBulk || fetchingCustomerFull || !acumaticaUrl || !username || !password}
                      className={`px-3 py-2 ${colorClass} disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex flex-col items-center gap-1 text-xs`}
                    >
                      <span className="font-bold">Batch {batchNum}</span>
                      <span className="text-[10px] opacity-90">{start}-{end}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 p-3 bg-slate-800 rounded-lg border border-slate-700">
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-600 rounded"></div>
                    <span className="text-slate-400">Batches 1-5</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-600 rounded"></div>
                    <span className="text-slate-400">Batches 6-10</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-yellow-600 rounded"></div>
                    <span className="text-slate-400">Batches 11-15</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-orange-600 rounded"></div>
                    <span className="text-slate-400">Batches 16-20</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-600 rounded"></div>
                    <span className="text-slate-400">Batches 21-26</span>
                  </div>
                </div>
              </div>

              {fetchingBulk && (
                <div className="mt-4 p-4 bg-slate-800 rounded-lg border border-blue-500">
                  <div className="flex items-center gap-3 mb-3">
                    <Loader className="w-5 h-5 animate-spin text-blue-500" />
                    <span className="text-white font-medium">
                      {autoFetch ? `Auto-Fetching Batch ${currentBatch} of 26...` : `Fetching Batch ${currentBatch}...`}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm text-slate-300">
                      Progress: {bulkProgress.current} / {bulkProgress.total} customers
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-slate-400">
                      {Math.round((bulkProgress.current / bulkProgress.total) * 100)}% complete
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-700 my-8"></div>

          <div className="flex gap-4 mb-8">
            <button
              onClick={testConnection}
              disabled={testingConnection || !acumaticaUrl || !username || !password}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {testingConnection ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  {connectionSuccess ? <CheckCircle className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                  Test Connection
                </>
              )}
            </button>

            <button
              onClick={fetchInvoices}
              disabled={loading || !acumaticaUrl || !username || !password}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Fetching...
                </>
              ) : (
                <>
                  <Database className="w-5 h-5" />
                  Fetch Test Invoices
                </>
              )}
            </button>
          </div>

          {results.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-bold text-white mb-4">Fetch Results</h2>
              <div className="grid grid-cols-2 gap-4">
                {results.map((result) => (
                  <div
                    key={result.status}
                    className={`p-4 rounded-lg border ${
                      result.success
                        ? 'bg-green-900/20 border-green-700'
                        : 'bg-red-900/20 border-red-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {result.success ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-400" />
                      )}
                      <span className="font-semibold text-white">{result.status}</span>
                    </div>
                    <p className="text-sm text-slate-300">{result.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {invoices.length > 0 && (
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Invoices in Database ({invoices.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Reference #</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Type</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Customer</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Customer Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Total</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Currency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-sm text-white font-mono">{invoice.reference_number}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{invoice.type || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            invoice.status === 'Open' ? 'bg-green-900/30 text-green-400' :
                            invoice.status === 'Closed' ? 'bg-slate-600/30 text-slate-400' :
                            invoice.status === 'Canceled' ? 'bg-red-900/30 text-red-400' :
                            invoice.status === 'Balanced' ? 'bg-blue-900/30 text-blue-400' :
                            'bg-slate-700/30 text-slate-400'
                          }`}>
                            {invoice.status || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{invoice.customer || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{invoice.customer_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{invoice.date || '-'}</td>
                        <td className="px-4 py-3 text-sm text-white font-mono">
                          {invoice.amount ? `${invoice.amount}` : (invoice.line_total ? `${invoice.line_total}` : '-')}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{invoice.currency || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {customerFullData && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-white mb-4">Customer Fetch Preview</h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Raw Acumatica Response</h3>
                  <div className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-auto">
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap">
                      {JSON.stringify(customerFullData.raw, null, 2)}
                    </pre>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Transformed Data (Saved to DB)</h3>
                  <div className="bg-slate-900 rounded-lg p-4 max-h-96 overflow-auto">
                    <div className="space-y-2">
                      {Object.entries(customerFullData.transformed).map(([key, value]) => {
                        if (key === 'raw_data') return null;
                        return (
                          <div key={key} className="border-b border-slate-700 pb-2">
                            <span className="text-slate-400 text-xs font-medium">{key}:</span>
                            <div className="text-slate-200 text-sm mt-1">
                              {typeof value === 'object' && value !== null
                                ? JSON.stringify(value, null, 2)
                                : value === null || value === undefined
                                ? '-'
                                : String(value)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {customers.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xl font-bold text-white mb-4">
                Customers in Database ({customers.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Customer ID</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Customer Name</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Class</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Status</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Balance</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Credit Limit</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">City</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Country</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-slate-300">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((customer) => (
                      <tr key={customer.id} className="border-b border-slate-700/50 hover:bg-slate-700/30">
                        <td className="px-4 py-3 text-sm text-white font-mono">{customer.customer_id}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{customer.customer_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{customer.customer_class || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            customer.customer_status === 'Active' ? 'bg-green-900/30 text-green-400' :
                            customer.customer_status === 'Inactive' ? 'bg-slate-600/30 text-slate-400' :
                            'bg-slate-700/30 text-slate-400'
                          }`}>
                            {customer.customer_status || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-white font-mono">
                          {customer.balance ? customer.balance.toFixed(2) : '0.00'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {customer.credit_limit ? customer.credit_limit.toFixed(2) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">{customer.city || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{customer.country || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">{customer.general_email || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
