-- Receipt itemization for an expense.
--
-- An expense saved from an AI receipt scan used to collapse to a single row:
-- merchant, total, per-person splits. The lines the scan actually read were
-- discarded, so fixing one wrong price meant re-scanning the whole receipt.
-- This column carries them, so the items stay editable after the save.
--
-- Deliberately `text`, not `jsonb`: the payload is only ever read and written
-- whole, never queried or indexed by its contents, and the client mirrors it
-- into a SQLite `TEXT` column. Keeping both sides text means the value
-- round-trips byte-identically and neither the sync layer nor Postgres ever
-- reformats a document the client is about to parse itself. Validation lives
-- in one place: `src/core/expenseReceiptItems.ts`.
--
-- Shape: [{ "id": string, "label": string, "amountMinor": integer,
--           "qty": integer >= 2 (optional), "sharerIds": string[] }]
-- `amountMinor` is in the group's currency minor units — the same scale as
-- `expenses.amount_minor`.
--
-- Nullable, no default, no backfill. Every existing expense reads back NULL,
-- which the client renders as "no itemization" — correct, because the items
-- behind an older scan were never recorded and deriving them from the total
-- would be fabrication. NULL is also what an older client sends, so a group
-- running mixed app versions syncs without either side losing rows.
--
-- No RLS change: `public.expenses` already restricts access by group
-- membership, and a new column on an existing table inherits those policies.
alter table public.expenses
  add column if not exists receipt_items text;

comment on column public.expenses.receipt_items is
  'JSON receipt line items ([{id,label,amountMinor,qty?,sharerIds}]) or NULL. Opaque to the server; parsed by src/core/expenseReceiptItems.ts. Money remains authoritative in amount_minor and the splits rows.';
