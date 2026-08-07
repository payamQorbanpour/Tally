export type ParsedReceiptLine = {
  label: string;
  /** Major currency units (e.g. USD dollars); may be negative for discounts. */
  amount: number;
  /**
   * What the model thinks this row is. Absent when the model didn't say or
   * gave a value we don't recognize — callers treat that as "item".
   */
  kind?: "item" | "surcharge" | "discount";
  /**
   * Names the model attributed to this line from the user's accompanying
   * description (e.g. "Lyra and Eliana shared the جوجه کبک"). Absent when
   * the description didn't attribute this line to anyone — resolving these
   * to member ids is the UI layer's job, same as `parseExpenseDescription`.
   */
  people?: string[];
};

export type ParsedReceiptPayload = {
  merchant: string | null;
  /** ISO 4217 when identifiable */
  currency: string | null;
  lines: ParsedReceiptLine[];
  subtotal: number | null;
  tax: number | null;
  serviceCharge: number | null;
  discount: number | null;
  total: number | null;
  confidence?: "high" | "medium" | "low";
};
