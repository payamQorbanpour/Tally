import { describe, expect, it } from "vitest";
import {
  parseProviderOrder,
  resolveCompletionBudget,
  resolveModel,
  resolveProviderOrder,
} from "./aiProviders";

/** Config map built from a plain object, mirroring what `resolveConfig` returns. */
function cfg(entries: Record<string, unknown> = {}): Map<string, unknown> {
  return new Map(Object.entries(entries));
}

/** Env lookup backed by a plain object; unset names return "" like `env()` does. */
function envFrom(vars: Record<string, string> = {}): (name: string) => string {
  return (name) => vars[name] ?? "";
}

describe("parseProviderOrder", () => {
  it("parses a comma-separated list in order", () => {
    expect(parseProviderOrder("groq,gemini")).toEqual(["groq", "gemini"]);
  });

  it("tolerates whitespace and casing", () => {
    expect(parseProviderOrder("  GEMINI , groq ")).toEqual(["gemini", "groq"]);
  });

  it("drops unknown names instead of failing", () => {
    expect(parseProviderOrder("gemini,nope,groq")).toEqual(["gemini", "groq"]);
  });

  it("collapses a repeated provider to its first occurrence", () => {
    expect(parseProviderOrder("groq,gemini,groq")).toEqual(["groq", "gemini"]);
  });

  it("returns empty when nothing is recognisable", () => {
    expect(parseProviderOrder("  ,,typo ")).toEqual([]);
  });
});

describe("resolveProviderOrder", () => {
  it("defaults text to groq then gemini", () => {
    expect(resolveProviderOrder(cfg(), "text")).toEqual(["groq", "gemini"]);
  });

  it("defaults image to gemini then groq", () => {
    expect(resolveProviderOrder(cfg(), "image")).toEqual(["gemini", "groq"]);
  });

  it("honours a configured text order", () => {
    const config = cfg({ ai_provider_order_text: "gemini,groq" });
    expect(resolveProviderOrder(config, "text")).toEqual(["gemini", "groq"]);
  });

  it("honours a configured image order", () => {
    const config = cfg({ ai_provider_order_image: "groq" });
    expect(resolveProviderOrder(config, "image")).toEqual(["groq"]);
  });

  it("falls back to the default when the configured order is unusable", () => {
    const config = cfg({ ai_provider_order_text: "typo,alsotypo" });
    expect(resolveProviderOrder(config, "text")).toEqual(["groq", "gemini"]);
  });

  it("does not let one path's key affect the other", () => {
    const config = cfg({ ai_provider_order_text: "gemini" });
    expect(resolveProviderOrder(config, "image")).toEqual(["gemini", "groq"]);
  });
});

describe("resolveModel", () => {
  const env = envFrom({
    AI_MODEL: "openai/gpt-oss-120b",
    AI_RECEIPT_MODEL: "qwen/qwen3.6-27b",
    GEMINI_MODEL: "gemini-flash-latest",
    OPENAI_RECEIPT_MODEL: "gpt-4o-mini",
  });

  it("uses AI_MODEL for groq text", () => {
    expect(resolveModel("groq", "text", cfg(), env)).toBe("openai/gpt-oss-120b");
  });

  it("uses AI_RECEIPT_MODEL for groq image", () => {
    expect(resolveModel("groq", "image", cfg(), env)).toBe("qwen/qwen3.6-27b");
  });

  it("falls back to AI_MODEL when AI_RECEIPT_MODEL is unset", () => {
    const partial = envFrom({ AI_MODEL: "openai/gpt-oss-120b" });
    expect(resolveModel("groq", "image", cfg(), partial)).toBe("openai/gpt-oss-120b");
  });

  it("prefers ai_model config over AI_MODEL env", () => {
    const config = cfg({ ai_model: "from-config" });
    expect(resolveModel("groq", "text", config, env)).toBe("from-config");
  });

  it("prefers ai_receipt_model config over AI_RECEIPT_MODEL env", () => {
    const config = cfg({ ai_receipt_model: "vision-from-config" });
    expect(resolveModel("groq", "image", config, env)).toBe("vision-from-config");
  });

  it("uses GEMINI_MODEL for gemini, for both kinds", () => {
    expect(resolveModel("gemini", "text", cfg(), env)).toBe("gemini-flash-latest");
    expect(resolveModel("gemini", "image", cfg(), env)).toBe("gemini-flash-latest");
  });

  it("prefers ai_gemini_model config over GEMINI_MODEL env", () => {
    const config = cfg({ ai_gemini_model: "gemini-from-config" });
    expect(resolveModel("gemini", "text", config, env)).toBe("gemini-from-config");
  });

  it("falls back to a literal default when gemini env is unset", () => {
    expect(resolveModel("gemini", "text", cfg(), envFrom())).toBe("gemini-flash-latest");
  });

  it("uses OPENAI_RECEIPT_MODEL for openai", () => {
    expect(resolveModel("openai", "text", cfg(), env)).toBe("gpt-4o-mini");
  });
});

describe("resolveCompletionBudget", () => {
  it("gives parse-description a budget that fits under an 8000 TPM limit", () => {
    expect(resolveCompletionBudget("parse-description", cfg())).toBe(2048);
  });

  it("gives classify-category the smallest budget", () => {
    expect(resolveCompletionBudget("classify-category", cfg())).toBe(512);
  });

  it("keeps the full budget for parse-receipt", () => {
    expect(resolveCompletionBudget("parse-receipt", cfg())).toBe(8192);
  });

  it("gives an unmapped action the small default, never 8192", () => {
    expect(resolveCompletionBudget("some-future-action", cfg())).toBe(2048);
  });

  it("clamps down to the configured ceiling", () => {
    const config = cfg({ ai_max_completion_tokens: 1024 });
    expect(resolveCompletionBudget("parse-receipt", config)).toBe(1024);
    expect(resolveCompletionBudget("parse-description", config)).toBe(1024);
  });

  it("never raises a budget above its per-action default", () => {
    const config = cfg({ ai_max_completion_tokens: 100000 });
    expect(resolveCompletionBudget("classify-category", config)).toBe(512);
  });

  it("ignores a ceiling that is not a positive integer", () => {
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: 0 }))).toBe(2048);
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: -5 }))).toBe(2048);
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: "1024" }))).toBe(2048);
  });
});
