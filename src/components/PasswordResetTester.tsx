import { useState } from 'react';
import { Mail, Send, CheckCircle, AlertCircle } from 'lucide-react';

export default function PasswordResetTester() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        setResult({ success: false, message: data.error || 'Failed to send reset email' });
      } else {
        setResult({ success: true, message: 'Password reset email sent successfully!' });
      }
    } catch (err) {
      setResult({ success: false, message: 'An unexpected error occurred' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <Mail className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold text-white">Password Reset Tester</h1>
          </div>

          <form onSubmit={handleSendReset} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email to send reset link"
                className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-lg font-semibold hover:from-blue-700 hover:to-cyan-700 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Reset Email
                </>
              )}
            </button>
          </form>

          {result && (
            <div
              className={`mt-6 p-4 rounded-lg flex items-start gap-3 ${
                result.success
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <div>
                <p className={result.success ? 'text-green-400' : 'text-red-400'}>
                  {result.message}
                </p>
                {result.success && (
                  <p className="text-slate-400 text-sm mt-2">
                    Check your email inbox for the password reset link. Click it to reset your password.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 p-4 bg-slate-700/50 rounded-lg border border-slate-600">
            <h3 className="text-sm font-semibold text-white mb-2">How it works:</h3>
            <ul className="text-sm text-slate-300 space-y-1 list-disc list-inside">
              <li>Enter an email address and click "Send Reset Email"</li>
              <li>A secure token is generated and stored in the database</li>
              <li>An email is sent via SendGrid with a reset link containing the token</li>
              <li>The link format: https://ventureresp.app/reset-password?resetlink=TOKEN</li>
              <li>The token expires after 1 hour or when used</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
