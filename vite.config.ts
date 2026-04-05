import { defineConfig } from "vite-plus";
import { MagicRegExpTransformPlugin } from "magic-regexp/transform";

export default defineConfig({
  pack: {
    entry: ["./src/index.ts", "./src/cli.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    plugins: [MagicRegExpTransformPlugin.rollup()],
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
