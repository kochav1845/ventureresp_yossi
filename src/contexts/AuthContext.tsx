import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode, useMemo } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { supabase, UserProfile, logActivity, withTimeout, withRetry } from '../lib/supabase';

const INACTIVITY_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours
const ACTIVITY_THROTTLE_MS = 60 * 1000; // Only update last-active once per minute
// Last activity in ANY tab of this browser. Each tab runs its own timer but only
// sees its own mouse/keys, so without this an idle tab logged out the tab you
// were working in.
const LAST_ACTIVITY_KEY = 'last_activity_at';

/*
 * Every sign-out here is scope 'local': it ends this browser's session only.
 * supabase-js defaults to 'global', which revokes the user's sessions on every
 * device and tab. Then an idle tab or a failed profile load in a new tab signed
 * you out everywhere, and the tab you were in kept working on its leftover
 * access token until anything that checks the session (edge functions: Delete
 * User) answered "Unauthorized". Seen live 2026-10-21: zero sessions left.
 */
const signOutHere = () => supabase.auth.signOut({ scope: 'local' });

const recordActivity = (at: number) => {
  try { localStorage.setItem(LAST_ACTIVITY_KEY, String(at)); } catch { /* storage blocked */ }
};

const lastActivityAnyTab = (own: number) => {
  let shared = 0;
  try { shared = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || 0; } catch { /* storage blocked */ }
  return Math.max(shared, own);
};

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isImpersonating: boolean;
  originalProfile: UserProfile | null;
  signIn: (email: string, password: string) => Promise<{ data: any; error: AuthError | null }>;
  signUp: (email: string, password: string, fullName?: string, orgSlug?: string) => Promise<{ data: any; error: AuthError | null }>;
  signOut: () => Promise<void>;
  impersonateUser: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  // Set when a session was signed out because the profile is not approved, so
  // the sign-in screen can say why instead of looking like a failed password.
  accountStatusMessage: string | null;
  clearAccountStatusMessage: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<UserProfile | null>(null);
  const [accountStatusMessage, setAccountStatusMessage] = useState<string | null>(null);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  // Which user id we've already loaded a profile for. Lets the auth-state handler
  // ignore the repeat SIGNED_IN / TOKEN_REFRESHED events supabase-js fires when a
  // tab regains focus, so those don't flip global `loading` and remount the app.
  const loadedProfileForUser = useRef<string | null>(null);

  const resetInactivityTimer = useCallback((delay: number = INACTIVITY_TIMEOUT_MS) => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(async () => {
      // Another tab may have been in use all along; wait out the rest if so.
      const idleFor = Date.now() - lastActivityAnyTab(lastActivityRef.current);
      if (idleFor < INACTIVITY_TIMEOUT_MS) {
        resetInactivityTimer(INACTIVITY_TIMEOUT_MS - idleFor);
        return;
      }
      const currentUser = await supabase.auth.getUser();
      if (currentUser.data.user) {
        try {
          await supabase.rpc('log_user_logout', { p_user_id: currentUser.data.user.id });
        } catch (_) {}
        localStorage.removeItem('impersonation');
        await signOutHere();
        setUser(null);
        setProfile(null);
        setIsImpersonating(false);
        setOriginalProfile(null);
        window.location.reload();
      }
    }, delay);
  }, []);

  useEffect(() => {
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActivityRef.current = now;
      recordActivity(now);
      resetInactivityTimer();
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'];
    events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

    recordActivity(lastActivityRef.current);
    resetInactivityTimer();

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [resetInactivityTimer]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session }, error } = await withRetry(
          () => withTimeout(
            supabase.auth.getSession(),
            30000,
            'Session check timed out'
          ),
          3,
          2000
        );

        if (error) {
          console.error('Session error:', error);
          await signOutHere();
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
      } catch (err: any) {
        console.error('Auth initialization error:', err);
        if (err?.message?.includes('timed out') || err?.message?.includes('fetch')) {
          setLoading(false);
        } else {
          await signOutHere();
          setLoading(false);
        }
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        try {
          // Supabase refreshes the token whenever a tab regains focus, firing
          // TOKEN_REFRESHED (and sometimes a repeat SIGNED_IN). These are NOT real
          // sign-in transitions — reacting to them (setLoading(true) + refetch)
          // unmounts the whole app and wipes every page's in-memory state (scroll,
          // filters, expanded rows). So only act on genuine transitions.
          if (event === 'SIGNED_OUT') {
            loadedProfileForUser.current = null;
            setUser(null);
            setProfile(null);
            setLoading(false);
            return;
          }
          // Token refresh / user metadata update: the supabase client already holds
          // the fresh session internally, so there's nothing the UI needs to do.
          if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            return;
          }
          // SIGNED_IN / INITIAL_SESSION
          if (session?.user) {
            const impersonationData = localStorage.getItem('impersonation');
            if (impersonationData) return; // handled by initAuth()
            // Already have this user's profile (e.g. focus re-emitted SIGNED_IN)?
            // Don't touch loading or refetch — that's what caused the tab-return
            // refresh.
            if (loadedProfileForUser.current === session.user.id) return;
            setLoading(true);
            setUser(session.user);
            await loadProfile(session.user.id);
          } else {
            loadedProfileForUser.current = null;
            setUser(null);
            setProfile(null);
            setLoading(false);
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
            30000,
            'Profile load timed out'
          ),
        3,
        2000
      );

      if (error) throw error;

      // The approval gate, client side. The server-side one is in
      // get_user_org_id(), which returns NULL for an unapproved profile so the
      // session reads nothing -- but without this the user would be left
      // staring at an app full of empty tables with no explanation.
      if (data && data.account_status && data.account_status !== 'approved') {
        loadedProfileForUser.current = null;
        await signOutHere();
        setUser(null);
        setProfile(null);
        setAccountStatusMessage(
          data.account_status === 'declined'
            ? 'Your account request was declined. Contact an administrator.'
            : 'Your account is awaiting administrator approval.'
        );
        return;
      }

      setProfile(data);
      loadedProfileForUser.current = userId;
    } catch (error: any) {
      console.error('Error loading profile:', error);

      // If we've exhausted retries, clear auth
      console.error('Failed to load profile. Clearing auth state.');
      loadedProfileForUser.current = null;
      await signOutHere();
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

    if (!error && data?.user) {
      setLoading(true);
      try {
        await supabase.rpc('log_user_login', { p_user_id: data.user.id });
      } catch (logError) {
        console.error('Failed to log login event:', logError);
      }
    }

    return { data, error };
  };

  const signUp = async (email: string, password: string, fullName?: string, orgSlug?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName || '',
          org_slug: orgSlug || '',
        },
      },
    });
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
    await signOutHere();
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
    stopImpersonation,
    accountStatusMessage,
    clearAccountStatusMessage: () => setAccountStatusMessage(null)
  }), [user, profile, loading, isImpersonating, originalProfile, accountStatusMessage]);

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
