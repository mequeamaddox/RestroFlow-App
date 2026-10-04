import { useAuth } from '@clerk/clerk-expo';
import { useEffect } from 'react';
import { setTokenProvider } from '../lib/tokenStore';

export function TokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenProvider(getToken);
  }, [getToken]);
  return null;
}
