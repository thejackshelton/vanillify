import { describe, it, expect } from "vite-plus/test";
import { parseThemeCss } from "./parser";

describe("parseThemeCss", () => {
  it("extracts declarations from @theme block", () => {
    const result = parseThemeCss("@theme { --color-brand: #ff0000; }");
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "#ff0000" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("handles bare declarations without @theme wrapper", () => {
    const result = parseThemeCss("--color-brand: #ff0000;");
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "#ff0000" },
    ]);
  });

  it("strips CSS comments correctly", () => {
    const result = parseThemeCss(
      "@theme { /* comment */ --color-brand: #ff0000; }",
    );
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "#ff0000" },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("handles duplicates with last-wins semantics", () => {
    const result = parseThemeCss(
      "@theme { --color-brand: red; --color-brand: blue; }",
    );
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "blue" },
    ]);
  });

  it("emits warning for malformed lines and still parses valid declarations", () => {
    const result = parseThemeCss(
      "@theme { malformed line; --color-brand: #ff0000; }",
    );
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "#ff0000" },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("theme-parse-error");
    expect(result.warnings[0].message).toContain("malformed line");
  });

  it("handles complex values with special characters", () => {
    const result = parseThemeCss(
      "@theme { --color-brand: oklch(63.7% 0.237 25.331); }",
    );
    expect(result.declarations).toEqual([
      { property: "--color-brand", value: "oklch(63.7% 0.237 25.331)" },
    ]);
  });

  it("handles bare namespace (no name suffix)", () => {
    const result = parseThemeCss("@theme { --spacing: 0.5rem; }");
    expect(result.declarations).toEqual([
      { property: "--spacing", value: "0.5rem" },
    ]);
  });

  it("returns empty declarations and no warnings for empty input", () => {
    const result = parseThemeCss("");
    expect(result.declarations).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("emits warning for @theme reset (initial) and skips the declaration", () => {
    const result = parseThemeCss("@theme { --color-brand: initial; }");
    expect(result.declarations).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("unsupported-theme-reset");
    expect(result.warnings[0].message).toContain("--color-brand");
  });
});
