import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Mail, Lock, AlertCircle, Clock, CheckCircle, User, ArrowLeft, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { logActivity, supabase } from '../lib/supabase';

const CAROUSEL_IMAGES = [
  {
    url: 'https://images.pexels.com/photos/6129150/pexels-photo-6129150.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=1',
    label: 'Healthcare',
    caption: 'Medical professionals delivering exceptional patient care',
  },
  {
    url: 'https://images.pexels.com/photos/13890649/pexels-photo-13890649.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=1',
    label: 'Construction',
    caption: 'Building the infrastructure that shapes our world',
  },
  {
    url: 'https://images.pexels.com/photos/12902858/pexels-photo-12902858.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=1',
    label: 'Office & Administration',
    caption: 'Empowering teams with streamlined operations',
  },
  {
    url: 'https://images.pexels.com/photos/7731318/pexels-photo-7731318.jpeg?auto=compress&cs=tinysrgb&w=1920&h=1080&dpr=1',
    label: 'Insurance',
    caption: 'Protecting what matters most to your clients',
  },
];

function ImageCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fadeState, setFadeState] = useState<'visible' | 'fading'>('visible');

  const advanceSlide = useCallback(() => {
    setFadeState('fading');
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % CAROUSEL_IMAGES.length);
      setFadeState('visible');
    }, 1000);
  }, []);

  useEffect(() => {
    const interval = setInterval(advanceSlide, 6000);
    return () => clearInterval(interval);
  }, [advanceSlide]);

  const current = CAROUSEL_IMAGES[currentIndex];

  return (
    <div className="relative w-full h-full overflow-hidden bg-gray-900">
      {CAROUSEL_IMAGES.map((img, idx) => (
        <div
          key={idx}
          className="absolute inset-0 transition-opacity duration-1000 ease-in-out"
          style={{ opacity: idx === currentIndex ? (fadeState === 'visible' ? 1 : 0) : 0 }}
        >
          <img
            src={img.url}
            alt={img.label}
            className="w-full h-full object-cover"
          />
        </div>
      ))}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-black/40" />

      <div className="absolute top-8 left-8 right-8">
        <img
          src="https://ahmrghovmuxowchijumv.supabase.co/storage/v1/object/public/uploaded-images/-logoventure_1644182585__38264.webp"
          alt="Logo"
          className="h-14 w-auto drop-shadow-lg"
        />
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-8">
        <div
          className={`transition-opacity duration-700 ${fadeState === 'visible' ? 'opacity-100' : 'opacity-0'}`}
        >
          <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-sm text-white text-xs font-semibold uppercase tracking-wider rounded-full mb-3">
            {current.label}
          </span>
          <p className="text-white text-lg font-medium leading-relaxed max-w-md">
            {current.caption}
          </p>
        </div>

        <div className="flex gap-2 mt-6">
          {CAROUSEL_IMAGES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (idx !== currentIndex) {
                  setFadeState('fading');
                  setTimeout(() => {
                    setCurrentIndex(idx);
                    setFadeState('visible');
                  }, 500);
                }
              }}
              className={`h-1.5 rounded-full transition-all duration-500 ${
                idx === currentIndex
                  ? 'bg-white w-8'
                  : 'bg-white/40 w-4 hover:bg-white/60'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SignIn() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isSignUp, setIsSignUp] = useState(orgSlug === 'demo');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountStatus, setAccountStatus] = useState<'pending' | 'rejected' | 'approved' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const { signIn, signUp } = useAuth();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      // Build the reset link base on the same site + org path the user is on, so the
      // emailed link returns them here (e.g. https://stardevar.netlify.app/ventureresp/reset-password)
      // rather than a hardcoded domain.
      const firstSeg = window.location.pathname.split('/').filter(Boolean)[0] || '';
      const orgPrefix = firstSeg && firstSeg !== 'signin' && firstSeg !== 'reset-password' ? `/${firstSeg}` : '';
      const resetBase = `${window.location.origin}${orgPrefix}/reset-password`;

      const response = await fetch(`${supabaseUrl}/functions/v1/request-password-reset`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ email, resetBase }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to send reset email');
      } else {
        setResetEmailSent(true);
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setAccountStatus(null);
    setLoading(true);

    try {
      if (isSignUp) {
        if (orgSlug === 'demo') {
          // Demo org: create real user immediately
          const { error: signUpError } = await signUp(email, password, fullName, 'demo');
          if (signUpError) {
            setError(signUpError.message || 'Error creating account');
          } else {
            // Auto sign in after creating account
            const { error: signInError } = await signIn(email, password);
            if (signInError) {
              setError('Account created! Please sign in.');
              setIsSignUp(false);
            }
          }
        } else {
          const { data: existingPending } = await supabase
            .from('pending_users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

          if (existingPending) {
            setError('An account request with this email already exists. Please check your status or contact an administrator.');
            setLoading(false);
            return;
          }

          // Look up org id from slug
          let orgId: string | null = null;
          if (orgSlug) {
            const { data: orgData } = await supabase
              .from('organizations')
              .select('id')
              .eq('slug', orgSlug)
              .maybeSingle();
            orgId = orgData?.id || null;
          }

          const { error: insertError } = await supabase
            .from('pending_users')
            .insert({
              full_name: fullName,
              email: email,
              status: 'pending',
              organization_id: orgId
            });

          if (insertError) {
            setError(insertError.message || 'Error creating account request');
          } else {
            setAccountStatus('pending');
          }
        }
      } else {
        const { data: pendingUser } = await supabase
          .from('pending_users')
          .select('*')
          .eq('email', email)
          .maybeSingle();

        if (pendingUser) {
          if (pendingUser.status === 'pending') {
            setAccountStatus('pending');
            setLoading(false);
            return;
          } else if (pendingUser.status === 'declined') {
            setAccountStatus('rejected');
            setRejectionReason(pendingUser.declined_reason || 'No reason provided');
            setLoading(false);
            return;
          }
        }

        const { data, error } = await signIn(email, password);

        if (error) {
          setError(error.message);
        } else if (data.user) {
          await logActivity('user_signed_in', null, null, { email });
        }
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderFormContent = () => {
    if (resetEmailSent) {
      return (
        <div className="text-center">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h2>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            We've sent a password reset link to <span className="font-semibold text-gray-700">{email}</span>
          </p>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-700">
              Click the link in the email to reset your password. The link will expire after use.
            </p>
          </div>
          <button
            onClick={() => {
              setResetEmailSent(false);
              setIsForgotPassword(false);
              setEmail('');
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      );
    }

    if (accountStatus === 'pending') {
      return (
        <div className="text-center">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Pending Approval</h2>
          <p className="text-gray-500 mb-6 text-sm leading-relaxed">
            Your registration is being reviewed by an administrator.
          </p>
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
            <p className="text-sm text-amber-700">
              You will receive access once approved. This usually takes 1-2 business days.
            </p>
          </div>
          <button
            onClick={() => {
              setAccountStatus(null);
              setEmail('');
              setPassword('');
              setFullName('');
              setIsSignUp(false);
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      );
    }

    if (accountStatus === 'rejected') {
      return (
        <div className="text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Not Approved</h2>
          <p className="text-gray-500 mb-4 text-sm leading-relaxed">
            Your registration was not approved by the administrator.
          </p>
          {rejectionReason && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
              <p className="text-xs font-semibold text-red-800 mb-1">Reason:</p>
              <p className="text-sm text-red-700">{rejectionReason}</p>
            </div>
          )}
          <p className="text-xs text-gray-400 mb-6">
            If you believe this is an error, please contact your administrator.
          </p>
          <button
            onClick={() => {
              setAccountStatus(null);
              setRejectionReason('');
              setEmail('');
              setPassword('');
            }}
            className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
          >
            Back to Sign In
          </button>
        </div>
      );
    }

    if (isForgotPassword) {
      return (
        <>
          <button
            onClick={() => {
              setIsForgotPassword(false);
              setError('');
            }}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-700 text-sm font-medium mb-6 transition-colors"
          >
            <ArrowLeft size={15} />
            Back
          </button>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Reset Password</h2>
          <p className="text-gray-500 text-sm mb-6">
            Enter your email and we'll send a reset link.
          </p>

          {error && <ErrorMessage error={error} />}

          <form onSubmit={handleForgotPassword} className="space-y-5">
            <InputField
              label="Email Address"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              icon={<Mail size={18} />}
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        </>
      );
    }

    return (
      <>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          {isSignUp ? (orgSlug === 'demo' ? 'Please create an account.' : 'Create Account') : 'Welcome back'}
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          {isSignUp
            ? (orgSlug === 'demo' ? 'Create your free account to explore the system.' : 'Submit your details for admin approval.')
            : 'Sign in to your account to continue.'}
        </p>

        {error && <ErrorMessage error={error} />}

        <form onSubmit={handleSubmit} className="space-y-5">
          {isSignUp && (
            <InputField
              label="Full Name"
              type="text"
              value={fullName}
              onChange={setFullName}
              placeholder="John Doe"
              icon={<User size={18} />}
            />
          )}

          <InputField
            label="Email Address"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            icon={<Mail size={18} />}
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                  }}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
                placeholder="Enter your password"
                required
                minLength={6}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            {loading ? 'Please wait...' : isSignUp ? (orgSlug === 'demo' ? 'Create Account' : 'Request Account') : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError('');
            }}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            {isSignUp
              ? 'Already have an account? '
              : "Don't have an account? "}
            <span className="font-semibold text-blue-600 hover:text-blue-700">
              {isSignUp ? 'Sign in' : 'Sign up'}
            </span>
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Image Carousel */}
      <div className="hidden lg:block lg:w-1/2 xl:w-[55%]">
        <ImageCarousel />
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 xl:w-[45%] flex flex-col bg-white">
        {/* Mobile-only logo */}
        <div className="lg:hidden flex items-center justify-center py-6 border-b border-gray-100">
          <img
            src="https://ahmrghovmuxowchijumv.supabase.co/storage/v1/object/public/uploaded-images/-logoventure_1644182585__38264.webp"
            alt="Logo"
            className="h-12 w-auto"
          />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-12 sm:px-12 lg:px-16">
          <div className="w-full max-w-md">
            {renderFormContent()}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield size={12} />
            <span>Secure authentication</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InputField({
  label,
  type,
  value,
  onChange,
  placeholder,
  icon,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  icon: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
          {icon}
        </span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all text-sm"
          placeholder={placeholder}
          required
        />
      </div>
    </div>
  );
}

function ErrorMessage({ error }: { error: string }) {
  return (
    <div className="mb-5 p-3.5 bg-red-50 border border-red-100 rounded-xl">
      <div className="flex items-start gap-2.5">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
        <p className="text-red-700 text-sm">{error}</p>
      </div>
    </div>
  );
}
