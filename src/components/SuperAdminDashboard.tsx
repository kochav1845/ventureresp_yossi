import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Plus, Users, Check, X, Shield, Trash2 } from 'lucide-react';
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

interface OrgAdmin {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  organization_id: string;
}

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [admins, setAdmins] = useState<OrgAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!profile?.is_super_admin) {
      navigate('/', { replace: true });
      return;
    }
    loadData();
  }, [profile, navigate]);

  const loadData = async () => {
    setLoading(true);

    const { data: orgs } = await supabase
      .from('organizations')
      .select('*')
      .order('name');

    if (orgs) {
      // Get user counts per org
      const { data: users } = await supabase
        .from('user_profiles')
        .select('organization_id');

      const counts = new Map<string, number>();
      users?.forEach(u => {
        if (u.organization_id) {
          counts.set(u.organization_id, (counts.get(u.organization_id) || 0) + 1);
        }
      });

      setOrganizations(orgs.map(o => ({ ...o, user_count: counts.get(o.id) || 0 })));
    }

    // Load all admins
    const { data: adminData } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role, organization_id')
      .eq('role', 'admin');

    setAdmins(adminData || []);
    setLoading(false);
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
      if (createError.message.includes('duplicate') || createError.message.includes('unique')) {
        setError('An organization with this slug already exists');
      } else {
        setError(createError.message);
      }
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
    await supabase
      .from('organizations')
      .update({ is_active: !org.is_active })
      .eq('id', org.id);
    await loadData();
  };

  if (!profile?.is_super_admin) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="w-6 h-6 text-amber-400" />
              Super Admin
            </h1>
            <p className="text-slate-400 text-sm">Manage organizations and their administrators</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            {/* Organizations */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 mb-6">
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
                          org.is_active
                            ? 'text-red-400 hover:bg-red-500/20'
                            : 'text-green-400 hover:bg-green-500/20'
                        }`}
                        title={org.is_active ? 'Disable organization' : 'Enable organization'}
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

            {/* Admins */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-5">
                <Users className="w-5 h-5 text-emerald-400" />
                Organization Admins
              </h2>
              <div className="space-y-2">
                {admins.map(admin => {
                  const org = organizations.find(o => o.id === admin.organization_id);
                  return (
                    <div key={admin.id} className="flex items-center justify-between px-4 py-3 bg-slate-700/20 border border-slate-600/20 rounded-lg">
                      <div>
                        <p className="text-white text-sm font-medium">{admin.full_name || admin.email}</p>
                        <p className="text-slate-400 text-xs">{admin.email}</p>
                      </div>
                      <span className="px-2 py-0.5 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-full">
                        {org?.name || 'Unassigned'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
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
