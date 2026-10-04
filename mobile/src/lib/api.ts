import { getAuthToken } from './tokenStore';

// Must match the custom domain attached to the Railway service (apex, no www).
export const API_BASE = 'https://restroflowsolutions.com';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `HTTP ${res.status}`);
  }
  // Unknown /api paths fall through to the web app's index.html with a 200.
  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(`Unexpected response from server for ${path.split('?')[0]}`);
  }
  return res.json() as Promise<T>;
}
