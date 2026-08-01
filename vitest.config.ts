import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Edge Function helpers are plain TypeScript with no Deno imports, so
    // they run under Node here. Anything importing `npm:` or `Deno.*` must
    // stay out of a `.test.ts`-adjacent module.
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});
