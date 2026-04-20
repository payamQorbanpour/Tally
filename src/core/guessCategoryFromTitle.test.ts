import { describe, expect, it } from "vitest";
import { guessCategoryFromTitle } from "./guessCategoryFromTitle";

describe("guessCategoryFromTitle", () => {
  it("maps common food words", () => {
    expect(guessCategoryFromTitle("Burger")).toBe("food");
    expect(guessCategoryFromTitle("groceries")).toBe("food");
    expect(guessCategoryFromTitle("Coffee with Sam")).toBe("food");
  });

  it("maps common Farsi food words", () => {
    expect(guessCategoryFromTitle("شام")).toBe("food");
    expect(guessCategoryFromTitle("رستوران")).toBe("food");
    expect(guessCategoryFromTitle("اسنپ فود")).toBe("food");
    expect(guessCategoryFromTitle("گوشت مرغ")).toBe("food");
  });

  it("maps Farsi supermarket as snack", () => {
    expect(guessCategoryFromTitle("سوپرمارکت")).toBe("snack");
    expect(guessCategoryFromTitle("اسنپ مارکت")).toBe("snack");
  });

  it("maps common drinks (Farsi)", () => {
    expect(guessCategoryFromTitle("نوشابه")).toBe("drink");
    expect(guessCategoryFromTitle("کوکاکولا")).toBe("drink");
    expect(guessCategoryFromTitle("زهرماری")).toBe("drink");
  });

  it("maps transportation", () => {
    expect(guessCategoryFromTitle("Ticket")).toBe("transport");
    expect(guessCategoryFromTitle("bus to work")).toBe("transport");
    expect(guessCategoryFromTitle("Uber")).toBe("transport");
  });

  it("maps common Farsi transportation words", () => {
    expect(guessCategoryFromTitle("بلیط مترو")).toBe("transport");
    expect(guessCategoryFromTitle("اسنپ")).toBe("transport");
    expect(guessCategoryFromTitle("بنزین")).toBe("transport");
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

  it("maps common Farsi home words", () => {
    expect(guessCategoryFromTitle("اجاره فروردین")).toBe("home");
    expect(guessCategoryFromTitle("قبض برق")).toBe("home");
    expect(guessCategoryFromTitle("اینترنت")).toBe("home");
    expect(guessCategoryFromTitle("قبض آب")).toBe("home");
  });

  it("returns null when empty or no match", () => {
    expect(guessCategoryFromTitle("")).toBeNull();
    expect(guessCategoryFromTitle("   ")).toBeNull();
    expect(guessCategoryFromTitle("misc")).toBeNull();
  });
});
