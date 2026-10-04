import { useAuth } from '@clerk/clerk-expo';
import { useEffect, useState, type ReactNode } from 'react';
import { setTokenProvider } from '../lib/tokenStore';

export function TokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setTokenProvider(getToken);
    setReady(true);
    return () => setTokenProvider(null);
  }, [getToken]);
  return ready ? children : null;
}
