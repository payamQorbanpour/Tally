import { describe, expect, it } from "vitest";
import { guessCategoryFromTitle } from "./guessCategoryFromTitle";

describe("guessCategoryFromTitle", () => {
  it("maps common food words", () => {
    expect(guessCategoryFromTitle("Burger")).toBe("food");
    expect(guessCategoryFromTitle("groceries")).toBe("food");
    expect(guessCategoryFromTitle("Coffee with Sam")).toBe("food");
  });

  it("maps transportation", () => {
    expect(guessCategoryFromTitle("Ticket")).toBe("transport");
    expect(guessCategoryFromTitle("bus to work")).toBe("transport");
    expect(guessCategoryFromTitle("Uber")).toBe("transport");
  });

  it("prefers delivery apps as food over generic uber", () => {
    expect(guessCategoryFromTitle("Uber Eats")).toBe("food");
  });

  it("leaves entertainment tickets as general", () => {
    expect(guessCategoryFromTitle("movie ticket")).toBeNull();
  });

  it("maps home", () => {
    expect(guessCategoryFromTitle("rent April")).toBe("home");
    expect(guessCategoryFromTitle("Internet bill")).toBe("home");
  });

  it("returns null when empty or no match", () => {
    expect(guessCategoryFromTitle("")).toBeNull();
    expect(guessCategoryFromTitle("   ")).toBeNull();
    expect(guessCategoryFromTitle("misc")).toBeNull();
  });
});
