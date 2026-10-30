const baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export type RecordSummary = {
  id: string;
  title: string;
  category: string;
  institution: string;
  createdAt: string;
  status: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  createdAt: string;
  recordTitle: string | null;
  actorEmail: string | null;
};

export type ConsentRequest = {
  id: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  providerEmail: string;
  institution: string;
  recordIds: string[];
  categoryIds: string[];
};

export type ConsentPermission = {
  id: string;
  expiresAt: string;
  revokedAt: string | null;
  recordIds: string[];
  categoryIds: string[];
  providerEmail: string;
  institution: string;
};

export type Verification = {
  matched: boolean;
  institutionVerified: boolean;
  institution?: string;
  message: string;
  limitation: string;
};

let accessToken: string | null = sessionStorage.getItem('medledger_access');
let refreshToken: string | null = sessionStorage.getItem('medledger_refresh');
let refreshInFlight: Promise<boolean> | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  sessionStorage.setItem('medledger_access', access);
  sessionStorage.setItem('medledger_refresh', refresh);
}

function clearTokens() {
  accessToken = null;
  refreshToken = null;
  sessionStorage.removeItem('medledger_access');
  sessionStorage.removeItem('medledger_refresh');
}

async function renewAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        clearTokens();
        return false;
      }
      const tokens = await response.json() as { accessToken: string; refreshToken: string };
      setTokens(tokens.accessToken, tokens.refreshToken);
      return true;
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

export async function logout() {
  const tokenToRevoke = refreshToken;
  clearTokens();
  if (tokenToRevoke) {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: tokenToRevoke }),
    });
    if (!response.ok) throw new Error('Could not revoke the server session. Please try again.');
  }
}

export async function downloadRecord(id: string, title: string) {
  const headers = new Headers();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(`${baseUrl}/api/records/${id}/document`, { headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Download failed (${response.status}).`);
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}.bin`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function request<T>(path: string, init: RequestInit = {}, canRenew = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (!(init.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const isAuthEndpoint = path.includes('/api/auth/login') || path.includes('/api/auth/refresh') || path.includes('/api/auth/register');
  if (response.status === 401 && canRenew && !isAuthEndpoint && await renewAccessToken()) {
    return request<T>(path, init, false);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return request<{ user: { id: string; role: string }; accessToken: string; refreshToken: string }>(
    '/api/auth/login',
    { method: 'POST', body: JSON.stringify({ email, password }) },
  );
}

export function registerPatient(email: string, password: string, displayName: string) {
  return request<{ user: { id: string; role: string }; accessToken: string; refreshToken: string }>(
    '/api/auth/register',
    { method: 'POST', body: JSON.stringify({ email, password, displayName }) },
  );
}

export function fetchRecords() {
  return request<RecordSummary[]>('/api/records');
}

export function fetchActivity() {
  return request<AuditEvent[]>('/api/records/activity');
}

export function fetchConsentRequests() {
  return request<ConsentRequest[]>('/api/consent/requests');
}

export function fetchConsentPermissions() {
  return request<ConsentPermission[]>('/api/consent/permissions');
}

export function revokeConsentPermission(id: string) {
  return request<void>(`/api/consent/permissions/${id}/revoke`, { method: 'POST' });
}

export function respondToConsent(id: string, decision: 'approve' | 'reject') {
  return request<{ id: string; status: string }>(`/api/consent/requests/${id}/respond`, {
    method: 'POST',
    body: JSON.stringify({ decision }),
  });
}

export function verifyDocument(recordId: string, file: File) {
  const body = new FormData();
  body.set('recordId', recordId);
  body.set('document', file);
  return request<Verification>('/api/verify', { method: 'POST', body });
}
