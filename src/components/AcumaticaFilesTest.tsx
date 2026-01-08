import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function AcumaticaFilesTest() {
  const [acumaticaUrl, setAcumaticaUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [company, setCompany] = useState('');
  const [branch, setBranch] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentType, setPaymentType] = useState('Payment');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleTest = async () => {
    if (!acumaticaUrl || !username || !password || !paymentRef) {
      setError('Please fill in all required fields');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-acumatica-files`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            acumaticaUrl,
            username,
            password,
            company: company || undefined,
            branch: branch || undefined,
            paymentType,
            paymentReferenceNumber: paymentRef,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to test file access');
      }

      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => window.history.back()}
          className="mb-6 flex items-center text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-6">
            Acumatica Files API Test
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Acumatica URL *
              </label>
              <input
                type="text"
                value={acumaticaUrl}
                onChange={(e) => setAcumaticaUrl(e.target.value)}
                placeholder="https://your-instance.acumatica.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username *
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Branch
              </label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Type
              </label>
              <input
                type="text"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                placeholder="Payment"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payment Reference Number *
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="e.g., 4317"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600">{error}</p>
            </div>
          )}

          <button
            onClick={handleTest}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
          >
            {loading ? 'Testing...' : 'Test File Access'}
          </button>

          {result && (
            <div className="mt-8 space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Summary</h2>
                <div className="space-y-1 text-sm">
                  <p><strong>Success:</strong> {result.success ? 'Yes' : 'No'}</p>
                  {result.workingRefFormat && (
                    <>
                      <p><strong>Working Reference Format:</strong> {result.workingRefFormat}</p>
                      <p><strong>Payment Has Files Field:</strong> {result.paymentHasFilesField ? 'Yes' : 'No'}</p>
                      <p><strong>Files Count:</strong> {result.paymentFilesCount}</p>
                    </>
                  )}
                </div>
              </div>

              {result.paymentTopLevelKeys && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Payment Top-Level Fields</h3>
                  <div className="flex flex-wrap gap-2">
                    {result.paymentTopLevelKeys.map((key: string) => (
                      <span key={key} className="px-2 py-1 bg-blue-200 rounded text-xs">
                        {key}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                <h2 className="text-lg font-semibold">API Endpoint Tests</h2>
                {result.tests?.map((test: any, index: number) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 ${
                      test.success
                        ? 'bg-green-50 border-green-300'
                        : 'bg-red-50 border-red-300'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{test.method}</h3>
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          test.success
                            ? 'bg-green-200 text-green-800'
                            : 'bg-red-200 text-red-800'
                        }`}
                      >
                        {test.status || 'Error'}
                      </span>
                    </div>

                    <p className="text-xs text-gray-600 mb-2 break-all">{test.url}</p>

                    {test.refFormat && (
                      <p className="text-sm mb-1"><strong>Format:</strong> {test.refFormat}</p>
                    )}

                    {test.responseType && (
                      <p className="text-sm mb-1"><strong>Response Type:</strong> {test.responseType}</p>
                    )}

                    {test.itemCount !== undefined && (
                      <p className="text-sm mb-1"><strong>Item Count:</strong> {test.itemCount}</p>
                    )}

                    {test.hasFiles !== undefined && (
                      <p className="text-sm mb-1"><strong>Has Files:</strong> {test.hasFiles ? 'Yes' : 'No'}</p>
                    )}

                    {test.filesCount !== undefined && (
                      <p className="text-sm mb-1"><strong>Files Count:</strong> {test.filesCount}</p>
                    )}

                    {test.responseKeys && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Response Keys:</p>
                        <div className="flex flex-wrap gap-1">
                          {test.responseKeys.map((key: string) => (
                            <span key={key} className="px-2 py-1 bg-gray-200 rounded text-xs">
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {test.firstItemKeys && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">First Item Keys:</p>
                        <div className="flex flex-wrap gap-1">
                          {test.firstItemKeys.map((key: string) => (
                            <span key={key} className="px-2 py-1 bg-gray-200 rounded text-xs">
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {test.firstFileKeys && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">First File Keys:</p>
                        <div className="flex flex-wrap gap-1">
                          {test.firstFileKeys.map((key: string) => (
                            <span key={key} className="px-2 py-1 bg-gray-200 rounded text-xs">
                              {key}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {test.firstItemSample && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Sample:</p>
                        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                          {test.firstItemSample}
                        </pre>
                      </div>
                    )}

                    {test.firstFileSample && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">File Sample:</p>
                        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                          {test.firstFileSample}
                        </pre>
                      </div>
                    )}

                    {test.error && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Error:</p>
                        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
                          {test.error}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
