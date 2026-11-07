import { getSettings, api } from './lib.js';
import { SEED_DOMAINS, KEYWORDS } from './blocklist.js';

// Porn-only hosts list maintained by StevenBlack.
const REMOTE_LIST = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts';

let blocked = new Set(SEED_DOMAINS);

async function loadBlocklist() {
  const { remoteDomains = [] } = await chrome.storage.local.get('remoteDomains');
  const { customDomains, allowDomains } = await getSettings();
  blocked = new Set([...SEED_DOMAINS, ...remoteDomains, ...customDomains]);
  for (const d of allowDomains) blocked.delete(d);
}

async function refreshRemoteList() {
  try {
    const text = await (await fetch(REMOTE_LIST)).text();
    const domains = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^0\.0\.0\.0\s+([^\s#]+)/);
      if (m && m[1] !== '0.0.0.0') domains.push(m[1].toLowerCase());
    }
    await chrome.storage.local.set({ remoteDomains: domains, remoteFetchedAt: Date.now() });
    await loadBlocklist();
  } catch (e) {
    console.warn('Blocklist refresh failed', e);
  }
}

function isBlocked(hostname) {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (blocked.has(parts.slice(i).join('.'))) return true;
  }
  return KEYWORDS.some((k) => host.includes(k));
}

chrome.webNavigation.onBeforeNavigate.addListener(({ tabId, frameId, url }) => {
  if (frameId !== 0) return;
  let u;
  try { u = new URL(url); } catch { return; }
  if (!/^https?:$/.test(u.protocol) || !isBlocked(u.hostname)) return;
  const target = chrome.runtime.getURL(`block.html?domain=${encodeURIComponent(u.hostname)}`);
  chrome.tabs.update(tabId, { url: target });
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.customDomains || changes.allowDomains) loadBlocklist();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await refreshRemoteList();
  chrome.alarms.create('refresh-list', { periodInMinutes: 60 * 24 });
  chrome.alarms.create('heartbeat', { periodInMinutes: 60 });
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(loadBlocklist);

chrome.alarms.onAlarm.addListener(async ({ name }) => {
  if (name === 'refresh-list') return refreshRemoteList();
  if (name === 'heartbeat') {
    const { token } = await getSettings();
    if (token) api('/api/heartbeat', { method: 'POST' }).catch(() => {});
  }
});

loadBlocklist();
