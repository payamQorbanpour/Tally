import { column, Schema, Table } from "@powersync/common";

/**
 * PowerSync client schema (matches your Supabase/Postgres tables in sync rules).
 * PK `id` is a UUID; `last_modified` supports LWW in Postgres.
 */
const groups = new Table(
  {
    name: column.text,
    currency: column.text,
    icon: column.text,
    group_type: column.text,
    simplify_debts: column.integer,
    created_at: column.text,
    last_modified: column.text,
  },
  {
    indexes: {
      groups_created: ["-created_at"],
    },
  },
);

const users = new Table(
  {
    name: column.text,
    email: column.text,
    last_modified: column.text,
  },
  {},
);

const groupMembers = new Table(
  {
    group_id: column.text,
    user_id: column.text,
    joined_at: column.text,
    last_modified: column.text,
  },
  {
    indexes: {
      group_members_by_group: ["group_id"],
      group_members_by_user: ["user_id"],
      group_members_pair: ["group_id", "user_id"],
    },
  },
);

const expenses = new Table(
  {
    group_id: column.text,
    payer_id: column.text,
    amount_minor: column.integer,
    description: column.text,
    expense_date: column.text,
    created_at: column.text,
    category: column.text,
    notes: column.text,
    last_modified: column.text,
  },
  {
    trackPrevious: { columns: ["description", "amount_minor", "expense_date"], onlyWhenChanged: true },
    indexes: {
      expenses_by_group: ["group_id", "-created_at"],
    },
  },
);

const splits = new Table(
  {
    expense_id: column.text,
    user_id: column.text,
    owed_minor: column.integer,
    last_modified: column.text,
  },
  {
    indexes: {
      splits_by_expense: ["expense_id"],
    },
  },
);

const settlements = new Table(
  {
    group_id: column.text,
    from_user_id: column.text,
    to_user_id: column.text,
    amount_minor: column.integer,
    settled_at: column.text,
    last_modified: column.text,
  },
  {
    indexes: {
      settlements_by_group: ["group_id"],
    },
  },
);

const appSettings = new Table(
  { setting_key: column.text, value: column.text },
  { localOnly: true, indexes: { uq_settings_key: ["setting_key"] } },
);

export const tallyPowerSyncSchema = new Schema({
  groups,
  users,
  group_members: groupMembers,
  expenses,
  splits,
  settlements,
  app_settings: appSettings,
});
