// API client. THE access token lives here, in a module-scoped variable —
// deliberately NOT in localStorage/sessionStorage (XSS can read those; it
// cannot enumerate a closure variable). Page reloads lose it, and the silent
// refresh (httpOnly cookie) transparently gets a new one.
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
}

export function clearAccessToken() {
  accessToken = null;
}

async function rawRequest(path, { method = 'GET', body } = {}) {
  const options = { method, headers: {}, credentials: 'include' };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`/api/v1${path}`, options);
}

// De-duplicated silent refresh: many 401s at once trigger ONE refresh call
// (important because refresh tokens are single-use — parallel refreshes would
// look like token theft to the server).
let refreshInFlight = null;
export async function tryRefresh() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) return null;
        const data = await res.json();
        accessToken = data.accessToken;
        return data;
      } catch {
        return null;
      } finally {
        // Allow the next refresh AFTER this promise settles for all awaiters.
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function api(path, options = {}, allowRetry = true) {
  let res = await rawRequest(path, options);

  // Expired access token mid-session: refresh once, replay the request.
  if (res.status === 401 && allowRetry && accessToken) {
    const refreshed = await tryRefresh();
    if (refreshed) return api(path, options, false);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || 'Something went wrong', res.status, data.details);
  }
  return data;
}

// Public runtime config (reCAPTCHA site key, which OAuth providers exist).
let configCache = null;
export async function getPublicConfig() {
  if (!configCache) {
    configCache = api('/auth/config').catch(() => ({ recaptchaSiteKey: '', googleEnabled: false }));
  }
  return configCache;
}
