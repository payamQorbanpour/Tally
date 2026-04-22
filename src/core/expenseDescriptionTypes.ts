export type ParsedExpenseSplit = {
  /** Name the AI mapped to a participant; matched to a member by the UI layer. */
  personName: string;
  /** Major currency units owed by this person for this expense. */
  amountMajor: number;
};

export type ParsedExpenseItem = {
  description: string;
  /** Major currency units (e.g. USD dollars). */
  amountMajor: number;
  payerName: string;
  splits: ParsedExpenseSplit[];
};

export type ParsedExpenseDescription = {
  /** ISO 4217 when identifiable; otherwise null (caller falls back to group currency). */
  currency: string | null;
  expenses: ParsedExpenseItem[];
  confidence?: "high" | "medium" | "low";
  /** Optional short explanation from the model about how splits were calculated. */
  reasoning?: string;
};
