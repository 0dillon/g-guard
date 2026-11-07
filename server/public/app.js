// Goon Guard web dashboard. Plain ES modules, no build step.

const view = document.getElementById('view');
const DAY = 86_400_000;
const BADGES = [
  [1, 'Starter', '🌱'], [7, 'Bronze', '🥉'], [30, 'Silver', '🥈'], [90, 'Gold', '🥇'], [365, 'Diamond', '💎'],
];
const MOODS = ['😣', '😕', '😐', '🙂', '😄'];

let token = null;
try { token = localStorage.getItem('goon_token'); } catch {}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (c) => `$${(c / 100).toFixed(2)}`;
const fmt = (iso) => new Date(iso).toLocaleString();
const localDay = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

function setToken(t) {
  token = t;
  try { t ? localStorage.setItem('goon_token', t) : localStorage.removeItem('goon_token'); } catch {}
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { setToken(null); route(); throw new Error('Signed out'); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function flash(el, text, ok = true) { el.className = `msg ${ok ? 'ok' : 'err'}`; el.textContent = text; }

// ---- auth ------------------------------------------------------------------

function renderAuth() {
  document.getElementById('nav').hidden = true;
  view.innerHTML = `
    <div class="auth">
      <div class="card">
        <h2>Sign in</h2>
        <p class="muted">We'll email you a sign-in link. You can also open the dashboard from the extension's settings.</p>
        <label>Email</label><input id="loginEmail" type="email" />
        <button id="loginBtn" style="margin-top:12px">Email me a link</button>
        <div id="loginMsg" class="msg"></div>
      </div>
      <div class="card">
        <h3>New here?</h3>
        <label>Your name</label><input id="name" />
        <label>Your email</label><input id="email" type="email" />
        <label>Friend's name</label><input id="friendName" />
        <label>Friend's email</label><input id="friendEmail" type="email" />
        <label>Penalty per slip (USD)</label><input id="penalty" type="number" min="0" max="100" value="5" />
        <button id="signupBtn" style="margin-top:12px">Create account</button>
        <p class="muted">Install the Chrome extension afterwards to turn on blocking.</p>
        <div id="signupMsg" class="msg"></div>
      </div>
    </div>`;
  document.getElementById('loginBtn').onclick = async () => {
    const m = document.getElementById('loginMsg');
    try {
      await api('/api/login', { method: 'POST', body: { email: document.getElementById('loginEmail').value } });
      flash(m, 'If that email has an account, a link is on its way.');
    } catch (e) { flash(m, e.message, false); }
  };
  document.getElementById('signupBtn').onclick = async () => {
    const v = (id) => document.getElementById(id).value.trim();
    try {
      const { token: t } = await api('/api/register', {
        method: 'POST',
        body: { name: v('name'), email: v('email'), friendName: v('friendName'), friendEmail: v('friendEmail'), penaltyCents: Math.round(Number(v('penalty')) * 100) },
      });
      setToken(t);
      location.hash = '#dashboard';
    } catch (e) { flash(document.getElementById('signupMsg'), e.message, false); }
  };
}

// ---- dashboard -------------------------------------------------------------

function calendarHtml(history) {
  const slipDays = new Set(history.slips.map((s) => localDay(s.created_at)));
  const checkDays = new Set(history.checkins.map((c) => c.day));
  const joined = localDay(history.joinedAt);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - 25 * 7 * DAY);
  start.setDate(start.getDate() - start.getDay()); // align to Sunday
  const cells = [];
  for (let d = new Date(start); d <= today; d = new Date(d.getTime() + DAY)) {
    const key = localDay(d);
    const cls = key < joined ? '' : slipDays.has(key) ? 'slip' : checkDays.has(key) ? 'checkin' : 'clean';
    cells.push(`<div class="${cls}" title="${key}${cls ? ': ' + cls : ''}"></div>`);
  }
  return `<div class="cal">${cells.join('')}</div>
    <div class="legend">
      <span style="--c:var(--c1)">Clean</span><span style="--c:var(--c2)">Clean + check-in</span>
      <span style="--c:var(--bad)">Slip</span><span style="--c:var(--c0)">Before you joined</span>
    </div>`;
}

function nextBadge(streak) {
  const next = BADGES.find(([d]) => d > streak);
  if (!next) return '<p class="muted">Every badge earned. Keep going.</p>';
  const prev = [...BADGES].reverse().find(([d]) => d <= streak)?.[0] ?? 0;
  const pct = Math.round(((streak - prev) / (next[0] - prev)) * 100);
  return `<p class="muted">${next[0] - streak} day(s) to ${next[2]} ${next[1]}</p><div class="progress"><div style="width:${pct}%"></div></div>`;
}

async function renderDashboard() {
  const [me, history] = await Promise.all([api('/api/me'), api('/api/me/history')]);
  const todayKey = localDay(new Date());
  const todays = history.checkins.find((c) => c.day === todayKey);
  view.innerHTML = `
    <div class="card hero">
      <div><div class="big">${me.currentStreak}</div><div class="muted">day streak</div></div>
      <div style="flex:1;min-width:200px">
        <h2>Hi ${esc(me.name)} ${me.badge ? `<span class="pill">${esc(me.badge)}</span>` : ''}</h2>
        ${nextBadge(me.currentStreak)}
      </div>
    </div>
    <div class="grid">
      <div class="tile"><div class="k">Best streak</div><div class="v">${me.bestStreak}d</div></div>
      <div class="tile"><div class="k">Points</div><div class="v">${me.points}</div></div>
      <div class="tile"><div class="k">Slips</div><div class="v">${me.slips}</div></div>
      <div class="tile"><div class="k">Paid in penalties</div><div class="v">${money(me.penaltyCents)}</div></div>
    </div>
    <div class="two">
      <div class="card">
        <h3>Daily check-in</h3>
        <p class="muted">${todays ? 'Checked in today. You can update it.' : 'How are you holding up today?'}</p>
        <div class="moods">${MOODS.map((m, i) => `<button data-mood="${i + 1}" class="${todays?.mood === i + 1 ? 'sel' : ''}">${m}</button>`).join('')}</div>
        <label>Note (private)</label><textarea id="note" rows="2" placeholder="Triggers, wins, anything">${esc(todays?.note || '')}</textarea>
        <button id="checkinBtn" style="margin-top:10px">Save check-in</button>
        <div id="checkinMsg" class="msg"></div>
      </div>
      <div class="card">
        <h3>Accountability partner</h3>
        <p>${esc(me.friendName)} <span class="muted">${esc(me.friendEmail)}</span></p>
        <p class="muted">Penalty per slip: ${money(me.penaltyPledgeCents)} · Card ${me.cardSaved ? 'linked' : 'not linked'} · Photos ${me.photoEnabled ? 'on' : 'off'}</p>
        <a href="#settings">Change settings</a>
      </div>
    </div>
    <div class="card"><h3>Last 6 months</h3>${calendarHtml(history)}</div>
    <div class="card"><h3>Badges</h3><div class="badges">
      ${BADGES.map(([d, n, e]) => `<div class="badge-card ${me.bestStreak >= d ? '' : 'locked'}"><div class="e">${e}</div><b>${n}</b><div class="muted">${d} day${d > 1 ? 's' : ''}</div></div>`).join('')}
    </div></div>`;

  let mood = todays?.mood || 3;
  view.querySelectorAll('[data-mood]').forEach((b) => (b.onclick = () => {
    mood = Number(b.dataset.mood);
    view.querySelectorAll('[data-mood]').forEach((x) => x.classList.toggle('sel', x === b));
  }));
  document.getElementById('checkinBtn').onclick = async () => {
    try {
      await api('/api/checkin', { method: 'POST', body: { mood, note: document.getElementById('note').value, day: todayKey } });
      flash(document.getElementById('checkinMsg'), 'Saved.');
    } catch (e) { flash(document.getElementById('checkinMsg'), e.message, false); }
  };
}

// ---- leaderboards ----------------------------------------------------------

async function renderLeaderboards() {
  const groups = await api('/api/groups');
  const boards = await Promise.all(groups.map((g) => api(`/api/groups/${g.code}/leaderboard`)));
  view.innerHTML = `
    <div class="card">
      <h2>Leaderboards</h2>
      <p class="muted">Groups only share your name, streak, badge and points. Nobody else sees sites, photos or penalties.</p>
      <div class="row">
        <div><label>New group</label><input id="gName" placeholder="Group name" /></div><button id="gCreate">Create</button>
      </div>
      <div class="row">
        <div><label>Join with a code</label><input id="gCode" placeholder="ABCD1234" /></div><button id="gJoin">Join</button>
      </div>
      <div id="gMsg" class="msg"></div>
    </div>
    ${boards.length ? boards.map((b) => `
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
          <h3 style="margin:0">${esc(b.name)}</h3>
          <div><span class="muted">Invite code <b>${esc(b.code)}</b></span>
            <button class="ghost small" data-copy="${esc(b.code)}">Copy</button>
            <button class="ghost small" data-leave="${esc(b.code)}">Leave</button></div>
        </div>
        <table><tr><th>#</th><th>Name</th><th>Streak</th><th>Best</th><th>Points</th></tr>
          ${b.rows.map((r, i) => `<tr class="${r.you ? 'you' : ''}"><td>${['🥇', '🥈', '🥉'][i] || i + 1}</td>
            <td>${esc(r.name)} ${r.badge ? `<span class="pill">${esc(r.badge)}</span>` : ''}</td>
            <td>${r.currentStreak}d</td><td>${r.bestStreak}d</td><td>${r.points}</td></tr>`).join('')}
        </table>
      </div>`).join('') : '<p class="muted">You are not in any groups yet.</p>'}`;

  const m = document.getElementById('gMsg');
  document.getElementById('gCreate').onclick = async () => {
    try { await api('/api/groups', { method: 'POST', body: { name: document.getElementById('gName').value.trim() || 'My group' } }); renderLeaderboards(); }
    catch (e) { flash(m, e.message, false); }
  };
  document.getElementById('gJoin').onclick = async () => {
    try { await api('/api/groups/join', { method: 'POST', body: { code: document.getElementById('gCode').value.trim() } }); renderLeaderboards(); }
    catch (e) { flash(m, e.message, false); }
  };
  view.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => navigator.clipboard?.writeText(b.dataset.copy).then(() => (b.textContent = 'Copied'))));
  view.querySelectorAll('[data-leave]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Leave this group?')) return;
    await api(`/api/groups/${b.dataset.leave}/leave`, { method: 'POST' });
    renderLeaderboards();
  }));
}

