import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { ArrowLeft, UserPlus, Mail, User, Shield, Loader, CheckCircle, XCircle } from 'lucide-react';

interface AdminCreateUserProps {
  onBack?: () => void;
}

export default function AdminCreateUser({ onBack }: AdminCreateUserProps) {
  const navigate = useNavigate();
  const handleBack = onBack || (() => navigate(-1));

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'collector' | 'secretary' | 'admin'>('collector');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

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

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !fullName || !role) {
      setError('Please fill in all fields');
      return;
    }

    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setGeneratedPassword('');

    try {
      const temporaryPassword = generateTemporaryPassword();
      setGeneratedPassword(temporaryPassword);

      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password: temporaryPassword,
        options: {
          data: {
            full_name: fullName.trim(),
            role: role,
            created_by_admin: true,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (signUpError) throw signUpError;

      if (!authData.user) {
        throw new Error('User creation failed - no user data returned');
      }

      await new Promise(resolve => setTimeout(resolve, 2000));

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('id', authData.user.id)
        .single();

      if (profileError) {
        console.error('Profile check error:', profileError);
      }

      if (!profileData) {
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: authData.user.id,
            email: email.trim(),
            full_name: fullName.trim(),
            role: role,
            approved: true,
          });

        if (insertError) throw insertError;
      } else {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            full_name: fullName.trim(),
            role: role,
            approved: true,
          })
          .eq('id', authData.user.id);

        if (updateError) throw updateError;
      }

      const passwordHash = await hashPassword(temporaryPassword);

      const { error: tempPasswordError } = await supabase
        .from('temporary_passwords')
        .insert({
          user_id: authData.user.id,
          temp_password_hash: passwordHash,
          is_active: true,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });

      if (tempPasswordError) {
        console.error('Error storing temporary password:', tempPasswordError);
      }

      const { error: emailError } = await supabase.functions.invoke('send-temporary-password', {
        body: {
          to: email.trim(),
          name: fullName.trim(),
          temporaryPassword: temporaryPassword,
        },
      });

      if (emailError) {
        console.error('Error sending email:', emailError);
        setSuccess(`User created successfully! However, the email failed to send. Please share this temporary password manually: ${temporaryPassword}`);
      } else {
        setSuccess(`User created successfully! A temporary password has been sent to ${email}`);
      }

      setEmail('');
      setFullName('');
      setRole('collector');

    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const hashPassword = async (password: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <UserPlus className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Create New User</h1>
              <p className="text-gray-600">Add a new user to the system with automatic approval</p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-green-800 font-medium">Success</p>
                <p className="text-green-700 text-sm">{success}</p>
                {generatedPassword && (
                  <div className="mt-3 p-3 bg-white border border-green-300 rounded">
                    <p className="text-xs text-gray-600 mb-1 font-medium">Temporary Password (save this):</p>
                    <code className="text-sm font-mono text-gray-900 bg-gray-100 px-2 py-1 rounded">{generatedPassword}</code>
                  </div>
                )}
              </div>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Address
                </div>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Full Name
                </div>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="John Doe"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Role
                </div>
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'collector' | 'secretary' | 'admin')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
                disabled={loading}
              >
                <option value="collector">Collector</option>
                <option value="secretary">Secretary</option>
                <option value="admin">Admin</option>
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {role === 'collector' && 'Can view and manage assigned customers and invoices'}
                {role === 'secretary' && 'Can view all data and manage customer information'}
                {role === 'admin' && 'Full access to all system features and settings'}
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">What happens next?</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• A secure temporary password will be generated automatically</li>
                <li>• The user will receive an email with their temporary password</li>
                <li>• They must use this password to log in for the first time</li>
                <li>• They will be required to set their own permanent password</li>
                <li>• The temporary password expires in 7 days</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium"
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Creating User...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    Create User
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}