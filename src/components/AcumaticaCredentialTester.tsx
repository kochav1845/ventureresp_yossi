import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, XCircle, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}

export default function AcumaticaCredentialTester({ onBack }: { onBack: () => void }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState('ventureresp.acumatica.com');
  const [username, setUsername] = useState('Dev');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [branch, setBranch] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  };

  const testCredentials = async () => {
    setTesting(true);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setResult({
          success: false,
          message: 'You must be logged in to test credentials'
        });
        setTesting(false);
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-acumatica-credentials`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          url,
          username,
          password,
          company: company || undefined,
          branch: branch || undefined
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        setResult({
          success: false,
          message: `Request failed: ${errorText}`,
          details: errorText
        });
        setTesting(false);
        return;
      }

      const data = await response.json();
      setResult(data);
    } catch (error: any) {
      setResult({
        success: false,
        message: `Error: ${error.message}`,
        details: error.stack
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={handleBack}
          className="mb-6 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-xl shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Acumatica Credential Tester</h1>
          <p className="text-gray-600 mb-8">Test your Acumatica API credentials to ensure they work correctly</p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Acumatica URL *
              </label>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="ventureresp.acumatica.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">Enter without http:// or https://</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Dev"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company (optional)
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Leave empty if not required"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Branch (optional)
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="Leave empty if not required"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={testCredentials}
              disabled={testing || !url || !username || !password}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {testing ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Testing Credentials...
                </>
              ) : (
                'Test Credentials'
              )}
            </button>

            {result && (
              <div className={`p-4 rounded-lg border-2 ${
                result.success
                  ? 'bg-green-50 border-green-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-start gap-3">
                  {result.success ? (
                    <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <h3 className={`font-semibold mb-1 ${
                      result.success ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {result.success ? 'Success!' : 'Failed'}
                    </h3>
                    <p className={result.success ? 'text-green-700' : 'text-red-700'}>
                      {result.message}
                    </p>
                    {result.details && (
                      <details className="mt-2">
                        <summary className={`cursor-pointer text-sm font-medium ${
                          result.success ? 'text-green-800' : 'text-red-800'
                        }`}>
                          View Details
                        </summary>
                        <pre className={`mt-2 text-xs p-2 rounded overflow-auto max-h-60 ${
                          result.success ? 'bg-green-100 text-green-900' : 'bg-red-100 text-red-900'
                        }`}>
                          {typeof result.details === 'string'
                            ? result.details
                            : JSON.stringify(result.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h3 className="font-semibold text-blue-900 mb-2">What This Tests:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>Authenticates with the Acumatica API using your credentials</li>
              <li>Verifies that authentication cookies are received</li>
              <li>Tests API access by fetching one customer record</li>
              <li>Properly logs out to clean up the session</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