// ---- history ---------------------------------------------------------------

async function renderHistory() {
  const h = await api('/api/me/history');
  view.innerHTML = `
    <div class="card"><h2>Slips</h2>
      ${h.slips.length ? `<table><tr><th>When</th><th>Site</th><th>Photo</th><th>Penalty</th></tr>
        ${h.slips.map((s) => `<tr><td>${fmt(s.created_at)}</td><td>${esc(s.domain)}</td><td>${s.had_photo ? 'Yes' : 'No'}</td>
          <td>${s.penalty_cents ? money(s.penalty_cents) : `<span class="muted">${esc(s.charge_status)}</span>`}</td></tr>`).join('')}</table>`
      : '<p class="muted">No slips in the last 6 months.</p>'}
    </div>
    <div class="card"><h2>Check-ins</h2>
      ${h.checkins.length ? `<table><tr><th>Day</th><th>Mood</th><th>Note</th></tr>
        ${h.checkins.map((c) => `<tr><td>${esc(c.day)}</td><td>${MOODS[c.mood - 1]}</td><td>${esc(c.note)}</td></tr>`).join('')}</table>`
      : '<p class="muted">No check-ins yet.</p>'}
    </div>`;
}

// ---- settings --------------------------------------------------------------

async function renderSettings() {
  const me = await api('/api/me');
  view.innerHTML = `
    <div class="card">
      <h2>Settings</h2>
      <label>Penalty per slip (USD). Your friend is told if you lower it.</label>
      <input id="pen" type="number" min="0" max="100" value="${(me.penaltyPledgeCents / 100).toFixed(2)}" />
      <label><input id="photo" type="checkbox" ${me.photoEnabled ? 'checked' : ''} /> Attach a webcam photo to alerts. Only turn this on if your friend agreed to get photos. The extension takes the photo.</label>
      <button id="save" style="margin-top:12px">Save</button>
      <button class="ghost" id="card" style="margin-top:12px">${me.cardSaved ? 'Replace card' : 'Add card'}</button>
      <div id="sMsg" class="msg"></div>
    </div>`;
  const m = document.getElementById('sMsg');
  document.getElementById('save').onclick = async () => {
    try {
      await api('/api/me', { method: 'PATCH', body: { penaltyCents: Math.round(Number(document.getElementById('pen').value) * 100), photoEnabled: document.getElementById('photo').checked } });
      flash(m, 'Saved.');
    } catch (e) { flash(m, e.message, false); }
  };
  document.getElementById('card').onclick = async () => {
    try { location.href = (await api('/api/billing/setup', { method: 'POST' })).url; }
    catch (e) { flash(m, e.message, false); }
  };
}

