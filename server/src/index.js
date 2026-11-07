import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { computeStats, daysSince } from './stats.js';
import { alertFriend, sendToFriend, sendEmail } from './notify.js';
import { chargePenalty, createCardSetupLink } from './billing.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '3mb' })); // room for one jpeg snapshot
app.use(express.static(join(dirname(fileURLToPath(import.meta.url)), '..', 'public')));

const now = () => new Date().toISOString();
const isEmail = (s) => typeof s === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const user = token && db.prepare('SELECT * FROM users WHERE token = ?').get(token);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(now(), user.id);
  req.user = user;
  next();
}

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(500).json({ error: e.message }));

// ---- account -------------------------------------------------------------

app.post('/api/register', (req, res) => {
  const { name, email, friendName, friendEmail, penaltyCents = 500, photoEnabled = false } = req.body || {};
  if (!name || !friendName || !isEmail(email) || !isEmail(friendEmail)) {
    return res.status(400).json({ error: 'name, email, friendName and friendEmail are required' });
  }
  const penalty = Math.max(0, Math.min(10_000, Math.round(Number(penaltyCents) || 0)));
  const token = randomBytes(24).toString('hex');
  const t = now();
  db.prepare(
    `INSERT INTO users (token, name, email, friend_name, friend_email, penalty_cents, photo_enabled, streak_start, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(token, name, email, friendName, friendEmail, penalty, photoEnabled ? 1 : 0, t, t);
  res.json({ token });
});

app.get('/api/me', auth, (req, res) => {
  const u = req.user;
  res.json({
    ...computeStats(u),
    friendName: u.friend_name,
    friendEmail: u.friend_email,
    penaltyPledgeCents: u.penalty_cents,
    photoEnabled: !!u.photo_enabled,
    cardSaved: !!u.stripe_customer,
  });
});

app.patch('/api/me', auth, (req, res) => {
  const { photoEnabled, penaltyCents } = req.body || {};
  if (typeof photoEnabled === 'boolean') {
    db.prepare('UPDATE users SET photo_enabled = ? WHERE id = ?').run(photoEnabled ? 1 : 0, req.user.id);
  }
  if (penaltyCents !== undefined) {
    const p = Math.max(0, Math.min(10_000, Math.round(Number(penaltyCents) || 0)));
    // Lowering the pledge is a common cop-out; the friend is told about it.
    if (p < req.user.penalty_cents) {
      sendToFriend(
        req.user,
        `${req.user.name} lowered their penalty`,
        `${req.user.name} lowered their penalty from $${(req.user.penalty_cents / 100).toFixed(2)} to $${(p / 100).toFixed(2)}.`
      ).catch(() => {});
    }
    db.prepare('UPDATE users SET penalty_cents = ? WHERE id = ?').run(p, req.user.id);
  }
  res.json({ ok: true });
});

app.post('/api/heartbeat', auth, (_req, res) => res.json({ ok: true }));

// ---- web login (email magic link) ----------------------------------------

app.post(
  '/api/login',
  wrap(async (req, res) => {
    const email = String(req.body?.email || '').trim();
    const user = isEmail(email) && db.prepare('SELECT * FROM users WHERE email = ? ORDER BY id DESC').get(email);
    if (user) {
      const code = randomBytes(24).toString('hex');
      db.prepare('INSERT INTO login_codes (code, user_id, expires_at) VALUES (?, ?, ?)').run(
        code, user.id, new Date(Date.now() + 15 * 60_000).toISOString()
      );
      const base = process.env.PUBLIC_URL || `http://localhost:${port}`;
      await sendEmail(email, 'Your Goon Guard login link', `Open this link within 15 minutes to sign in:\n${base}/#login=${code}`);
    }
    res.json({ ok: true }); // same answer either way, so emails can't be probed
  })
);

app.post('/api/login/verify', (req, res) => {
  const row = db.prepare('SELECT * FROM login_codes WHERE code = ?').get(String(req.body?.code || ''));
  if (!row || row.expires_at < now()) return res.status(400).json({ error: 'link expired or invalid' });
  db.prepare('DELETE FROM login_codes WHERE code = ?').run(row.code);
  const { token } = db.prepare('SELECT token FROM users WHERE id = ?').get(row.user_id);
  res.json({ token });
});

// ---- history & check-ins ---------------------------------------------------

app.get('/api/me/history', auth, (req, res) => {
  const since = new Date(Date.now() - 180 * 86_400_000).toISOString();
  const slips = db
    .prepare('SELECT domain, had_photo, penalty_cents, charge_status, created_at FROM slips WHERE user_id = ? AND created_at >= ? ORDER BY created_at DESC')
    .all(req.user.id, since);
  const checkins = db
    .prepare('SELECT day, mood, note FROM checkins WHERE user_id = ? AND day >= ? ORDER BY day DESC')
    .all(req.user.id, since.slice(0, 10));
  res.json({ joinedAt: req.user.created_at, slips, checkins });
});

