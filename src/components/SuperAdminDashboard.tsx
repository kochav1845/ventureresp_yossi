import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Plus, Users, Check, X, Shield, Mail, Clock, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Organization {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
  user_count?: number;
}

interface InterestRequest {
  id: string;
  name: string;
  email: string;
  company: string;
  message: string | null;
  status: string;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { user, profile, signIn, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [interestRequests, setInterestRequests] = useState<InterestRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'requests' | 'organizations'>('requests');

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    if (user && profile) {
      if (!profile.is_super_admin) {
        navigate('/', { replace: true });
        return;
      }
      loadData();
    }
  }, [user, profile, navigate]);

  const loadData = async () => {
    setLoading(true);

    const [orgsResult, requestsResult, usersResult] = await Promise.all([
      supabase.from('organizations').select('*').order('name'),
      supabase.from('interest_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('organization_id'),
    ]);

    if (orgsResult.data) {
      const counts = new Map<string, number>();
      usersResult.data?.forEach(u => {
        if (u.organization_id) {
          counts.set(u.organization_id, (counts.get(u.organization_id) || 0) + 1);
        }
      });
      setOrganizations(orgsResult.data.map(o => ({ ...o, user_count: counts.get(o.id) || 0 })));
    }

    setInterestRequests(requestsResult.data || []);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    if (error) {
      setLoginError(error.message);
    }
    setLoginLoading(false);
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgSlug.trim()) {
      setError('Both name and slug are required');
      return;
    }
    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(newOrgSlug)) {
      setError('Slug must be lowercase letters, numbers, and hyphens only');
      return;
    }
    setCreating(true);
    setError('');

    const { error: createError } = await supabase
      .from('organizations')
      .insert({
        slug: newOrgSlug.trim(),
        name: newOrgName.trim(),
        created_by: profile?.id,
        is_active: true
      });

    if (createError) {
      setError(createError.message.includes('duplicate') ? 'An organization with this slug already exists' : createError.message);
      setCreating(false);
      return;
    }

    setShowCreateModal(false);
    setNewOrgName('');
    setNewOrgSlug('');
    setCreating(false);
    await loadData();
  };

  const toggleOrgActive = async (org: Organization) => {
    await supabase.from('organizations').update({ is_active: !org.is_active }).eq('id', org.id);
    await loadData();
  };

  const handleRequestAction = async (request: InterestRequest, action: 'approved' | 'declined') => {
    await supabase
      .from('interest_requests')
      .update({ status: action, reviewed_by: profile?.id, reviewed_at: new Date().toISOString() })
      .eq('id', request.id);
    await loadData();
  };

  // Show login if not authenticated
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 mb-4">
              <Shield className="w-6 h-6 text-amber-400" />
            </div>
            <h1 className="text-xl font-bold text-white">Developer Access</h1>
            <p className="text-slate-400 text-sm mt-1">Sign in to manage the platform</p>
          </div>
          <form onSubmit={handleLogin} className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                placeholder="admin@example.com"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                placeholder="Enter password"
              />
            </div>
            {loginError && (
              <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loginLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!profile.is_super_admin) return null;

  const pendingRequests = interestRequests.filter(r => r.status === 'pending');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <Shield className="w-6 h-6 text-amber-400" />
                Developer Panel
              </h1>
              <p className="text-slate-400 text-sm">Manage organizations and account requests</p>
            </div>
          </div>
          {pendingRequests.length > 0 && (
            <span className="px-3 py-1 text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full">
              {pendingRequests.length} pending request{pendingRequests.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'requests' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Mail className="w-4 h-4" />
            Requests
            {pendingRequests.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-amber-500/30 text-amber-300 rounded-full">{pendingRequests.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('organizations')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === 'organizations' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Organizations
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* Interest Requests Tab */}
            {activeTab === 'requests' && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-5">
                  <Mail className="w-5 h-5 text-blue-400" />
                  Account Requests ({interestRequests.length})
                </h2>
                {interestRequests.length === 0 ? (
                  <p className="text-slate-400 text-center py-8">No requests yet</p>
                ) : (
                  <div className="space-y-3">
                    {interestRequests.map(req => (
                      <div
                        key={req.id}
                        className={`px-5 py-4 rounded-xl border ${
                          req.status === 'pending'
                            ? 'bg-slate-700/30 border-amber-500/20'
                            : req.status === 'approved'
                            ? 'bg-slate-700/20 border-green-500/20 opacity-70'
                            : 'bg-slate-700/20 border-red-500/20 opacity-70'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-white font-medium text-sm">{req.name}</p>
                              {req.status === 'pending' && (
                                <span className="px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full flex items-center gap-1">
                                  <Clock className="w-3 h-3" /> Pending
                                </span>
                              )}
                              {req.status === 'approved' && (
                                <span className="px-1.5 py-0.5 text-xs bg-green-500/20 text-green-400 border border-green-500/30 rounded-full flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3" /> Approved
                                </span>
                              )}
                              {req.status === 'declined' && (
                                <span className="px-1.5 py-0.5 text-xs bg-red-500/20 text-red-400 border border-red-500/30 rounded-full flex items-center gap-1">
                                  <XCircle className="w-3 h-3" /> Declined
                                </span>
                              )}
                            </div>
                            <p className="text-slate-400 text-xs">{req.email}</p>
                            <p className="text-slate-500 text-xs mt-0.5">Company: {req.company}</p>
                            {req.message && <p className="text-slate-400 text-xs mt-2 italic">"{req.message}"</p>}
                            <p className="text-slate-600 text-xs mt-2">{new Date(req.created_at).toLocaleDateString()}</p>
                          </div>
                          {req.status === 'pending' && (
                            <div className="flex items-center gap-2 ml-4">
                              <button
                                onClick={() => handleRequestAction(req, 'approved')}
                                className="p-2 text-green-400 hover:bg-green-500/20 rounded-lg transition-colors"
                                title="Approve"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleRequestAction(req, 'declined')}
                                className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                                title="Decline"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Organizations Tab */}
            {activeTab === 'organizations' && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-400" />
                    Organizations ({organizations.length})
                  </h2>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Organization
                  </button>
                </div>

                <div className="space-y-3">
                  {organizations.map(org => (
                    <div
                      key={org.id}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl border transition-colors ${
                        org.is_active
                          ? 'bg-slate-700/30 border-slate-600/40'
                          : 'bg-slate-800/50 border-slate-700/30 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          org.is_active ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-700/50 border border-slate-600/30'
                        }`}>
                          <Building2 className={`w-5 h-5 ${org.is_active ? 'text-blue-400' : 'text-slate-500'}`} />
                        </div>
                        <div>
                          <p className="text-white font-medium">{org.name}</p>
                          <p className="text-slate-400 text-sm">/{org.slug}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                          <Users className="w-4 h-4" />
                          {org.user_count}
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          org.is_active
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                          {org.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <button
                          onClick={() => toggleOrgActive(org)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            org.is_active ? 'text-red-400 hover:bg-red-500/20' : 'text-green-400 hover:bg-green-500/20'
                          }`}
                          title={org.is_active ? 'Disable' : 'Enable'}
                        >
                          {org.is_active ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => navigate(`/${org.slug}`)}
                          className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/50 rounded-lg transition-colors"
                        >
                          View
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Create Org Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-md p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Create New Organization</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5">Organization Name</label>
                  <input
                    type="text"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="e.g. Quality Financial Services"
                    className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1.5">URL Slug</label>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-sm">/</span>
                    <input
                      type="text"
                      value={newOrgSlug}
                      onChange={(e) => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="e.g. qfs"
                      className="w-full px-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Lowercase letters, numbers, and hyphens only</p>
                </div>
                {error && (
                  <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => { setShowCreateModal(false); setError(''); setNewOrgName(''); setNewOrgSlug(''); }}
                  className="px-4 py-2 text-slate-300 hover:text-white text-sm rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateOrg}
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Create Organization'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
