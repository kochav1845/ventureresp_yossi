import { useState } from 'react';
import { Calendar, Download, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface DateRangeSyncProps {
  hasCredentials: boolean;
}

export default function DateRangeSync({ hasCredentials }: DateRangeSyncProps) {
  const [config, setConfig] = useState({
    entityType: 'invoice',
    rangeType: 'last_week',
    startDate: '',
    endDate: '',
    syncing: false,
    message: ''
  });

  const getDateRange = (rangeType: string) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (rangeType) {
      case 'last_week':
        const lastSunday = new Date(now);
        lastSunday.setDate(now.getDate() - now.getDay() - 7);
        lastSunday.setHours(0, 0, 0, 0);
        const lastSaturday = new Date(lastSunday);
        lastSaturday.setDate(lastSunday.getDate() + 6);
        lastSaturday.setHours(23, 59, 59, 999);
        startDate = lastSunday;
        endDate = lastSaturday;
        break;
      case 'this_week':
        const thisSunday = new Date(now);
        thisSunday.setDate(now.getDate() - now.getDay());
        thisSunday.setHours(0, 0, 0, 0);
        startDate = thisSunday;
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_month':
        const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        firstDayLastMonth.setHours(0, 0, 0, 0);
        const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
        lastDayLastMonth.setHours(23, 59, 59, 999);
        startDate = firstDayLastMonth;
        endDate = lastDayLastMonth;
        break;
      case 'this_month':
        const firstDayThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        firstDayThisMonth.setHours(0, 0, 0, 0);
        startDate = firstDayThisMonth;
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_30_days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'last_90_days':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 90);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date(now);
        endDate = new Date(now);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    };
  };

  const triggerSync = async () => {
    setConfig(prev => ({ ...prev, syncing: true, message: '' }));

    try {
      let startDate: string;
      let endDate: string;

      if (config.rangeType === 'custom') {
        if (!config.startDate || !config.endDate) {
          throw new Error('Please select both start and end dates');
        }
        startDate = new Date(config.startDate).toISOString();
        endDate = new Date(config.endDate + 'T23:59:59').toISOString();
      } else {
        const range = getDateRange(config.rangeType);
        startDate = range.startDate;
        endDate = range.endDate;
      }

      if (config.entityType === 'prepayment') {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-all-prepayments`;
        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({})
        });

        const result = await response.json();

        if (response.ok && result.success) {
          setConfig(prev => ({
            ...prev,
            syncing: false,
            message: `Prepayment sync completed! Created: ${result.created || 0}, Updated: ${result.updated || 0}, Total fetched: ${result.totalFetched || 0}`
          }));
        } else {
          throw new Error(result.error || 'Prepayment sync failed');
        }
      } else {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/acumatica-${config.entityType}-date-range-sync`;

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ startDate, endDate })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const jobId = result.jobId;
          setConfig(prev => ({ ...prev, message: 'Sync job started. Checking progress...' }));

          const checkJobStatus = async () => {
            const { data: job } = await supabase
              .from('async_sync_jobs')
              .select('*')
              .eq('id', jobId)
              .single();

            if (!job) return;

            if (job.status === 'completed') {
              const progress = job.progress as any;
              setConfig(prev => ({
                ...prev,
                syncing: false,
                message: `Sync completed! Created: ${progress.created || 0}, Updated: ${progress.updated || 0}, Total: ${progress.total || 0}`
              }));
            } else if (job.status === 'failed') {
              setConfig(prev => ({
                ...prev,
                syncing: false,
                message: `Sync failed: ${job.error_message || 'Unknown error'}`
              }));
            } else {
              setTimeout(checkJobStatus, 2000);
            }
          };

          setTimeout(checkJobStatus, 2000);
        } else {
          throw new Error(result.error || 'Sync failed');
        }
      }
    } catch (err: any) {
      setConfig(prev => ({
        ...prev,
        syncing: false,
        message: `Error: ${err.message}`
      }));
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
          <Calendar className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Date Range Sync</h2>
          <p className="text-sm text-slate-500">Sync historical data for a specific date range</p>
        </div>
      </div>

      {config.message && (
        <div className={`mb-4 p-3 rounded-lg text-sm border ${
          config.message.includes('Error') || config.message.includes('failed')
            ? 'bg-red-50 text-red-700 border-red-200'
            : config.message.includes('completed')
            ? 'bg-green-50 text-green-700 border-green-200'
            : 'bg-blue-50 text-blue-700 border-blue-200'
        }`}>
          {config.message}
        </div>
      )}

      {!hasCredentials && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            Please configure Acumatica credentials first to use this feature.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Entity Type</label>
            <select
              value={config.entityType}
              onChange={(e) => setConfig(prev => ({ ...prev, entityType: e.target.value }))}
              disabled={config.syncing}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
            >
              <option value="customer">Customers</option>
              <option value="invoice">Invoices</option>
              <option value="payment">Payments</option>
              <option value="prepayment">Prepaid Payments</option>
            </select>
          </div>

          {config.entityType !== 'prepayment' && (
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Date Range</label>
              <select
                value={config.rangeType}
                onChange={(e) => setConfig(prev => ({ ...prev, rangeType: e.target.value }))}
                disabled={config.syncing}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              >
                <option value="last_week">Last Week</option>
                <option value="this_week">This Week</option>
                <option value="last_month">Last Month</option>
                <option value="this_month">This Month</option>
                <option value="last_30_days">Last 30 Days</option>
                <option value="last_90_days">Last 90 Days</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>
          )}
          {config.entityType === 'prepayment' && (
            <div className="flex items-center">
              <p className="text-sm text-slate-500 mt-6">Fetches all prepaid payments from Acumatica</p>
            </div>
          )}
        </div>

        {config.rangeType === 'custom' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Start Date</label>
              <input
                type="date"
                value={config.startDate}
                onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
                disabled={config.syncing}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">End Date</label>
              <input
                type="date"
                value={config.endDate}
                onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
                disabled={config.syncing}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50"
              />
            </div>
          </div>
        )}

        <button
          onClick={triggerSync}
          disabled={config.syncing || !hasCredentials}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
        >
          {config.syncing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Start Sync
            </>
          )}
        </button>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            This performs a one-time sync of historical data. It runs in the background and may take several minutes for large date ranges. You'll see the progress updates above.
          </p>
        </div>
      </div>
    </div>
  );
}
