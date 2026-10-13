import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, UserPlus, Mail, User, Shield, Loader, CheckCircle, XCircle,
  KeyRound, Copy, Check, RefreshCw,
} from 'lucide-react';

interface AdminCreateUserProps {
  onBack?: () => void;
}

const ROLES: Array<{ value: string; label: string; blurb: string }> = [
  { value: 'collector', label: 'Collector', blurb: 'Works assigned customers, invoices and tickets.' },
  { value: 'manager',   label: 'Manager',   blurb: 'Everything a collector can do, plus managing assignments.' },
  { value: 'secretary', label: 'Secretary', blurb: 'Can view all data and maintain customer information.' },
  { value: 'viewer',    label: 'Viewer',    blurb: 'Read-only access.' },
  { value: 'admin',     label: 'Admin',     blurb: 'Full access, including settings and the admin pages.' },
];

/** Readable at a glance — no look-alike characters. */
function generatePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const all = upper + lower + digits + symbols;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length];

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < 14) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Create a user straight from the management screens — the account is ready to
 * use immediately and the person never goes through a sign-up or confirmation
 * step of their own. They just log in with the credentials shown here.
 *
 * All the work happens in the admin-create-user edge function. It must NOT be
 * done with supabase.auth.signUp() from the browser: this project has
 * mailer_autoconfirm on, so signUp returns a session and would silently sign
 * the admin out and into the account they just made.
 */
export default function AdminCreateUser({ onBack }: AdminCreateUserProps) {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const handleBack = onBack || (() => navigate(-1));

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('collector');
  const [password, setPassword] = useState(() => generatePassword());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ email: string; password: string; role: string } | null>(null);
  const [copied, setCopied] = useState<'email' | 'password' | 'both' | null>(null);

  const copy = async (text: string, which: 'email' | 'password' | 'both') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked — the values are on screen to read anyway */
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !fullName.trim()) {
      setError('Email and full name are required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          password,
        },
      });

      // A non-2xx from the function arrives as FunctionsHttpError, whose useful
      // message is in the response body rather than fnError.message.
      if (fnError) {
        let detail = fnError.message;
        try {
          const body = await (fnError as any).context?.json?.();
          if (body?.error) detail = body.error;
        } catch { /* keep the generic message */ }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      setCreated({ email: data.email, password: data.password, role: data.role });
      setEmail('');
      setFullName('');
      setRole('collector');
      setPassword(generatePassword());
    } catch (err: any) {
      console.error('Error creating user:', err);
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-6">
        <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-100 rounded-lg">
              <UserPlus className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Add a User</h1>
              <p className="text-gray-600">
                The account is ready straight away — they sign in with the password you set here.
                No sign-up or email confirmation on their side.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-red-800 font-medium">Could not create the user</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {created && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-green-900 font-medium">
                    {created.email} can sign in now as {created.role}
                  </p>
                  <p className="text-green-700 text-sm mb-3">
                    Hand them these credentials. This password is shown once — copy it before
                    leaving the page.
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-white border border-green-300 rounded px-3 py-2">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0">Email</span>
                      <code className="flex-1 text-sm font-mono text-gray-900 truncate">{created.email}</code>
                      <button type="button" onClick={() => copy(created.email, 'email')}
                        className="p-1 text-gray-500 hover:text-gray-800" title="Copy email">
                        {copied === 'email' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <div className="flex items-center gap-2 bg-white border border-green-300 rounded px-3 py-2">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0">Password</span>
                      <code className="flex-1 text-sm font-mono text-gray-900 truncate">{created.password}</code>
                      <button type="button" onClick={() => copy(created.password, 'password')}
                        className="p-1 text-gray-500 hover:text-gray-800" title="Copy password">
                        {copied === 'password' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => copy(`Email: ${created.email}\nPassword: ${created.password}`, 'both')}
                    className="mt-2 text-xs text-green-800 hover:text-green-900 font-medium flex items-center gap-1"
                  >
                    {copied === 'both' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    Copy both
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleCreateUser} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2"><Mail className="w-4 h-4" /> Email Address</span>
              </label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@ventureresp.com" required disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2"><User className="w-4 h-4" /> Full Name</span>
              </label>
              <input
                type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                placeholder="Yossi Gold" required disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2"><KeyRound className="w-4 h-4" /> Password</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                  minLength={8} required disabled={loading}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button" onClick={() => setPassword(generatePassword())} disabled={loading}
                  title="Generate a new password"
                  className="px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">
                Shown in plain text on purpose — you need to pass it on. Edit it or generate another.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <span className="flex items-center gap-2"><Shield className="w-4 h-4" /> Role</span>
              </label>
              <select
                value={role} onChange={(e) => setRole(e.target.value)} required disabled={loading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <p className="mt-2 text-sm text-gray-500">
                {ROLES.find(r => r.value === role)?.blurb}
              </p>
              {['collector', 'manager', 'admin'].includes(role) && (
                <p className="mt-1 text-xs text-teal-700">
                  Can be assigned tickets — appears in the Assign to Collector list.
                </p>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-medium text-blue-900 mb-2">What happens</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• The account is created already confirmed — no email, no verification link.</li>
                <li>• It joins <strong>your</strong> organization{profile?.organization_id ? '' : ' (your profile has none set — this will fail)'}.</li>
                <li>• They go to the normal sign-in page and use the email and password above.</li>
                <li>• They can change their password afterwards from the usual reset flow.</li>
              </ul>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit" disabled={loading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 font-medium"
              >
                {loading
                  ? <><Loader className="w-5 h-5 animate-spin" /> Creating…</>
                  : <><UserPlus className="w-5 h-5" /> Create User</>}
              </button>
              <button
                type="button" onClick={handleBack} disabled={loading}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 font-medium"
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
