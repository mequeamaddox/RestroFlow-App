type GetTokenFn = () => Promise<string | null>;
let _getToken: GetTokenFn | null = null;

export function setTokenProvider(fn: GetTokenFn | null) {
  _getToken = fn;
}

export async function getAuthToken(): Promise<string | null> {
  return _getToken?.() ?? null;
}
