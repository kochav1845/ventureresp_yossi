import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Mail, Send, Loader, CheckCircle, XCircle } from 'lucide-react';

interface ResendTemporaryPasswordProps {
  onBack?: () => void;
}

export default function ResendTemporaryPassword({ onBack }: ResendTemporaryPasswordProps) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const generateTemporaryPassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';

    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];

    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    return password.split('').sort(() => Math.random() - 0.5).join('');
  };

  const handleResendPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    setNewPassword('');

    try {
      const { data: userData, error: userError } = await supabase
        .from('user_profiles')
        .select('id, full_name, email')
        .eq('email', email.trim())
        .single();

      if (userError || !userData) {
        throw new Error('User not found. Please make sure the email is correct and the user exists.');
      }

      const temporaryPassword = generateTemporaryPassword();
      setNewPassword(temporaryPassword);

      const { data: resetData, error: resetError } = await supabase.auth.admin.updateUserById(
        userData.id,
        { password: temporaryPassword }
      );

      if (resetError) throw resetError;

      const { data: emailData, error: emailError } = await supabase.functions.invoke('send-temporary-password', {
        body: {
          to: email.trim(),
          name: userData.full_name || 'User',
          temporaryPassword: temporaryPassword,
        },
      });

      if (emailError) {
        console.error('Email error:', emailError);
        setError(`Password was reset, but email failed to send. Please share this password manually: ${temporaryPassword}`);
      } else {
        setSuccess(`Temporary password sent successfully to ${email}!`);
      }

      setEmail('');
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.message || 'Failed to resend temporary password');
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
            <div className="p-2 bg-blue-100 rounded-lg">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Resend Temporary Password</h1>
          </div>

          <p className="text-slate-600 mb-6">
            Generate a new temporary password and send it via email to an existing user.
          </p>

          <form onSubmit={handleResendPassword} className="space-y-6">
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
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>

            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  {newPassword && (
                    <div className="mt-3 p-3 bg-white rounded border border-red-300">
                      <p className="text-xs font-semibold text-red-900 mb-1">Temporary Password:</p>
                      <code className="text-sm font-mono text-red-900 break-all">{newPassword}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-900">Success!</p>
                  <p className="text-sm text-green-700 mt-1">{success}</p>
                  {newPassword && (
                    <div className="mt-3 p-3 bg-white rounded border border-green-300">
                      <p className="text-xs font-semibold text-green-900 mb-1">
                        Temporary Password (for your records):
                      </p>
                      <code className="text-sm font-mono text-green-900 break-all">{newPassword}</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Generate & Send New Password
                </>
              )}
            </button>
          </form>

          <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-900">
              <strong>Note:</strong> This will reset the user's password and send them a new temporary password via email.
              The temporary password will expire in 7 days.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
