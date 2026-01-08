import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, FileText } from 'lucide-react';

interface ContractApiTestProps {
  onBack?: () => void;
}

export default function ContractApiTest({ onBack }: ContractApiTestProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    acumaticaUrl: import.meta.env.VITE_ACUMATICA_URL || '',
    username: import.meta.env.VITE_ACUMATICA_USERNAME || '',
    password: import.meta.env.VITE_ACUMATICA_PASSWORD || '',
    company: import.meta.env.VITE_ACUMATICA_COMPANY || '',
    branch: import.meta.env.VITE_ACUMATICA_BRANCH || '',
    paymentType: 'Payment',
    paymentReferenceNumber: ''
  });

  const handleTest = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-contract-api-expand`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(formData),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Test failed');
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <button
          onClick={handleBack}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-2xl font-bold mb-6">Contract-Based API Test with $expand</h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Acumatica URL
              </label>
              <input
                type="text"
                value={formData.acumaticaUrl}
                onChange={(e) => setFormData({ ...formData, acumaticaUrl: e.target.value })}
                placeholder="https://your-instance.acumatica.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company (optional)
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch (optional)
              </label>
              <input
                type="text"
                value={formData.branch}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Type
              </label>
              <input
                type="text"
                value={formData.paymentType}
                onChange={(e) => setFormData({ ...formData, paymentType: e.target.value })}
                placeholder="Payment"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Reference Number
              </label>
              <input
                type="text"
                value={formData.paymentReferenceNumber}
                onChange={(e) => setFormData({ ...formData, paymentReferenceNumber: e.target.value })}
                placeholder="e.g., 12345"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <button
            onClick={handleTest}
            disabled={loading || !formData.acumaticaUrl || !formData.username || !formData.password || !formData.paymentReferenceNumber}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5 mr-2" />
            {loading ? 'Testing...' : 'Run Test'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 font-semibold mb-2">Error</h3>
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className={`rounded-lg p-6 ${result.success ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
              <h3 className={`font-semibold mb-2 ${result.success ? 'text-green-800' : 'text-yellow-800'}`}>
                {result.success ? '✓ Success!' : '⚠ No Files Found'}
              </h3>
              <div className="text-sm space-y-1">
                <p>Total Tests: {result.summary?.totalTests}</p>
                <p>Successful Tests: {result.summary?.successfulTests}</p>
                <p>Found Files: {result.summary?.foundFiles ? 'Yes' : 'No'}</p>
              </div>
            </div>

            {result.successfulCall && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2 text-green-600" />
                  Files Found ({result.successfulCall.filesCount})
                </h3>

                <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                  <p><strong>API Version:</strong> {result.successfulCall.apiVersion}</p>
                  <p><strong>Reference Format:</strong> {result.successfulCall.refFormat}</p>
                  <p className="mt-2 text-xs text-gray-600 break-all"><strong>URL:</strong> {result.successfulCall.url}</p>
                </div>

                <div className="space-y-4">
                  {result.successfulCall.files.map((file: any, index: number) => (
                    <div key={index} className="border border-gray-200 rounded p-4">
                      <h4 className="font-semibold mb-2">File {index + 1}</h4>
                      <pre className="text-xs bg-gray-50 p-3 rounded overflow-x-auto">
                        {JSON.stringify(file, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">All Test Results</h3>
              <div className="space-y-4">
                {result.allTests?.map((test: any, index: number) => (
                  <div key={index} className={`border rounded p-4 ${test.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold">{test.test}</h4>
                      <span className={`px-2 py-1 rounded text-xs ${test.ok ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                        {test.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">API Version: {test.apiVersion} | Ref Format: {test.refFormat}</p>
                    <p className="text-xs text-gray-500 break-all mb-2">{test.url}</p>

                    {test.ok && (
                      <div className="text-sm space-y-1">
                        <p>Has Files Field: {test.hasFiles ? 'Yes' : 'No'}</p>
                        {test.hasFiles && (
                          <>
                            <p>Files Type: {test.filesType}</p>
                            <p>Is Array: {test.filesIsArray ? 'Yes' : 'No'}</p>
                            <p>Files Count: {test.filesCount || 0}</p>
                            {test.firstFileKeys && (
                              <p>File Keys: {test.firstFileKeys.join(', ')}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {test.error && (
                      <p className="text-sm text-red-700 mt-2">Error: {test.error}</p>
                    )}

                    {test.errorText && (
                      <pre className="text-xs text-red-700 mt-2 overflow-x-auto">
                        {test.errorText.substring(0, 200)}...
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
