import { describe, it, expect } from "vitest";
import { simplifyDebts, getNonSimplifiedPayments } from "./simplifyDebts";

describe("simplifyDebts", () => {
  it("should simplify a triangle debt (A → B → C becomes A → C)", () => {
    const balances = new Map([
      ["A", -100], // A owes 100
      ["B", 0],    // B is neutral
      ["C", 100],  // C is owed 100
    ]);
    
    const result = simplifyDebts(balances);
    expect(result).toEqual([
      { fromUserId: "A", toUserId: "C", amountMinor: 100 },
    ]);
  });

  it("should handle multiple debtors and creditors", () => {
    const balances = new Map([
      ["A", -50],   // A owes 50
      ["B", -50],   // B owes 50
      ["C", 100],   // C is owed 100
    ]);
    
    const result = simplifyDebts(balances);
    expect(result.length).toBeGreaterThan(0);
    
    // Verify total amounts match
    const totalOwed = result.reduce((sum, p) => sum + p.amountMinor, 0);
    expect(totalOwed).toBe(100);
  });
});

describe("getNonSimplifiedPayments", () => {
  it("should generate pairwise payments for debtors and creditors", () => {
    const balances = new Map([
      ["A", -100], // A owes 100
      ["B", 0],    // B is neutral
      ["C", 100],  // C is owed 100
    ]);
    
    const result = getNonSimplifiedPayments(balances);
    expect(result).toEqual([
      { fromUserId: "A", toUserId: "C", amountMinor: 100 },
    ]);
  });

  it("should distribute multiple debtors across creditors", () => {
    const balances = new Map([
      ["A", -50],   // A owes 50
      ["B", -50],   // B owes 50
      ["C", 100],   // C is owed 100
    ]);
    
    const result = getNonSimplifiedPayments(balances);
    
    // A should pay C 50
    expect(result).toContainEqual({ fromUserId: "A", toUserId: "C", amountMinor: 50 });
    
    // B should pay C 50
    expect(result).toContainEqual({ fromUserId: "B", toUserId: "C", amountMinor: 50 });
  });

  it("should handle complex debt scenarios", () => {
    const balances = new Map([
      ["A", -100], // A owes 100
      ["B", -50],  // B owes 50
      ["C", 80],   // C is owed 80
      ["D", 70],   // D is owed 70
    ]);
    
    const result = getNonSimplifiedPayments(balances);
    
    // Verify total amounts match
    const totalOwed = result.reduce((sum, p) => sum + p.amountMinor, 0);
    expect(totalOwed).toBe(150);
  });

  it("should return empty array when all balances are zero", () => {
    const balances = new Map([
      ["A", 0],
      ["B", 0],
    ]);
    
    const result = getNonSimplifiedPayments(balances);
    expect(result).toEqual([]);
  });
});
