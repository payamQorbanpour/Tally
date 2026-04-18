import { describe, expect, it } from "vitest";
import { computeBalances, sumBalances } from "./balances";
import { simplifyDebts } from "./simplifyDebts";

const A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const D = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const E = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

describe("computeBalances", () => {
  it("splits $100 as 50 / 30 / 20 percent resolved to cents", () => {
    const balances = computeBalances(
      [
        {
          payerId: A,
          amountMinor: 10_000,
          splits: [
            { userId: A, owedMinor: 5_000 },
            { userId: B, owedMinor: 3_000 },
            { userId: C, owedMinor: 2_000 },
          ],
        },
      ],
      [],
    );
    expect(balances.get(A)).toBe(5_000);
    expect(balances.get(B)).toBe(-3_000);
    expect(balances.get(C)).toBe(-2_000);
    expect(sumBalances(balances)).toBe(0);
  });

  it("records settlement so net returns to zero", () => {
    const expenses = [
      {
        payerId: A,
        amountMinor: 10_000,
        splits: [
          { userId: A, owedMinor: 5_000 },
          { userId: B, owedMinor: 5_000 },
        ],
      },
    ];
    const before = computeBalances(expenses, []);
    expect(before.get(A)).toBe(5_000);
    expect(before.get(B)).toBe(-5_000);

    const after = computeBalances(expenses, [
      { fromUserId: B, toUserId: A, amountMinor: 5_000 },
    ]);
    expect(after.size).toBe(0);
  });

  it("throws when splits do not sum to expense amount", () => {
    expect(() =>
      computeBalances(
        [
          {
            payerId: A,
            amountMinor: 100,
            splits: [{ userId: A, owedMinor: 50 }],
          },
        ],
        [],
      ),
    ).toThrow(/Split total/);
  });
});

describe("simplifyDebts", () => {
  it("clears four-way balances with at most n-1 payments", () => {
    const b = new Map<string, number>([
      [A, 15],
      [B, 15],
      [C, -15],
      [D, -15],
    ]);
    const payments = simplifyDebts(b);
    expect(payments.length).toBeLessThanOrEqual(3);

    const delta = computeBalances(
      [],
      payments.map((p) => ({
        fromUserId: p.fromUserId,
        toUserId: p.toUserId,
        amountMinor: p.amountMinor,
      })),
    );

    for (const [id, start] of b) {
      expect((delta.get(id) ?? 0) + start).toBe(0);
    }
  });

  it("uses at most n-1 edges for five users with intertwined debts", () => {
    const b = new Map<string, number>([
      [A, 12_000],
      [B, 8_000],
      [C, -7_000],
      [D, -8_000],
      [E, -5_000],
    ]);
    expect([...b.values()].reduce((x, y) => x + y, 0)).toBe(0);

    const payments = simplifyDebts(b);
    expect(payments.length).toBeLessThanOrEqual(4);

    const delta = computeBalances(
      [],
      payments.map((p) => ({
        fromUserId: p.fromUserId,
        toUserId: p.toUserId,
        amountMinor: p.amountMinor,
      })),
    );
    for (const [id, start] of b) {
      expect((delta.get(id) ?? 0) + start).toBe(0);
    }
  });
});
