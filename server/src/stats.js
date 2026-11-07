import { db } from './db.js';

const DAY = 86_400_000;

export function daysSince(iso) {
  return Math.floor((Date.now() - Date.parse(iso)) / DAY);
}

/** Points: 10 per clean day, +50 bonus per completed week, -25 per slip. */
export function computeStats(user) {
  const current = daysSince(user.streak_start);
  const best = Math.max(user.best_streak, current);
  const { slips, penalty } = db
    .prepare('SELECT COUNT(*) AS slips, COALESCE(SUM(penalty_cents),0) AS penalty FROM slips WHERE user_id = ?')
    .get(user.id);
  const cleanDays = Math.max(0, daysSince(user.created_at) - slips);
  const points = cleanDays * 10 + Math.floor(current / 7) * 50 - slips * 25;
  return {
    name: user.name,
    currentStreak: current,
    bestStreak: best,
    slips,
    penaltyCents: penalty,
    points,
    badge: badgeFor(best),
  };
}

const BADGES = [
  [365, 'Diamond'],
  [90, 'Gold'],
  [30, 'Silver'],
  [7, 'Bronze'],
  [1, 'Starter'],
];

export function badgeFor(days) {
  for (const [min, name] of BADGES) if (days >= min) return name;
  return null;
}
