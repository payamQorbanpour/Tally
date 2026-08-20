import { describe, expect, it } from "vitest";
import { planWebAlert } from "./alertPlan";

describe("planWebAlert", () => {
  it("joins title and message into one block of text", () => {
    expect(planWebAlert("Title", "Body")).toEqual({
      kind: "alert",
      text: "Title\n\nBody",
      acceptIndex: null,
    });
  });

  it("uses whichever of title/message is present", () => {
    expect(planWebAlert("Title").text).toBe("Title");
    expect(planWebAlert("", "Body").text).toBe("Body");
    expect(planWebAlert("  ", "  ").text).toBe("");
  });

  it("treats no buttons as a bare acknowledgement", () => {
    expect(planWebAlert("T", "B", [])).toEqual({
      kind: "alert",
      text: "T\n\nB",
      acceptIndex: null,
    });
  });

  it("runs the only button's action after acknowledgement", () => {
    expect(planWebAlert("T", undefined, [{ text: "OK" }])).toEqual({
      kind: "alert",
      text: "T",
      acceptIndex: 0,
    });
  });

  it("maps an accept/cancel pair onto confirm, in either order", () => {
    expect(
      planWebAlert("T", undefined, [{ text: "Cancel", style: "cancel" }, { text: "Delete" }]),
    ).toEqual({ kind: "confirm", text: "T", acceptIndex: 1, cancelIndex: 0 });

    expect(
      planWebAlert("T", undefined, [{ text: "Delete" }, { text: "Cancel", style: "cancel" }]),
    ).toEqual({ kind: "confirm", text: "T", acceptIndex: 0, cancelIndex: 1 });
  });

  it("treats the first of two unstyled buttons as the dismissive one", () => {
    expect(planWebAlert("T", undefined, [{ text: "Later" }, { text: "Now" }])).toEqual({
      kind: "confirm",
      text: "T",
      acceptIndex: 1,
      cancelIndex: 0,
    });
  });

  // Firing a button the user never picked is worse than firing none — with
  // three choices there is no honest mapping onto confirm's two answers.
  it("runs no action at all when there are more choices than confirm can offer", () => {
    expect(
      planWebAlert("T", undefined, [
        { text: "A" },
        { text: "B" },
        { text: "Cancel", style: "cancel" },
      ]),
    ).toEqual({ kind: "alert", text: "T", acceptIndex: null });
  });
});
