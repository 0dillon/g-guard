import { api, getSettings, money, esc, openDashboard } from './lib.js';

const root = document.getElementById('root');

function leaderboardHtml(lb) {
  const rows = lb.rows
    .map(
      (r, i) => `<tr class="${r.you ? 'you' : ''}">
        <td>${i + 1}</td><td>${esc(r.name)} ${r.badge ? `<span class="badge">${esc(r.badge)}</span>` : ''}</td>
        <td>${r.currentStreak}d</td><td>${r.points}</td></tr>`
    )
    .join('');
  return `<div class="card"><h3>${esc(lb.name)} <span class="muted">${esc(lb.code)}</span></h3>
    <table><tr><th>#</th><th>Name</th><th>Streak</th><th>Pts</th></tr>${rows}</table></div>`;
}

async function render() {
  const { token } = await getSettings();
  if (!token) {
    root.innerHTML = `<div class="card"><h3>Not set up</h3><p class="muted">Add your accountability partner to start.</p>
      <button id="setup">Open setup</button></div>`;
    document.getElementById('setup').onclick = () => chrome.runtime.openOptionsPage();
    return;
  }
  try {
    const me = await api('/api/me');
    const groups = await api('/api/groups');
    const boards = await Promise.all(groups.map((g) => api(`/api/groups/${g.code}/leaderboard`)));
    root.innerHTML = `
      <div class="card">
        <h2>${me.currentStreak} day streak ${me.badge ? `<span class="badge">${esc(me.badge)}</span>` : ''}</h2>
        <div class="stats">
          <div class="stat"><b>${me.bestStreak}</b>best</div>
          <div class="stat"><b>${me.points}</b>points</div>
          <div class="stat"><b>${me.slips}</b>slips</div>
        </div>
        <p class="muted">Partner: ${esc(me.friendName)} · Penalty ${money(me.penaltyPledgeCents)} · Paid so far ${money(me.penaltyCents)}</p>
      </div>
      ${boards.map(leaderboardHtml).join('') || '<p class="muted">Create or join a group in settings to see a leaderboard.</p>'}
      <button id="web">Open dashboard</button>
      <button class="ghost" id="opts">Settings</button>`;
    document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();
    document.getElementById('web').onclick = openDashboard;
  } catch (e) {
    root.innerHTML = `<p class="err">${esc(e.message)}</p>`;
  }
}

render();
