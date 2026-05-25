import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Organization {
  id: string;
  slug: string;
  name: string;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (user && profile && profile.organization_id) {
      // If logged in and belongs to an org, redirect there
      const loadUserOrg = async () => {
        const { data } = await supabase
          .from('organizations')
          .select('slug')
          .eq('id', profile.organization_id)
          .maybeSingle();
        if (data?.slug) {
          navigate(`/${data.slug}`, { replace: true });
        }
      };
      loadUserOrg();
    }
  }, [user, profile, navigate]);

  const loadOrganizations = async () => {
    const { data } = await supabase
      .from('organizations')
      .select('id, slug, name')
      .eq('is_active', true)
      .order('name');
    setOrganizations(data || []);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 mb-5">
            <Building2 className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Collections Portal</h1>
          <p className="text-slate-400">Select your organization to continue</p>
        </div>

        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 backdrop-blur-sm">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : organizations.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No organizations available</p>
          ) : (
            <div className="space-y-3">
              {organizations.map(org => (
                <button
                  key={org.id}
                  onClick={() => navigate(`/${org.slug}`)}
                  className="w-full flex items-center justify-between px-5 py-4 bg-slate-700/40 hover:bg-slate-700/70 border border-slate-600/30 hover:border-blue-500/40 rounded-xl transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-white font-medium">{org.name}</p>
                      <p className="text-slate-400 text-sm">/{org.slug}</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>

        {user && profile?.is_super_admin && (
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/super-admin')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm text-amber-400 hover:text-amber-300 border border-amber-500/30 hover:border-amber-500/50 rounded-lg transition-colors"
            >
              <Shield className="w-4 h-4" />
              Super Admin Panel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
