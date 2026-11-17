import {
  clearCachedGoogleAccessToken,
  getCachedGoogleAccessToken,
} from './firebaseAuth.ts';

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// Strict in-memory fallback only (never localStorage/sessionStorage) so cross-origin
// preview iframes with blocked third-party cookies still remain authenticated for the active tab.
let inMemorySessionToken: string | null = null;
let inMemoryCsrfToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setInMemoryAuthTokens(sessionToken?: string | null, csrfToken?: string | null) {
  inMemorySessionToken = sessionToken || null;
  inMemoryCsrfToken = csrfToken || null;
}

export function clearInMemoryAuthTokens() {
  inMemorySessionToken = null;
  inMemoryCsrfToken = null;
  clearCachedGoogleAccessToken();
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (inMemorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }

  const googleAccessToken = getCachedGoogleAccessToken();
  if (googleAccessToken && !headers.has('X-Google-Access-Token')) {
    headers.set('X-Google-Access-Token', googleAccessToken);
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    const csrf = getCookie('lvbms_csrf') || inMemoryCsrfToken;
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    if (
      res.status === 401 &&
      !path.startsWith('/api/auth/google') &&
      !path.startsWith('/api/auth/preview-session') &&
      !path.startsWith('/api/auth/config')
    ) {
      unauthorizedHandler?.();
    }
    const msg =
      typeof data === 'object' && data && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Permintaan gagal (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  return data as T;
}

export async function uploadAssetFile(file: File): Promise<{ url: string }> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });

  return apiRequest<{ url: string }>('/api/uploads', {
    method: 'POST',
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type,
      base64Data,
    }),
  });
}
