import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  invite_code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  is_admin INTEGER NOT NULL DEFAULT 0,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  date TEXT NOT NULL,
  prompt TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'pick' CHECK (phase IN ('pick', 'guess', 'result')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (group_id, date)
);

CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  cover_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (round_id, user_id)
);

CREATE TABLE IF NOT EXISTS guesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  guesser_id INTEGER NOT NULL REFERENCES users(id),
  pick_id INTEGER NOT NULL REFERENCES picks(id),
  guessed_user_id INTEGER NOT NULL REFERENCES users(id),
  UNIQUE (round_id, guesser_id, pick_id)
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  round_id INTEGER NOT NULL REFERENCES rounds(id),
  voter_id INTEGER NOT NULL REFERENCES users(id),
  pick_id INTEGER NOT NULL REFERENCES picks(id),
  UNIQUE (round_id, voter_id)
);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}
