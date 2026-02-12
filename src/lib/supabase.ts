import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'supabase-auth-token',
    storage: {
      getItem: (key) => {
        try {
          return localStorage.getItem(key);
        } catch (error) {
          console.warn('Error reading from localStorage:', error);
          return null;
        }
      },
      setItem: (key, value) => {
        try {
          localStorage.setItem(key, value);
        } catch (error) {
          console.warn('Error writing to localStorage:', error);
        }
      },
      removeItem: (key) => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn('Error removing from localStorage:', error);
        }
      },
    },
  },
  global: {
    headers: {
      'X-Client-Info': 'supabase-js-web',
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    // Disable realtime to reduce connection overhead
    params: {
      eventsPerSecond: 2,
    },
  },
});

export type UserProfile = {
  id: string;
  email: string;
  role: 'customer' | 'admin' | 'manager' | 'collector' | 'viewer' | 'developer' | 'secretary';
  full_name?: string;
  assigned_color?: string;
  can_be_assigned_as_collector?: boolean;
  created_at: string;
  updated_at: string;
};

// Timeout wrapper for database queries
export const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number = 10000,
  errorMessage: string = 'Operation timed out'
): Promise<T> => {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
};

// Retry wrapper with exponential backoff
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> => {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Check if it's a network-related error
      const isNetworkError =
        error?.message?.includes('fetch') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('network') ||
        error?.code === 'PGRST301';

      // Don't retry if it's not a network error
      if (!isNetworkError) {
        throw error;
      }

      // Don't wait after the last attempt
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

export const logActivity = async (
  actionType: string,
  entityType?: string | null,
  entityId?: string | null,
  details?: any
) => {
  try {
    const { data: { user } } = await withTimeout(
      supabase.auth.getUser(),
      5000,
      'Auth check timed out'
    );

    if (!user) return;

    await withTimeout(
      supabase.from('user_activity_logs').insert({
        user_id: user.id,
        action_type: actionType,
        entity_type: entityType,
        entity_id: entityId,
        details: details || {}
      }),
      5000,
      'Activity log insert timed out'
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};
