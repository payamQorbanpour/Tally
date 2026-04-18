/**
 * Local SQLite layout (also mirrored in Supabase Postgres when cloud sync is on; `app_settings` stays device-only).
 */
export const TALLY_INIT_SQL = `
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS groups (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  icon TEXT,
  group_type TEXT,
  simplify_debts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_modified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  last_modified TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  id TEXT NOT NULL PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  last_modified TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS group_members_by_group ON group_members (group_id);
CREATE INDEX IF NOT EXISTS group_members_by_user ON group_members (user_id);
CREATE INDEX IF NOT EXISTS group_members_pair ON group_members (group_id, user_id);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT NOT NULL PRIMARY KEY,
  group_id TEXT NOT NULL,
  payer_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  description TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  category TEXT,
  notes TEXT,
  last_modified TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS expenses_by_group ON expenses (group_id, created_at);

CREATE TABLE IF NOT EXISTS splits (
  id TEXT NOT NULL PRIMARY KEY,
  expense_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  owed_minor INTEGER NOT NULL,
  last_modified TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS splits_by_expense ON splits (expense_id);

CREATE TABLE IF NOT EXISTS settlements (
  id TEXT NOT NULL PRIMARY KEY,
  group_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  settled_at TEXT NOT NULL,
  last_modified TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS settlements_by_group ON settlements (group_id);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT NOT NULL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  value TEXT
);
`;

export const TALLY_DB_NAME = "tally.db";
