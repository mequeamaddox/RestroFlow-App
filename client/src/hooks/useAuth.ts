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

  const fetchUserData = async () => {
    if (!clerkUser) return null;
    try {
      const token = await getToken();
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

      // /api/auth/me failed — do not assume any role. Treat as unauthenticated.
      console.warn('useAuth: /api/auth/me returned non-ok response; clearing user session');
      setUser(null);
      return null;
    } catch (error) {
      console.error('useAuth: failed to fetch user data:', error);
      // Network/server error — do not assume any role.
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
    const result = await fetchUserData();
    return result;
  };

  return {
    user,
    isLoading: !isLoaded || isLoading,
    isAuthenticated: isLoaded && isSignedIn && !!user,
    isInitialized: isLoaded,
    checkAuth: async () => !!user,
    refreshAuth,
  };
}
