import { describe, it, expect, beforeEach } from "vitest";
import { twGenerateCSS, resetTwGenerator, _cache } from "./tw-generator";

describe("ENG-01: compile().build() CSS generation", () => {
  it("generates CSS for standard utility classes", async () => {
    const result = await twGenerateCSS(
      new Set(["flex", "p-4", "bg-blue-500"]),
    );

    expect(result.css).toContain(".flex");
    expect(result.css).toContain("display: flex");
    expect(result.css).toContain(".p-4");
    expect(result.css).toContain(".bg-blue-500");
    expect(result.matched).toContain("flex");
    expect(result.matched).toContain("p-4");
    expect(result.matched).toContain("bg-blue-500");
    expect(result.unmatched).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("detects unmatched classes", async () => {
    const result = await twGenerateCSS(
      new Set(["flex", "not-a-real-class"]),
    );

    expect(result.matched).toContain("flex");
    expect(result.unmatched).toContain("not-a-real-class");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("unmatched-class");
    expect(result.warnings[0].message).toContain("not-a-real-class");
  });

  it("handles hover variant", async () => {
    const result = await twGenerateCSS(
      new Set(["hover:bg-blue-600"]),
    );

    // Tailwind v4 uses CSS nesting -- just verify output is generated
    expect(result.css).toContain("hover");
    expect(result.css).toContain("bg-blue-600");
    expect(result.matched.size).toBeGreaterThan(0);
  });
});

describe("ENG-02: virtual loadStylesheet", () => {
  it("resolves @import 'tailwindcss' without filesystem during compile", async () => {
    // If virtual resolution fails, twGenerateCSS would throw
    const result = await twGenerateCSS(new Set(["flex"]));
    expect(result.css).toContain(".flex");
  });
});

describe("ENG-03: source(none) isolation", () => {
  beforeEach(() => {
    resetTwGenerator();
  });

  it("only generates CSS for passed candidates", async () => {
    // Fresh compiler -- no cumulative build() state from other tests
    const result = await twGenerateCSS(new Set(["flex"]));

    // Should contain only the flex utility, not other random utilities
    // from file scanning
    expect(result.css).toContain(".flex");
    // Count top-level selectors -- should be minimal (only .flex)
    const selectorCount = (result.css.match(/^\s*\.[^\s{]+\s*\{/gm) || [])
      .length;
    expect(selectorCount).toBe(1);
  });
});

describe("ENG-04: compiler caching", () => {
  beforeEach(() => {
    resetTwGenerator();
  });

  it("caches result for identical input (cssInput + candidates)", async () => {
    await twGenerateCSS(new Set(["flex"]));
    await twGenerateCSS(new Set(["flex"]));

    // Same CSS input AND same candidates -- should reuse cached result
    expect(_cache.size).toBe(1);
  });

  it("creates separate cache entries for different candidates", async () => {
    await twGenerateCSS(new Set(["flex"]));
    await twGenerateCSS(new Set(["p-4"]));

    // Same CSS input but different candidates -- separate entries for isolation
    expect(_cache.size).toBe(2);
  });

  it("creates new compiler for different CSS input", async () => {
    await twGenerateCSS(new Set(["flex"]));
    await twGenerateCSS(
      new Set(["flex"]),
      undefined,
      "@theme { --color-brand: #ff0000; }",
    );

    // Different CSS input due to themeCss -- two compilers cached
    expect(_cache.size).toBe(2);
  });

  it("resetTwGenerator clears cache", async () => {
    await twGenerateCSS(new Set(["flex"]));
    expect(_cache.size).toBe(1);

    resetTwGenerator();
    expect(_cache.size).toBe(0);
  });
});

describe("ENG-05: CSS layer separation", () => {
  it("separates theme variables from utility CSS", async () => {
    const result = await twGenerateCSS(new Set(["flex", "p-4"]));

    // Theme CSS should contain :root or :host with CSS variables
    expect(result.themeCss).toMatch(/:root|:host/);
    expect(result.themeCss).toContain("--");

    // Utility CSS should contain selectors, not @layer wrappers
    expect(result.css).toContain(".flex");
    expect(result.css).toContain(".p-4");
    expect(result.css).not.toContain("@layer theme");
    expect(result.css).not.toContain("@layer utilities");
  });

  it("handles @theme block input", async () => {
    const result = await twGenerateCSS(
      new Set(["bg-brand"]),
      undefined,
      "@theme { --color-brand: #ff0000; }",
    );

    // bg-brand should resolve with the custom color
    expect(result.css).toContain(".bg-brand");
    expect(result.matched).toContain("bg-brand");
    expect(result.unmatched).toEqual([]);
  });
});

describe("edge cases", () => {
  it("handles empty token set", async () => {
    const result = await twGenerateCSS(new Set());

    expect(result.css).toBe("");
    expect(result.unmatched).toEqual([]);
    expect(result.matched.size).toBe(0);
    expect(result.warnings).toEqual([]);
  });

  it("handles custom variant CSS", async () => {
    const result = await twGenerateCSS(
      new Set(["pointer-coarse:p-4"]),
      "@custom-variant pointer-coarse (@media (pointer: coarse));",
    );

    // Custom variant should produce CSS output
    expect(result.css).toBeTruthy();
    expect(result.matched.size).toBeGreaterThan(0);
  });
});

describe("Codex review fixes", () => {
  beforeEach(() => {
    resetTwGenerator();
  });

  it("build() cumulative state does not leak matched classes or CSS between calls", async () => {
    // First call generates flex
    const result1 = await twGenerateCSS(new Set(["flex"]));
    expect(result1.matched).toContain("flex");
    expect(result1.css).toContain(".flex");

    // Second call with p-4 only — should NOT contain flex in matched OR css
    const result2 = await twGenerateCSS(new Set(["p-4"]));
    expect(result2.matched).toContain("p-4");
    expect(result2.matched).not.toContain("flex");
    expect(result2.css).toContain(".p-4");
    expect(result2.css).not.toContain(".flex");
    expect(result2.unmatched).toEqual([]);
  });

  it("handles escaped selectors like 2xl: variant", async () => {
    const result = await twGenerateCSS(new Set(["2xl:grid"]));

    expect(result.matched).toContain("2xl:grid");
    expect(result.unmatched).toEqual([]);
  });

  it("utility CSS does not contain @property or @layer properties blocks", async () => {
    // content-['x'] triggers @property blocks in Tailwind output
    const result = await twGenerateCSS(
      new Set(["flex", "p-4", "before:content-['x']"]),
    );

    expect(result.css).not.toContain("@property");
    expect(result.css).not.toContain("@layer properties");
    expect(result.css).toContain(".flex");
    // Verify content utility is not truncated by quote handling
    expect(result.css).toContain("content-");
    expect(result.css).toContain("--tw-content");
  });

  it("handles arbitrary values with literal braces in content", async () => {
    // content-["}"] produces --tw-content: "}" which has braces inside quotes
    const result = await twGenerateCSS(
      new Set(["flex", "before:content-[\"}\"]"]),
    );

    // Should not break layer extraction — flex must still appear
    expect(result.css).toContain(".flex");
    expect(result.css).not.toContain("@layer");
  });
});
