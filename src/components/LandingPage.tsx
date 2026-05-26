import { useState } from 'react';
import { FileText, Send, CheckCircle, Mail, Lock, User, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LandingPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !company.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    setLoading(true);
    setError('');

    const { error: insertError } = await supabase
      .from('interest_requests')
      .insert({
        name: name.trim(),
        email: email.trim(),
        company: company.trim(),
        message: message.trim() || null,
      });

    if (insertError) {
      setError('Something went wrong. Please try again later.');
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-5">
            <FileText className="w-7 h-7 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3">Accounts Receivable System</h1>
          <p className="text-slate-400 text-sm leading-relaxed max-w-sm mx-auto">
            Welcome! If you already have an account, please use your organization's direct link to sign in.
            Otherwise, fill out the form below to request access.
          </p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm">
          {submitted ? (
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-500/20 border border-green-500/30 mb-4">
                <CheckCircle className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Request Submitted</h3>
              <p className="text-slate-400 text-sm">
                Thank you! We'll review your request and get back to you shortly.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-white font-semibold text-sm mb-1">Request an Account</h3>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full Name</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Smith"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Address</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@company.com"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">
                  <span className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Company Name</span>
                </label>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Message (optional)</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your needs..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none"
                />
              </div>

              {error && (
                <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {loading ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Already have an account? Use your organization's direct link to sign in.
        </p>
      </div>
    </div>
  );
}