app.post('/api/checkin', auth, (req, res) => {
  const mood = Math.max(1, Math.min(5, Math.round(Number(req.body?.mood) || 3)));
  const note = String(req.body?.note || '').slice(0, 500);
  const day = String(req.body?.day || now().slice(0, 10)).slice(0, 10);
  db.prepare('INSERT OR REPLACE INTO checkins (user_id, day, mood, note) VALUES (?, ?, ?, ?)').run(req.user.id, day, mood, note);
  res.json({ ok: true });
});

app.post('/api/groups/:code/leave', auth, (req, res) => {
  const g = db.prepare('SELECT id FROM groups WHERE code = ?').get(req.params.code.toUpperCase());
  if (g) db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(g.id, req.user.id);
  res.json({ ok: true });
});

// ---- slips ---------------------------------------------------------------

app.post(
  '/api/slip',
  auth,
  wrap(async (req, res) => {
    const u = req.user;
    const domain = String(req.body?.domain || 'unknown').slice(0, 253);
    const photo =
      u.photo_enabled && typeof req.body?.photo === 'string' && req.body.photo.startsWith('data:image/jpeg;base64,')
        ? req.body.photo
        : null;

    // Collapse rapid repeat hits on the same domain into one slip.
    const recent = db
      .prepare(`SELECT id FROM slips WHERE user_id = ? AND domain = ? AND created_at > ?`)
      .get(u.id, domain, new Date(Date.now() - 10 * 60_000).toISOString());
    if (recent) return res.json({ duplicate: true, stats: computeStats(u) });

    const chargeStatus = await chargePenalty(u);
    const charged = ['succeeded', 'processing'].includes(chargeStatus) ? u.penalty_cents : 0;

    const best = Math.max(u.best_streak, daysSince(u.streak_start));
    const t = now();
    db.prepare('UPDATE users SET best_streak = ?, streak_start = ? WHERE id = ?').run(best, t, u.id);
    db.prepare(
      'INSERT INTO slips (user_id, domain, had_photo, penalty_cents, charge_status, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(u.id, domain, photo ? 1 : 0, charged, chargeStatus, t);

    const { c: todayCount } = db
      .prepare('SELECT COUNT(*) AS c FROM slips WHERE user_id = ? AND created_at >= ?')
      .get(u.id, new Date(new Date().setHours(0, 0, 0, 0)).toISOString());

    await alertFriend(u, { domain, todayCount, penaltyCents: u.penalty_cents, chargeStatus, photo });

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
    res.json({ duplicate: false, chargeStatus, stats: computeStats(fresh) });
  })
);

// ---- billing -------------------------------------------------------------

app.post('/api/billing/setup', auth, wrap(async (req, res) => res.json({ url: await createCardSetupLink(req.user) })));
app.get('/card-saved', (_q, res) => res.send('<h2>Card saved. You can close this tab.</h2>'));
app.get('/card-cancelled', (_q, res) => res.send('<h2>Card setup cancelled.</h2>'));

// ---- groups & leaderboard -----------------------------------------------

app.post('/api/groups', auth, (req, res) => {
  const name = String(req.body?.name || 'My group').slice(0, 60);
  const code = randomBytes(4).toString('hex').toUpperCase();
  const { lastInsertRowid } = db.prepare('INSERT INTO groups (code, name) VALUES (?, ?)').run(code, name);
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(lastInsertRowid, req.user.id);
  res.json({ code, name });
});

app.post('/api/groups/join', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE code = ?').get(String(req.body?.code || '').toUpperCase());
  if (!g) return res.status(404).json({ error: 'group not found' });
  db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)').run(g.id, req.user.id);
  res.json({ code: g.code, name: g.name });
});

app.get('/api/groups', auth, (req, res) => {
  res.json(
    db.prepare(
      'SELECT g.code, g.name FROM groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = ?'
    ).all(req.user.id)
  );
});

/** Leaderboard for a group (members only). Only display names and streak numbers are shared. */
app.get('/api/groups/:code/leaderboard', auth, (req, res) => {
  const g = db.prepare('SELECT * FROM groups WHERE code = ?').get(req.params.code.toUpperCase());
  if (!g) return res.status(404).json({ error: 'group not found' });
  const member = db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(g.id, req.user.id);
  if (!member) return res.status(403).json({ error: 'not a member' });
  const users = db
    .prepare('SELECT u.* FROM users u JOIN group_members m ON m.user_id = u.id WHERE m.group_id = ?')
    .all(g.id);
  const rows = users
    .map((u) => {
      const s = computeStats(u);
      return { name: s.name, you: u.id === req.user.id, currentStreak: s.currentStreak, bestStreak: s.bestStreak, points: s.points, badge: s.badge };
    })
    .sort((a, b) => b.currentStreak - a.currentStreak || b.points - a.points);
  res.json({ name: g.name, code: g.code, rows });
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Goon server listening on http://localhost:${port}`));
