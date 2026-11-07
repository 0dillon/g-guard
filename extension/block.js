import { api, getSettings, money, esc } from './lib.js';

const domain = new URLSearchParams(location.search).get('domain') || 'unknown';
document.getElementById('domain').textContent = domain;
document.getElementById('away').onclick = () => (location.href = 'https://www.google.com');

const statusEl = document.getElementById('status');

/** Grabs one webcam frame as a JPEG. The block page has replaced the site, so only the user is in frame. */
async function snapshot() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
  try {
    const video = document.getElementById('video');
    video.srcObject = stream;
    await video.play();
    await new Promise((r) => setTimeout(r, 800)); // let exposure settle
    const canvas = document.getElementById('canvas');
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

async function run() {
  const { token } = await getSettings();
  if (!token) {
    statusEl.innerHTML = 'Blocked. <a href="options.html">Finish setup</a> to turn on streaks and alerts.';
    return;
  }

  let me;
  try { me = await api('/api/me'); } catch (e) {
    statusEl.innerHTML = `<span class="err">Couldn't reach the server: ${esc(e.message)}</span>`;
    return;
  }

  let photo;
  if (me.photoEnabled) {
    try { photo = await snapshot(); } catch { photo = undefined; } // camera denied or missing
  }

  try {
    const r = await api('/api/slip', { method: 'POST', body: { domain, photo } });
    const s = r.stats;
    if (r.duplicate) {
      statusEl.textContent = 'This attempt was already reported in the last 10 minutes.';
    } else {
      const charge = me.penaltyPledgeCents ? ` ${money(me.penaltyPledgeCents)} penalty: ${esc(r.chargeStatus)}.` : '';
      statusEl.innerHTML = `${esc(me.friendName)} has been notified${photo ? ' (with photo)' : ''}.${charge}`;
    }
    const el = document.getElementById('stats');
    el.hidden = false;
    el.innerHTML = `
      <div class="stat"><b>${s.currentStreak}</b>current streak</div>
      <div class="stat"><b>${s.bestStreak}</b>best streak</div>
      <div class="stat"><b>${s.points}</b>points</div>`;
  } catch (e) {
    statusEl.innerHTML = `<span class="err">Failed to record attempt: ${esc(e.message)}</span>`;
  }
}

run();
