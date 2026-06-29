import { useState, useEffect } from 'react';
import { useUser, useAuth as useClerkAuth } from '@clerk/clerk-react';

type User = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
};

export function useAuth() {
  const { user: clerkUser, isLoaded, isSignedIn } = useUser();
  const { getToken } = useClerkAuth();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // If Clerk hasn't reported isLoaded within 10s, stop blocking the UI
  const [clerkTimedOut, setClerkTimedOut] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!isLoaded) {
        console.warn('useAuth: Clerk did not load within 10s — check VITE_CLERK_PUBLISHABLE_KEY and that the staging domain is authorized in the Clerk dashboard.');
        setClerkTimedOut(true);
        setIsLoading(false);
      }
    }, 10000);
    return () => clearTimeout(t);
  }, []);

  const fetchUserData = async (attempt = 0): Promise<User | null> => {
    if (!clerkUser) return null;
    try {
      const token = await getToken();

      // getToken() can return null briefly after sign-in while Clerk finalises the session.
      // Retry up to twice before giving up.
      if (!token) {
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          return fetchUserData(attempt + 1);
        }
        console.warn('useAuth: getToken() returned null after retries; clearing session');
        setUser(null);
        return null;
      }

      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.user) {
          setUser(data.user);
          return data.user;
        }
      }

      // Retry on server errors (5xx) — don't retry on 401/403 (genuinely not authed).
      if (response.status >= 500 && attempt < 2) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchUserData(attempt + 1);
      }

      // /api/auth/me failed — do not assume any role. Treat as unauthenticated.
      console.warn('useAuth: /api/auth/me returned non-ok response; clearing user session');
      setUser(null);
      return null;
    } catch (error) {
      console.error('useAuth: failed to fetch user data:', error);
      // Network error — retry before giving up
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 1500));
        return fetchUserData(attempt + 1);
      }
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !clerkUser) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const init = async () => {
      setIsLoading(true);
      await fetchUserData();
      setIsLoading(false);
    };

    init();
  }, [isLoaded, isSignedIn, clerkUser?.id]);

  const refreshAuth = async () => {
    return fetchUserData(0);
  };

  return {
    user,
    isLoading: !clerkTimedOut && (!isLoaded || isLoading),
    isAuthenticated: isLoaded && isSignedIn && !!user,
    isInitialized: isLoaded,
    clerkTimedOut,
    checkAuth: async () => !!user,
    refreshAuth,
  };
}
