import { defineConfig } from "vite-plus";

// NOTE: MagicRegExpTransformPlugin is incompatible with Rolldown's TS pipeline
// (this.parse() runs before TypeScript is stripped, causing parse errors on
// `import type` and type assertions). magic-regexp works at runtime (~2KB) as
// a fallback -- the createRegExp calls return native RegExp objects.
// See: .planning/phases/05-code-quality/05-RESEARCH.md Open Question 1

export default defineConfig({
  pack: {
    entry: ["./src/index.ts", "./src/cli.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
  lint: {
    ignorePatterns: ["dist/**", "fixtures/**", "node_modules/**"],
  },
  fmt: {
    ignorePatterns: ["dist/**", "fixtures/**", "node_modules/**"],
  },
});
