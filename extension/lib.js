// Shared helpers for extension pages and the service worker.

export const DEFAULT_SERVER = 'http://localhost:8787';

export async function getSettings() {
  const s = await chrome.storage.local.get(['server', 'token', 'customDomains', 'allowDomains']);
  return {
    server: s.server || DEFAULT_SERVER,
    token: s.token || null,
    customDomains: s.customDomains || [],
    allowDomains: s.allowDomains || [],
  };
}

export async function api(path, { method = 'GET', body } = {}) {
  const { server, token } = await getSettings();
  const res = await fetch(server + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Opens the web dashboard already signed in (token goes in the URL hash, which is never sent to the server). */
export async function openDashboard() {
  const { server, token } = await getSettings();
  chrome.tabs.create({ url: `${server}/${token ? `#token=${token}` : ''}` });
}

export const money = (cents) => `$${(cents / 100).toFixed(2)}`;

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
