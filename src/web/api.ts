export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    /** The server's own explanation, when it sends one (e.g. why a test notification failed). */
    public detail?: string,
    /** The cap that was hit, for `limit_reached`. */
    public limit?: number,
  ) {
    super(code);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  // The demo build answers from an in-browser backend; this branch is dropped from the normal build.
  if (import.meta.env.VITE_DEMO === '1') {
    const { demo } = await import('./demo');
    return (await demo.handle(method, path, body instanceof FormData ? undefined : body)) as T;
  }
  const form = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined || form ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    credentials: 'same-origin',
  });
  // Credential checks on /auth/* answer 401 themselves; every other 401 means the session is gone.
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.assign(`/login?next=${next}`);
    throw new ApiError(401, 'unauthorized');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string; limit?: number } | null;
    throw new ApiError(res.status, data?.error ?? 'unknown', data?.message, data?.limit);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form),
};

export type AuthState = { setupRequired: boolean; user: { id: number; username: string } | null };

const AUTH_CHANGED = 'coinio:auth-changed';
/** Tells the app to fetch the signed-in user again (after a name change, say) without reloading the page. */
export const refreshAuth = () => window.dispatchEvent(new Event(AUTH_CHANGED));
export const onAuthChanged = (fn: () => void) => {
  window.addEventListener(AUTH_CHANGED, fn);
  return () => window.removeEventListener(AUTH_CHANGED, fn);
};
