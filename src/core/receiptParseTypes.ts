export type ParsedReceiptLine = {
  label: string;
  /** Major currency units (e.g. USD dollars); may be negative for discounts. */
  amount: number;
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
