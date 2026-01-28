import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Trash2, AlertTriangle, Loader, CheckCircle, XCircle } from 'lucide-react';

interface ForceDeleteUserProps {
  onBack?: () => void;
}

export default function ForceDeleteUser({ onBack }: ForceDeleteUserProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!confirmed) {
      setError('Please confirm that you want to delete this user');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('force-delete-user', {
        body: { email: email.trim() },
      });

      if (invokeError) {
        throw invokeError;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setSuccess(`User ${email} has been successfully deleted. You can now create a new account with this email.`);
      setEmail('');
      setConfirmed(false);
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-red-100 rounded-lg">
              <Trash2 className="h-6 w-6 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Force Delete User</h1>
          </div>

          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900 mb-1">Warning: Destructive Action</p>
                <p className="text-sm text-amber-800">
                  This tool will completely delete a user account from the system, including:
                </p>
                <ul className="text-sm text-amber-800 mt-2 ml-4 list-disc">
                  <li>Authentication credentials</li>
                  <li>User profile data</li>
                  <li>Pending user records</li>
                </ul>
                <p className="text-sm text-amber-800 mt-2">
                  <strong>Use this only when a user account is stuck</strong> and you need to recreate it from scratch.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleDelete} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                User Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
              <input
                id="confirm"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 text-red-600 rounded border-red-300 focus:ring-red-500"
              />
              <label htmlFor="confirm" className="text-sm text-red-900 cursor-pointer">
                I understand this will permanently delete this user account and all associated data.
                This action cannot be undone.
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">Success!</p>
                  <p className="text-sm text-green-700 mt-1">{success}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !confirmed}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-red-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  Deleting User...
                </>
              ) : (
                <>
                  <Trash2 className="h-5 w-5" />
                  Delete User Account
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
