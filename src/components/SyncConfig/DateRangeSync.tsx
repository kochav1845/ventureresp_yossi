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
    const syncStartTime = Date.now();

    console.group(`[DateRangeSync] Starting ${config.entityType} sync`);
    console.log(`[DateRangeSync] Entity type: ${config.entityType}`);
    console.log(`[DateRangeSync] Range type: ${config.rangeType}`);
    console.log(`[DateRangeSync] Timestamp: ${new Date().toISOString()}`);

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

      console.log(`[DateRangeSync] Resolved date range:`);
      console.log(`  Start: ${startDate} (${new Date(startDate).toLocaleDateString()})`);
      console.log(`  End:   ${endDate} (${new Date(endDate).toLocaleDateString()})`);

      if (config.entityType === 'prepayment') {
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-all-prepayments`;
        console.log(`[DateRangeSync] Calling edge function: fetch-all-prepayments`);
        console.log(`[DateRangeSync] URL: ${functionUrl}`);

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({})
        });

        console.log(`[DateRangeSync] Response status: ${response.status} ${response.statusText}`);
        const result = await response.json();
        console.log(`[DateRangeSync] Response body:`, result);

        if (response.ok && result.success) {
          const elapsed = ((Date.now() - syncStartTime) / 1000).toFixed(1);
          console.log(`[DateRangeSync] Prepayment sync completed in ${elapsed}s`);
          console.log(`  Created: ${result.created || 0}`);
          console.log(`  Updated: ${result.updated || 0}`);
          console.log(`  Total fetched: ${result.totalFetched || 0}`);
          console.groupEnd();

          setConfig(prev => ({
            ...prev,
            syncing: false,
            message: `Prepayment sync completed! Created: ${result.created || 0}, Updated: ${result.updated || 0}, Total fetched: ${result.totalFetched || 0}`
          }));
        } else {
          console.error(`[DateRangeSync] Prepayment sync failed:`, result.error);
          console.groupEnd();
          throw new Error(result.error || 'Prepayment sync failed');
        }
      } else {
        const edgeFunctionName = `acumatica-${config.entityType}-date-range-sync`;
        const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${edgeFunctionName}`;

        console.log(`[DateRangeSync] Calling edge function: ${edgeFunctionName}`);
        console.log(`[DateRangeSync] URL: ${functionUrl}`);
        console.log(`[DateRangeSync] Payload:`, { startDate, endDate });

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ startDate, endDate })
        });

        console.log(`[DateRangeSync] Response status: ${response.status} ${response.statusText}`);
        const result = await response.json();
        console.log(`[DateRangeSync] Response body:`, result);

        if (response.ok && result.success) {
          const jobId = result.jobId;
          console.log(`[DateRangeSync] Async job created with ID: ${jobId}`);
          console.log(`[DateRangeSync] Polling for job status every 3s...`);
          setConfig(prev => ({ ...prev, message: 'Sync job started. Checking progress...' }));

          let pollCount = 0;
          const maxPolls = 120;

          const checkJobStatus = async () => {
            pollCount++;
            const elapsed = ((Date.now() - syncStartTime) / 1000).toFixed(1);

            const { data: job, error: jobError } = await supabase
              .from('async_sync_jobs')
              .select('*')
              .eq('id', jobId)
              .maybeSingle();

            if (jobError) {
              console.error(`[DateRangeSync] Poll #${pollCount} - Error querying job:`, jobError.message);
              setTimeout(checkJobStatus, 3000);
              return;
            }

            if (!job) {
              console.warn(`[DateRangeSync] Poll #${pollCount} - Job not found (id: ${jobId})`);
              return;
            }

            const progress = (job.progress || {}) as any;

            console.log(
              `[DateRangeSync] Poll #${pollCount} [${elapsed}s] | Status: ${job.status} | ` +
              `Total: ${progress.total ?? '?'} | Created: ${progress.created ?? 0} | ` +
              `Updated: ${progress.updated ?? 0} | Apps: ${progress.applicationsSynced ?? 0} | ` +
              `Files: ${progress.filesSynced ?? 0} | Errors: ${(progress.errors || []).length}`
            );

            if (job.status === 'completed') {
              const finalElapsed = ((Date.now() - syncStartTime) / 1000).toFixed(1);
              console.log(`[DateRangeSync] ---- SYNC COMPLETED ----`);
              console.log(`  Total time: ${finalElapsed}s`);
              console.log(`  Total payments: ${progress.total || 0}`);
              console.log(`  Created: ${progress.created || 0}`);
              console.log(`  Updated: ${progress.updated || 0}`);
              console.log(`  Applications synced: ${progress.applicationsSynced || 0}`);
              console.log(`  Files synced: ${progress.filesSynced || 0}`);
              if (progress.errors && progress.errors.length > 0) {
                console.warn(`  Errors (${progress.errors.length}):`);
                progress.errors.forEach((err: string, i: number) => {
                  console.warn(`    ${i + 1}. ${err}`);
                });
              }
              if (job.started_at && job.completed_at) {
                const serverDuration = ((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000).toFixed(1);
                console.log(`  Server-side duration: ${serverDuration}s`);
              }
              console.groupEnd();

              const parts = [`Sync completed! Total: ${progress.total || 0}`];
              if (progress.created) parts.push(`Created: ${progress.created}`);
              if (progress.updated) parts.push(`Updated: ${progress.updated}`);
              if (progress.applicationsSynced) parts.push(`Applications: ${progress.applicationsSynced}`);
              if (progress.filesSynced) parts.push(`Files: ${progress.filesSynced}`);
              if (progress.errors?.length) parts.push(`Errors: ${progress.errors.length}`);

              setConfig(prev => ({
                ...prev,
                syncing: false,
                message: parts.join(' | ')
              }));
            } else if (job.status === 'failed') {
              console.error(`[DateRangeSync] ---- SYNC FAILED ----`);
              console.error(`  Error: ${job.error_message || 'Unknown error'}`);
              console.error(`  Time elapsed: ${elapsed}s`);
              console.groupEnd();

              setConfig(prev => ({
                ...prev,
                syncing: false,
                message: `Sync failed: ${job.error_message || 'Unknown error'}`
              }));
            } else if (pollCount >= maxPolls) {
              console.warn(`[DateRangeSync] ---- POLL TIMEOUT ----`);
              console.warn(`  Stopped polling after ${pollCount} attempts (${elapsed}s)`);
              console.warn(`  Job is still in "${job.status}" state`);
              console.warn(`  Job ID: ${jobId}`);
              console.groupEnd();

              setConfig(prev => ({
                ...prev,
                syncing: false,
                message: `Sync may still be running in the background (job: ${jobId}). Check logs later.`
              }));
            } else {
              setTimeout(checkJobStatus, 3000);
            }
          };

          setTimeout(checkJobStatus, 3000);
        } else {
          console.error(`[DateRangeSync] Edge function returned error:`, result);
          console.groupEnd();
          throw new Error(result.error || 'Sync failed');
        }
      }
    } catch (err: any) {
      console.error(`[DateRangeSync] Exception during sync:`, err);
      console.groupEnd();
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
