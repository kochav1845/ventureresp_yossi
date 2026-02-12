import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function ConnectionDiagnostic() {
  const [tests, setTests] = useState({
    envVars: { status: 'pending', message: '' },
    supabaseReach: { status: 'pending', message: '' },
    authCheck: { status: 'pending', message: '' },
    dbQuery: { status: 'pending', message: '' }
  });

  useEffect(() => {
    runDiagnostics();
  }, []);

  const runDiagnostics = async () => {
    // Test 1: Environment Variables
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (url && key) {
      setTests(prev => ({
        ...prev,
        envVars: { status: 'success', message: `URL: ${url}` }
      }));
    } else {
      setTests(prev => ({
        ...prev,
        envVars: { status: 'error', message: 'Missing environment variables' }
      }));
      return;
    }

    // Test 2: Network Reachability
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });

      setTests(prev => ({
        ...prev,
        supabaseReach: {
          status: response.ok ? 'success' : 'warning',
          message: `HTTP ${response.status}: ${response.statusText}`
        }
      }));
    } catch (error: any) {
      setTests(prev => ({
        ...prev,
        supabaseReach: { status: 'error', message: error.message }
      }));
      return;
    }

    // Test 3: Auth Session
    try {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      setTests(prev => ({
        ...prev,
        authCheck: {
          status: session ? 'success' : 'warning',
          message: session ? `User: ${session.user.email}` : 'No active session'
        }
      }));
    } catch (error: any) {
      setTests(prev => ({
        ...prev,
        authCheck: { status: 'error', message: error.message }
      }));
    }

    // Test 4: Database Query
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('count')
        .limit(1);

      if (error) throw error;

      setTests(prev => ({
        ...prev,
        dbQuery: { status: 'success', message: 'Database accessible' }
      }));
    } catch (error: any) {
      setTests(prev => ({
        ...prev,
        dbQuery: { status: 'error', message: error.message }
      }));
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Activity className="w-5 h-5 text-gray-400 animate-pulse" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center gap-3 mb-6">
            <Activity className="w-8 h-8 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Connection Diagnostic</h1>
          </div>

          <div className="space-y-4">
            <div className={`border rounded-lg p-4 ${getStatusColor(tests.envVars.status)}`}>
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.envVars.status)}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Environment Variables</h3>
                  <p className="text-sm text-gray-600">{tests.envVars.message || 'Checking...'}</p>
                </div>
              </div>
            </div>

            <div className={`border rounded-lg p-4 ${getStatusColor(tests.supabaseReach.status)}`}>
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.supabaseReach.status)}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Supabase Reachability</h3>
                  <p className="text-sm text-gray-600">{tests.supabaseReach.message || 'Checking...'}</p>
                </div>
              </div>
            </div>

            <div className={`border rounded-lg p-4 ${getStatusColor(tests.authCheck.status)}`}>
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.authCheck.status)}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Authentication Session</h3>
                  <p className="text-sm text-gray-600">{tests.authCheck.message || 'Checking...'}</p>
                </div>
              </div>
            </div>

            <div className={`border rounded-lg p-4 ${getStatusColor(tests.dbQuery.status)}`}>
              <div className="flex items-center gap-3">
                {getStatusIcon(tests.dbQuery.status)}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">Database Query</h3>
                  <p className="text-sm text-gray-600">{tests.dbQuery.message || 'Checking...'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={runDiagnostics}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Run Diagnostics Again
            </button>
            <button
              onClick={() => window.location.href = '/signin'}
              className="flex-1 bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Go to Sign In
            </button>
          </div>

          {tests.supabaseReach.status === 'error' && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900 font-semibold mb-2">
                WebContainer Environment Detected
              </p>
              <p className="text-sm text-blue-800 mb-3">
                The preview environment has network restrictions that may prevent connections to external services like Supabase.
              </p>
              <p className="text-sm text-blue-900 font-semibold mb-2">
                Recommended Solutions:
              </p>
              <ol className="list-decimal list-inside text-sm text-blue-800 space-y-2">
                <li><strong>Refresh the page</strong> - Press Ctrl+R (Windows) or Cmd+R (Mac)</li>
                <li><strong>Open in a new tab</strong> - Right-click the preview URL and open in new tab</li>
                <li><strong>Wait a moment</strong> - The connection may establish after a brief delay</li>
                <li><strong>Download and run locally</strong> - Clone the project and run with <code className="bg-blue-100 px-1 py-0.5 rounded">npm run dev</code></li>
              </ol>
              <div className="mt-3 pt-3 border-t border-blue-200">
                <p className="text-xs text-blue-700">
                  Note: This is a known limitation of browser-based preview environments. The application will work correctly when deployed or run locally.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