// ---- router ----------------------------------------------------------------

const ROUTES = { dashboard: renderDashboard, leaderboards: renderLeaderboards, history: renderHistory, settings: renderSettings };

async function route() {
  const hash = location.hash.slice(1);

  // Sign-in hand-offs: #login=<code> from email, #token=<token> from the extension.
  if (hash.startsWith('login=')) {
    try { setToken((await api('/api/login/verify', { method: 'POST', body: { code: hash.slice(6) } })).token); }
    catch (e) { view.innerHTML = `<div class="auth card"><p class="msg err">${esc(e.message)}</p><a href="#">Back</a></div>`; return; }
    history.replaceState(null, '', '#dashboard');
  } else if (hash.startsWith('token=')) {
    setToken(hash.slice(6));
    history.replaceState(null, '', '#dashboard');
  }

  if (!token) return renderAuth();
  const page = location.hash.slice(1) in ROUTES ? location.hash.slice(1) : 'dashboard';
  document.getElementById('nav').hidden = false;
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${page}`));
  try { await ROUTES[page](); }
  catch (e) { if (token) view.innerHTML = `<p class="msg err">${esc(e.message)}</p>`; }
}

document.getElementById('logout').onclick = () => { setToken(null); location.hash = ''; route(); };
window.addEventListener('hashchange', route);
route();
