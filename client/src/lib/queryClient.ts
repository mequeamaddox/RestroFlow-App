import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  try {
    const session = (window as any).Clerk?.session;
    if (!session) return {};
    const token = forceRefresh
      ? await session.getToken({ skipCache: true })
      : await session.getToken();
    if (token) {
      return { 'Authorization': `Bearer ${token}` };
    }
  } catch (e) {
    // Clerk not ready yet
  }
  return {};
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const body = data !== undefined ? JSON.stringify(data) : undefined;
  const contentHeader: Record<string, string> = data !== undefined ? { "Content-Type": "application/json" } : {};

  const res = await fetch(url, {
    method,
    headers: { ...authHeaders, ...contentHeader },
    body,
    credentials: "include",
  });

  // On 401, force-refresh the Clerk token and retry once before propagating
  if (res.status === 401) {
    const freshHeaders = await getAuthHeaders(true);
    const retryRes = await fetch(url, {
      method,
      headers: { ...freshHeaders, ...contentHeader },
      body,
      credentials: "include",
    });
    await throwIfResNotOk(retryRes);
    return retryRes;
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    let url = queryKey[0] as string;
    
    // Handle location-specific queries
    if (queryKey.length > 1 && queryKey[1]) {
      const locationId = queryKey[1] as string;
      if (url.includes('/api/employees/me/') || url.includes('/api/inventory') || url.includes('/api/dashboard') || url.includes('/api/waste') || url.includes('/api/hr/') || url.includes('/api/pos/') || url.includes('/api/variance') || url.includes('/api/analytics') || url.includes('/api/activities') || url.includes('/api/categories') || url.includes('/api/vendors') || url.includes('/api/purchase-orders') || url.includes('/api/recipes') || url.includes('/api/menu-items') || url.includes('/api/invoices') || url.includes('/api/invitations')) {
        url += url.includes('?') ? `&locationId=${locationId}` : `?locationId=${locationId}`;
      }
    }
    
    // Handle date range parameters for variance reports
    if (url.includes('/api/variance/report') || url.includes('/api/variance/production')) {
      if (queryKey.length > 2 && queryKey[2]) {
        url += `&startDate=${encodeURIComponent(queryKey[2] as string)}`;
      }
      if (queryKey.length > 3 && queryKey[3]) {
        url += `&endDate=${encodeURIComponent(queryKey[3] as string)}`;
      }
    }

    const authHeaders = await getAuthHeaders();
    const fetchOpts = {
      headers: authHeaders,
      credentials: "include" as const,
      cache: url.includes('/api/auth/me') ? 'no-store' as const : 'default' as const,
    };
    const res = await fetch(url, fetchOpts);

    if (res.status === 401) {
      if (unauthorizedBehavior === "returnNull") return null;
      // Force-refresh Clerk token and retry once
      const freshHeaders = await getAuthHeaders(true);
      const retryRes = await fetch(url, { ...fetchOpts, headers: freshHeaders });
      await throwIfResNotOk(retryRes);
      return await retryRes.json();
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
