// SQLite database (built into Node, no native add-on needed).
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'board.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new DatabaseSync(file);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  headline         TEXT NOT NULL DEFAULT '',
  level          TEXT NOT NULL DEFAULT '',
  location      TEXT NOT NULL DEFAULT '',
  bio           TEXT NOT NULL DEFAULT '',
  skills        TEXT NOT NULL DEFAULT '',
  interests     TEXT NOT NULL DEFAULT '',
  availability  TEXT NOT NULL DEFAULT '',
  link          TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id            INTEGER PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  summary       TEXT NOT NULL,
  description   TEXT NOT NULL,
  category      TEXT NOT NULL,
  stage         TEXT NOT NULL,
  work_mode     TEXT NOT NULL,
  location      TEXT NOT NULL DEFAULT '',
  skills_needed TEXT NOT NULL DEFAULT '',
  roles_needed  TEXT NOT NULL DEFAULT '',
  commitment    TEXT NOT NULL DEFAULT '',
  team_size     INTEGER NOT NULL DEFAULT 4,
  status        TEXT NOT NULL DEFAULT 'open',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at);

CREATE TABLE IF NOT EXISTS memberships (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  joined_at  INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS join_requests (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  team_only  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_project ON comments(project_id);

CREATE TABLE IF NOT EXISTS meetups (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  creator_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  place       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,           -- local time of the meetup, 'YYYY-MM-DDTHH:MM'
  notes       TEXT NOT NULL DEFAULT '',
  open_to_all INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_meetups_starts ON meetups(starts_at);

CREATE TABLE IF NOT EXISTS rsvps (
  meetup_id INTEGER NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status    TEXT NOT NULL,
  PRIMARY KEY (meetup_id, user_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id           INTEGER PRIMARY KEY,
  sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body         TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  read_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_messages_pair ON messages(sender_id, recipient_id);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  link       TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`);

const get = (sql, ...params) => db.prepare(sql).get(...params);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const run = (sql, ...params) => db.prepare(sql).run(...params);

function notify(userId, text, link) {
  run('INSERT INTO notifications (user_id, text, link, created_at) VALUES (?, ?, ?, ?)', userId, text, link, Date.now());
}

module.exports = { db, get, all, run, notify };
