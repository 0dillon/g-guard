import { api, getSettings, money, esc, openDashboard } from './lib.js';

const $ = (id) => document.getElementById(id);
const msg = (id, text, ok = true) => { $(id).className = ok ? 'ok' : 'err'; $(id).textContent = text; };

async function init() {
  const s = await getSettings();
  $('server').value = s.server;
  $('custom').value = s.customDomains.join('\n');
  $('server').onchange = () => chrome.storage.local.set({ server: $('server').value.trim().replace(/\/$/, '') });
  if (s.token) await showAccount();
}

async function showAccount() {
  $('register').hidden = true;
  $('account').hidden = false;
  $('groups').hidden = false;
  const me = await api('/api/me');
  $('acctInfo').textContent =
    `${me.name}: ${me.currentStreak} day streak. Partner ${me.friendName} (${me.friendEmail}). ` +
    `Card ${me.cardSaved ? 'linked' : 'not linked'}. Paid so far ${money(me.penaltyCents)}.`;
  $('photoToggle').checked = me.photoEnabled;
  $('penaltyEdit').value = (me.penaltyPledgeCents / 100).toFixed(2);
  const groups = await api('/api/groups');
  $('groupList').innerHTML = groups.map((g) => `<li>${esc(g.name)}, code <b>${esc(g.code)}</b></li>`).join('');
}

$('registerBtn').onclick = async () => {
  try {
    await chrome.storage.local.set({ server: $('server').value.trim().replace(/\/$/, '') || undefined });
    const { token } = await api('/api/register', {
      method: 'POST',
      body: {
        name: $('name').value.trim(),
        email: $('email').value.trim(),
        friendName: $('friendName').value.trim(),
        friendEmail: $('friendEmail').value.trim(),
        penaltyCents: Math.round(Number($('penalty').value) * 100),
        photoEnabled: $('photo').checked,
      },
    });
    await chrome.storage.local.set({ token });
    await showAccount();
  } catch (e) { msg('regMsg', e.message, false); }
};

$('saveAcct').onclick = async () => {
  try {
    await api('/api/me', {
      method: 'PATCH',
      body: { photoEnabled: $('photoToggle').checked, penaltyCents: Math.round(Number($('penaltyEdit').value) * 100) },
    });
    msg('acctMsg', 'Saved.');
    await showAccount();
  } catch (e) { msg('acctMsg', e.message, false); }
};

$('photoToggle').onchange = async () => {
  // Ask for camera permission now so the block page doesn't stall on a prompt later.
  if ($('photoToggle').checked) {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ video: true });
      st.getTracks().forEach((t) => t.stop());
    } catch {
      $('photoToggle').checked = false;
      msg('acctMsg', 'Camera permission was denied.', false);
    }
  }
};

$('cardBtn').onclick = async () => {
  try {
    const { url } = await api('/api/billing/setup', { method: 'POST' });
    chrome.tabs.create({ url });
  } catch (e) { msg('acctMsg', e.message, false); }
};

$('webBtn').onclick = openDashboard;

$('createGroup').onclick = async () => {
  try {
    const g = await api('/api/groups', { method: 'POST', body: { name: $('groupName').value.trim() || 'My group' } });
    msg('groupMsg', `Created. Share code ${g.code} with friends.`);
    await showAccount();
  } catch (e) { msg('groupMsg', e.message, false); }
};

$('joinGroup').onclick = async () => {
  try {
    const g = await api('/api/groups/join', { method: 'POST', body: { code: $('groupCode').value.trim() } });
    msg('groupMsg', `Joined ${g.name}.`);
    await showAccount();
  } catch (e) { msg('groupMsg', e.message, false); }
};

$('saveCustom').onclick = async () => {
  const customDomains = $('custom').value.split('\n').map((d) => d.trim().toLowerCase()).filter(Boolean);
  await chrome.storage.local.set({ customDomains });
  $('customMsg').textContent = 'Saved.';
};

init();
