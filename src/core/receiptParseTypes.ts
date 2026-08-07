export type ParsedReceiptLine = {
  label: string;
  /** Major currency units (e.g. USD dollars); may be negative for discounts. */
  amount: number;
  /**
   * How many of this item the receipt shows on this row — the printed
   * quantity column (`2`, `4`, `×3`, `۲ عدد`). Absent when the row prints no
   * quantity, or prints exactly one; the UI only renders a `x2` badge when
   * this is present and greater than 1, so "no quantity printed" and
   * "quantity of one" collapse to the same unlabelled display.
   *
   * Purely informational: `amount` is always the row's LINE TOTAL as
   * printed (all `qty` units together), never the unit price, so nothing
   * downstream — split maths, VAT, the saved expense — multiplies by this.
   * Keeping it out of the arithmetic is what makes it safe for the model to
   * be wrong about a quantity without corrupting anyone's balance.
   */
  qty?: number;
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
