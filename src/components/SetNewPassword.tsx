import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Lock, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react';

export default function SetNewPassword() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validatePassword = (password: string) => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters long';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must contain at least one number';
    }
    if (!/[!@#$%^&*]/.test(password)) {
      return 'Password must contain at least one special character (!@#$%^&*)';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('You must be logged in to change your password');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (updateError) throw updateError;

      const { data: tempPasswords } = await supabase
        .from('temporary_passwords')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (tempPasswords && tempPasswords.length > 0) {
        await Promise.all(
          tempPasswords.map(tp =>
            supabase.rpc('mark_temporary_password_used', { p_temp_password_id: tp.id })
          )
        );
      }

      setSuccess(true);

      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (err: any) {
      console.error('Error updating password:', err);
      setError(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-green-50 to-white flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-8 text-white">
              <div className="flex items-center justify-center">
                <CheckCircle className="w-16 h-16" />
              </div>
            </div>

            <div className="p-8 text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">Password Updated!</h2>
              <p className="text-gray-600 mb-6">
                Your password has been successfully updated. You can now use your new password to sign in.
              </p>
              <p className="text-sm text-gray-500">
                Redirecting to dashboard...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-8 text-white">
            <div className="flex items-center justify-center">
              <img
                src="https://ahmrghovmuxowchijumv.supabase.co/storage/v1/object/public/uploaded-images/-logoventure_1644182585__38264.webp"
                alt="Logo"
                className="h-20 w-auto"
              />
            </div>
          </div>

          <div className="p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Set Your Password</h2>
            <p className="text-gray-600 mb-6">
              Please create a secure password for your account. You'll use this password for all future logins.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-red-800 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter new password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Confirm new password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Password Requirements:</p>
                <ul className="text-xs text-blue-800 space-y-1">
                  <li className="flex items-center gap-2">
                    <span className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                      {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                      {/[A-Z]/.test(newPassword) ? '✓' : '○'} One uppercase letter
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={/[a-z]/.test(newPassword) ? 'text-green-600' : ''}>
                      {/[a-z]/.test(newPassword) ? '✓' : '○'} One lowercase letter
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>
                      {/[0-9]/.test(newPassword) ? '✓' : '○'} One number
                    </span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className={/[!@#$%^&*]/.test(newPassword) ? 'text-green-600' : ''}>
                      {/[!@#$%^&*]/.test(newPassword) ? '✓' : '○'} One special character (!@#$%^&*)
                    </span>
                  </li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {loading ? 'Updating Password...' : 'Set Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}