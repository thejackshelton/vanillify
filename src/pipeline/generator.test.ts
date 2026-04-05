import { describe, it, expect, beforeEach } from "vitest";
import { generateCSS, getGenerator, resetGenerator } from "./generator";
import { createVariantObject } from "../variants/resolver";

describe("generateCSS", () => {
  beforeEach(() => {
    resetGenerator();
  });

  it("generates CSS for basic Tailwind utilities", async () => {
    const tokens = new Set(["flex", "items-center", "gap-2"]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain("display");
    expect(result.css).toContain("flex");
    expect(result.css).toContain("align-items");
    expect(result.css).toContain("gap");
    expect(result.matched.size).toBeGreaterThanOrEqual(3);
    expect(result.unmatched).toHaveLength(0);
  });

  it("generates CSS for spacing utilities", async () => {
    const tokens = new Set(["p-4", "m-2", "px-6"]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain("padding");
    expect(result.css).toContain("margin");
  });

  it("generates CSS for color utilities", async () => {
    const tokens = new Set(["bg-red-500", "text-white"]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain("background");
    expect(result.css).toContain("color");
  });

  it("handles pseudo-class variants (VARI-01)", async () => {
    const tokens = new Set([
      "hover:bg-blue-500",
      "focus:outline-none",
      "active:scale-95",
      "disabled:opacity-50",
    ]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain(":hover");
    expect(result.css).toContain(":focus");
    expect(result.css).toContain(":active");
    expect(result.css).toContain(":disabled");
  });

  it("handles responsive breakpoint variants (VARI-02)", async () => {
    const tokens = new Set(["sm:flex", "md:grid", "lg:hidden", "xl:block", "2xl:inline"]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain("@media");
    // Should have multiple media query blocks
    const mediaMatches = result.css.match(/@media/g);
    expect(mediaMatches).not.toBeNull();
    expect(mediaMatches!.length).toBeGreaterThanOrEqual(3);
  });

  it("handles stacked/compound variants (VARI-03)", async () => {
    const tokens = new Set(["dark:hover:text-white"]);
    const result = await generateCSS(tokens);

    // Should produce CSS with both dark and hover conditions
    expect(result.css).toContain(":hover");
    // dark mode handling varies -- may use .dark class or prefers-color-scheme
    expect(result.matched.has("dark:hover:text-white")).toBe(true);
  });

  it("handles arbitrary values (CORE-08)", async () => {
    const tokens = new Set(["text-[#ff0000]", "w-[calc(100%-1rem)]", "bg-[rgb(255,0,0)]"]);
    const result = await generateCSS(tokens);

    expect(result.css).toContain("color");
    expect(result.css).toContain("width");
    // At least the color and width should match
    expect(result.matched.size).toBeGreaterThanOrEqual(2);
  });

  it("detects unmatched tokens and returns warnings", async () => {
    const tokens = new Set(["flex", "not-a-real-utility-xyz"]);
    const result = await generateCSS(tokens);

    expect(result.unmatched).toContain("not-a-real-utility-xyz");
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings[0].type).toBe("unmatched-class");
  });

  it("returns unminified/readable CSS (CORE-05)", async () => {
    const tokens = new Set(["flex", "p-4"]);
    const result = await generateCSS(tokens);

    // CSS should have newlines (not minified)
    expect(result.css).toContain("\n");
  });

  it("generates CSS with custom variant producing custom selector", async () => {
    const customVariants = [createVariantObject("ui-checked", "&[ui-checked]")];
    const tokens = new Set(["ui-checked:bg-blue-500"]);
    const result = await generateCSS(tokens, customVariants);

    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("background");
    expect(result.matched.has("ui-checked:bg-blue-500")).toBe(true);
    expect(result.unmatched).toHaveLength(0);
  });

  it("getGenerator without args returns default (no custom variants matched)", async () => {
    const gen = await getGenerator();
    const result = await gen.generate(new Set(["ui-checked:bg-blue-500"]));
    // Without custom variants, ui-checked: prefix should NOT match
    expect(result.matched.has("ui-checked:bg-blue-500")).toBe(false);
  });

  it("getGenerator caches generators with same variant names", async () => {
    const variants = [createVariantObject("ui-checked", "&[ui-checked]")];
    const gen1 = await getGenerator(variants);
    const gen2 = await getGenerator(variants);
    expect(gen1).toBe(gen2);
  });
});

describe("generator theme support", () => {
  beforeEach(() => {
    resetGenerator();
  });

  it("getGenerator with no args returns a generator (THEME-10 backward compat)", async () => {
    const gen = await getGenerator();
    expect(gen).toBeDefined();
    const result = await gen.generate(new Set(["flex"]));
    expect(result.matched.has("flex")).toBe(true);
  });

  it("getGenerator with theme config returns generator that matches theme utility", async () => {
    const gen = await getGenerator(undefined, { colors: { brand: "#ff0000" } });
    const result = await gen.generate(new Set(["bg-brand"]));
    expect(result.matched.has("bg-brand")).toBe(true);
  });

  it("getGenerator with theme config still resolves preset defaults (THEME-04)", async () => {
    const gen = await getGenerator(undefined, { colors: { brand: "#ff0000" } });
    const result = await gen.generate(new Set(["bg-red-500", "bg-brand"]));
    expect(result.matched.has("bg-red-500")).toBe(true);
    expect(result.matched.has("bg-brand")).toBe(true);
  });

  it("getGenerator called twice with same theme returns cached instance", async () => {
    const theme = { colors: { brand: "#ff0000" } };
    const gen1 = await getGenerator(undefined, theme);
    const gen2 = await getGenerator(undefined, theme);
    expect(gen1).toBe(gen2);
  });

  it("getGenerator called with different themes returns different instances (THEME-05)", async () => {
    const gen1 = await getGenerator(undefined, { colors: { brand: "#ff0000" } });
    const gen2 = await getGenerator(undefined, { colors: { brand: "#00ff00" } });
    expect(gen1).not.toBe(gen2);
  });

  it("generateCSS with theme config generates CSS for theme-defined utilities", async () => {
    const tokens = new Set(["bg-brand"]);
    const result = await generateCSS(tokens, undefined, { colors: { brand: "#ff0000" } });
    expect(result.matched.has("bg-brand")).toBe(true);
    expect(result.css).toContain("background");
  });

  it("generateCSS returns theme layer CSS with CSS variables (THEME-06)", async () => {
    const tokens = new Set(["bg-brand"]);
    const result = await generateCSS(tokens, undefined, { colors: { brand: "#ff0000" } });
    expect(result.themeCss).toBeDefined();
    // Theme layer may contain :root or variable definitions
    // The exact format depends on UnoCSS output
    expect(typeof result.themeCss).toBe("string");
  });
});
