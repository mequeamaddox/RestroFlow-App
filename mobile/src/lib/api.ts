import { getAuthToken } from './tokenStore';

export const API_BASE = 'https://www.restroflowsolutions.com';

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
  return res.json() as Promise<T>;
}
