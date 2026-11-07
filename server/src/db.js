import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'goon.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY,
    token           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    email           TEXT NOT NULL,
    friend_name     TEXT NOT NULL,
    friend_email    TEXT NOT NULL,
    penalty_cents   INTEGER NOT NULL DEFAULT 500,
    photo_enabled   INTEGER NOT NULL DEFAULT 0,
    stripe_customer TEXT,
    best_streak     INTEGER NOT NULL DEFAULT 0,
    streak_start    TEXT NOT NULL,
    last_seen       TEXT,
    created_at      TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS slips (
    id            INTEGER PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain        TEXT NOT NULL,
    had_photo     INTEGER NOT NULL DEFAULT 0,
    penalty_cents INTEGER NOT NULL DEFAULT 0,
    charge_status TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS login_codes (
    code       TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkins (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day     TEXT NOT NULL,
    mood    INTEGER NOT NULL,
    note    TEXT,
    PRIMARY KEY (user_id, day)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id   INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, user_id)
  );
`);
