import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Pause, RotateCcw, Loader2, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BackfillProgress {
  id: string;
  backfill_type: string;
  is_running: boolean;
  batch_size: number;
  current_offset: number;
  total_items: number;
  items_processed: number;
  applications_found: number;
  attachments_found: number;
  errors_count: number;
  last_error: string | null;
  started_at: string | null;
  last_batch_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function AutoBackfillMonitor() {
  const [progress, setProgress] = useState<BackfillProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    loadProgress();
    const interval = setInterval(loadProgress, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadProgress = async () => {
    try {
      const { data, error } = await supabase
        .from('backfill_progress')
        .select('*')
        .eq('backfill_type', 'payment_data')
        .maybeSingle();

      if (error) throw error;
      setProgress(data);
    } catch (error) {
      console.error('Failed to load progress:', error);
    } finally {
      setLoading(false);
    }
  };

  const triggerBackfill = async () => {
    setTriggering(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-backfill-payment-data`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({})
        }
      );

      const result = await response.json();
      console.log('Backfill triggered:', result);
      await loadProgress();
    } catch (error) {
      console.error('Failed to trigger backfill:', error);
      alert('Failed to trigger backfill');
    } finally {
      setTriggering(false);
    }
  };

  const resetBackfill = async () => {
    if (!confirm('Are you sure you want to reset the backfill progress? This will start over from the beginning.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('backfill_progress')
        .update({
          is_running: false,
          current_offset: 0,
          items_processed: 0,
          applications_found: 0,
          attachments_found: 0,
          errors_count: 0,
          last_error: null,
          started_at: null,
          last_batch_at: null,
          completed_at: null
        })
        .eq('backfill_type', 'payment_data');

      if (error) throw error;
      await loadProgress();
      alert('Backfill progress reset successfully');
    } catch (error) {
      console.error('Failed to reset backfill:', error);
      alert('Failed to reset backfill');
    }
  };

  const getEstimatedTimeRemaining = () => {
    if (!progress || !progress.started_at || !progress.last_batch_at) return null;
    if (progress.items_processed === 0) return null;

    const startTime = new Date(progress.started_at).getTime();
    const lastBatchTime = new Date(progress.last_batch_at).getTime();
    const elapsedMs = lastBatchTime - startTime;
    const itemsPerMs = progress.items_processed / elapsedMs;
    const remainingItems = progress.total_items - progress.items_processed;
    const remainingMs = remainingItems / itemsPerMs;

    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  const getElapsedTime = () => {
    if (!progress || !progress.started_at) return null;

    const startTime = new Date(progress.started_at).getTime();
    const now = Date.now();
    const elapsedMs = now - startTime;

    const hours = Math.floor(elapsedMs / (1000 * 60 * 60));
    const minutes = Math.floor((elapsedMs % (1000 * 60 * 60)) / (1000 * 60));

    return { hours, minutes };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No Backfill Progress Found</h2>
            <p className="text-gray-600">The backfill progress tracker has not been initialized.</p>
          </div>
        </div>
      </div>
    );
  }

  const percentComplete = progress.total_items > 0
    ? Math.round((progress.items_processed / progress.total_items) * 100)
    : 0;

  const estimatedTime = getEstimatedTimeRemaining();
  const elapsedTime = getElapsedTime();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => window.history.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">Payment Data Auto-Backfill</h1>
            </div>
            <div className="flex items-center gap-2">
              {progress.completed_at ? (
                <span className="flex items-center gap-2 text-green-600 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  Completed
                </span>
              ) : progress.is_running ? (
                <span className="flex items-center gap-2 text-blue-600 font-medium">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Running
                </span>
              ) : (
                <span className="flex items-center gap-2 text-gray-600 font-medium">
                  <Pause className="w-5 h-5" />
                  Paused
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Total Payments</div>
            <div className="text-3xl font-bold text-gray-900">{progress.total_items.toLocaleString()}</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Processed</div>
            <div className="text-3xl font-bold text-blue-600">{progress.items_processed.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">{percentComplete}% complete</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Remaining</div>
            <div className="text-3xl font-bold text-orange-600">
              {(progress.total_items - progress.items_processed).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700">Overall Progress</span>
              <span className="text-sm font-bold text-gray-900">{percentComplete}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-600 h-full transition-all duration-500 ease-out"
                style={{ width: `${percentComplete}%` }}
              />
            </div>
          </div>

          {elapsedTime && (
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <Clock className="w-4 h-4" />
              <span>
                Elapsed: {elapsedTime.hours}h {elapsedTime.minutes}m
              </span>
            </div>
          )}

          {estimatedTime && !progress.completed_at && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="w-4 h-4" />
              <span>
                Estimated remaining: {estimatedTime.hours}h {estimatedTime.minutes}m
              </span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Applications Found</div>
            <div className="text-2xl font-bold text-green-600">{progress.applications_found.toLocaleString()}</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Attachments Found</div>
            <div className="text-2xl font-bold text-purple-600">{progress.attachments_found.toLocaleString()}</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Batch Size</div>
            <div className="text-2xl font-bold text-gray-900">{progress.batch_size}</div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="text-sm text-gray-600 mb-1">Errors</div>
            <div className="text-2xl font-bold text-red-600">{progress.errors_count}</div>
          </div>
        </div>

        {progress.last_error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-red-900 mb-1">Last Error</div>
                <div className="text-sm text-red-700">{progress.last_error}</div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Control Panel</h3>
          <div className="flex gap-4">
            <button
              onClick={triggerBackfill}
              disabled={triggering || progress.completed_at !== null}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {triggering ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Trigger Batch Now
                </>
              )}
            </button>

            <button
              onClick={resetBackfill}
              disabled={progress.is_running}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
              Reset Progress
            </button>
          </div>
          <p className="text-sm text-gray-600 mt-4">
            The backfill runs automatically every minute via pg_cron. You can manually trigger a batch or reset progress if needed.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">How It Works</h3>
          <ul className="text-sm text-blue-800 space-y-2">
            <li>• Automatically processes {progress.batch_size} payments per minute</li>
            <li>• Fetches payment applications and attachments from Acumatica</li>
            <li>• Stores files in Supabase Storage and links them to payments</li>
            <li>• Tracks progress in database and automatically stops when complete</li>
            <li>• Can be safely stopped and resumed - progress is persisted</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
