-- Tally local-first schema (SQLite). IDs are TEXT UUIDs for future sync.
-- Amounts stored as INTEGER minor units per FR-5 / reliability.

PRAGMA foreign_keys = ON;

CREATE TABLE groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  icon TEXT,
  group_type TEXT NOT NULL DEFAULT 'other',
  simplify_debts INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  email TEXT
);

CREATE TABLE group_members (
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  payer_id TEXT NOT NULL REFERENCES users (id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  description TEXT NOT NULL,
  expense_date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE splits (
  id TEXT PRIMARY KEY NOT NULL,
  expense_id TEXT NOT NULL REFERENCES expenses (id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users (id),
  owed_minor INTEGER NOT NULL CHECK (owed_minor >= 0),
  UNIQUE (expense_id, user_id)
);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users (id),
  to_user_id TEXT NOT NULL REFERENCES users (id),
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  settled_at TEXT NOT NULL,
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX idx_expenses_group ON expenses (group_id);
CREATE INDEX idx_splits_expense ON splits (expense_id);
CREATE INDEX idx_settlements_group ON settlements (group_id);
