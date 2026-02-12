import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase, UserProfile, logActivity, withTimeout, withRetry } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isImpersonating: boolean;
  originalProfile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<{ data: any; error: AuthError | null }>;
  signUp: (email: string, password: string) => Promise<{ data: any; error: AuthError | null }>;
  signOut: () => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await withTimeout(
          supabase.auth.getSession(),
          10000,
          'Session check timed out'
        );

        if (error) {
          console.error('Session error:', error);
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        setUser(session?.user ?? null);
        if (session?.user) {
          const impersonationData = localStorage.getItem('impersonation');
          if (impersonationData) {
            try {
              const { impersonatedUserId, originalUserId } = JSON.parse(impersonationData);
              if (session.user.id === originalUserId) {
                // Fetch original profile directly
                const { data: originalProfileData } = await supabase
                  .from('user_profiles')
                  .select('*')
                  .eq('id', originalUserId)
                  .maybeSingle();

                setOriginalProfile(originalProfileData);

                // Fetch impersonated profile directly
                const { data: impersonatedProfileData } = await supabase
                  .from('user_profiles')
                  .select('*')
                  .eq('id', impersonatedUserId)
                  .maybeSingle();

                setProfile(impersonatedProfileData);
                setIsImpersonating(true);
                setLoading(false);
                return;
              } else {
                localStorage.removeItem('impersonation');
              }
            } catch (parseError) {
              console.error('Failed to parse impersonation data:', parseError);
              localStorage.removeItem('impersonation');
            }
          }
          await loadProfile(session.user.id);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Auth initialization error:', err);
        setLoading(false);
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        try {
          setUser(session?.user ?? null);
          if (session?.user) {
            // Check if we're in impersonation mode - if so, don't reload profile
            const impersonationData = localStorage.getItem('impersonation');
            if (!impersonationData) {
              // Not impersonating, load the actual user's profile
              await loadProfile(session.user.id);
            }
            // If impersonating, the profile is already set correctly, don't overwrite it
          } else {
            setProfile(null);
          }
        } catch (error) {
          console.error('Error in auth state change handler:', error);
          setLoading(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await withRetry(
        () =>
          withTimeout(
            supabase
              .from('user_profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle(),
            10000,
            'Profile load timed out'
          ),
        3,
        1000
      );

      if (error) throw error;
      setProfile(data);
    } catch (error: any) {
      console.error('Error loading profile:', error);

      // If we've exhausted retries, clear auth
      console.error('Failed to load profile. Clearing auth state.');
      await supabase.auth.signOut();
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const loadImpersonatedProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading impersonated profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const impersonateUser = async (userId: string) => {
    if (!user || !profile || profile.role !== 'admin') {
      throw new Error('Only admins can impersonate users');
    }

    try {
      setOriginalProfile(profile);

      const { data: targetProfile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!targetProfile) throw new Error('User not found');

      localStorage.setItem('impersonation', JSON.stringify({
        impersonatedUserId: userId,
        originalUserId: user.id
      }));

      setProfile(targetProfile);
      setIsImpersonating(true);

      await logActivity('user_impersonation_started', {
        impersonated_user_id: userId,
        impersonated_user_email: targetProfile.email
      });
    } catch (error) {
      console.error('Error impersonating user:', error);
      throw error;
    }
  };

  const stopImpersonation = async () => {
    if (!isImpersonating || !originalProfile) return;

    try {
      await logActivity('user_impersonation_stopped', {
        impersonated_user_id: profile?.id,
        impersonated_user_email: profile?.email
      });

      localStorage.removeItem('impersonation');
      setProfile(originalProfile);
      setOriginalProfile(null);
      setIsImpersonating(false);
    } catch (error) {
      console.error('Error stopping impersonation:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    // Log the login event if successful
    if (!error && data?.user) {
      try {
        await supabase.rpc('log_user_login', { p_user_id: data.user.id });
      } catch (logError) {
        console.error('Failed to log login event:', logError);
      }
    }

    return { data, error };
  };

  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  };

  const signOut = async () => {
    // Log the logout event
    if (user) {
      try {
        await supabase.rpc('log_user_logout', { p_user_id: user.id });
      } catch (logError) {
        console.error('Failed to log logout event:', logError);
      }
    }

    localStorage.removeItem('impersonation');
    await supabase.auth.signOut();
    setProfile(null);
    setIsImpersonating(false);
    setOriginalProfile(null);
  };

  const contextValue = useMemo(() => ({
    user,
    profile,
    loading,
    isImpersonating,
    originalProfile,
    signIn,
    signUp,
    signOut,
    impersonateUser,
    stopImpersonation
  }), [user, profile, loading, isImpersonating, originalProfile]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
