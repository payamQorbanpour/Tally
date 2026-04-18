/** UUID string — stable across future sync. */
export type EntityId = string;

/** Integer minor units (e.g. cents) to avoid floating-point drift. */
export type MinorAmount = number;

export interface SplitLine {
  userId: EntityId;
  owedMinor: MinorAmount;
}

export interface ExpenseLedgerLine {
  payerId: EntityId;
  amountMinor: MinorAmount;
  splits: SplitLine[];
}

export interface SettlementLine {
  fromUserId: EntityId;
  toUserId: EntityId;
  amountMinor: MinorAmount;
}

export interface SimplifiedPayment {
  fromUserId: EntityId;
  toUserId: EntityId;
  amountMinor: MinorAmount;
}
