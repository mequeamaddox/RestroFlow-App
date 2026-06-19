import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  try {
    const token = await (window as any).Clerk?.session?.getToken();
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
  const headers = {
    ...authHeaders,
    ...(data ? { "Content-Type": "application/json" } : {}),
  };
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

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
      if (url.includes('/api/inventory') || url.includes('/api/dashboard') || url.includes('/api/waste') || url.includes('/api/hr/') || url.includes('/api/pos/') || url.includes('/api/variance') || url.includes('/api/analytics') || url.includes('/api/activities') || url.includes('/api/categories') || url.includes('/api/vendors')) {
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
    const res = await fetch(url, {
      headers: authHeaders,
      credentials: "include",
      cache: url.includes('/api/auth/me') ? 'no-store' : 'default',
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
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
