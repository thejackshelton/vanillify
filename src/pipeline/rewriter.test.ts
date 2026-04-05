import { describe, it, expect } from "vite-plus/test";
import { rewrite } from "./rewriter";
import { parse } from "./parser";
import { extract } from "./extractor";
import { assignNames } from "./namer";
import { createVariantObject } from "../variants/resolver";
import type { Warning } from "../types";
import type { VariantObject } from "@unocss/core";

/**
 * Helper: run parse -> extract -> assignNames for a source, then call rewrite.
 * This ensures span offsets are always correct (from the actual parser).
 */
async function rewriteFromSource(
  source: string,
  filename = "test.tsx",
  customVariants?: VariantObject[],
) {
  const { program } = parse(filename, source);
  const { entries, warnings } = extract(program, source);
  const nameMap = assignNames(entries);
  return rewrite(source, entries, nameMap, warnings, customVariants);
}

describe("rewrite", () => {
  it("replaces static className with indexed name in source", async () => {
    const source = '<div className="flex items-center">hi</div>';
    const result = await rewriteFromSource(source);

    expect(result.component).toContain('"node0"');
    expect(result.component).not.toContain("flex items-center");
  });

  it("generates CSS with .nodeN selector", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("display");
    expect(result.css).toContain("padding");
  });

  it("leaves dynamic className expressions unchanged in source", async () => {
    const source = '<div className={active ? "bg-blue-500" : "bg-gray-500"}>hi</div>';
    const result = await rewriteFromSource(source);

    // Dynamic expressions should remain unchanged
    expect(result.component).toContain('active ? "bg-blue-500" : "bg-gray-500"');
  });

  it("handles multiple nodes with separate CSS blocks", async () => {
    const source = '<div className="flex"><span className="text-sm">hi</span></div>';
    const result = await rewriteFromSource(source);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
    expect(result.component).toContain('"node0"');
    expect(result.component).toContain('"node1"');
  });

  it("preserves extraction warnings in output", async () => {
    const warnings: Warning[] = [
      {
        type: "dynamic-class",
        message: "Dynamic expression at 1:15",
        location: { line: 1, column: 15 },
      },
    ];

    const result = await rewrite("<div>hi</div>", [], new Map(), warnings);

    expect(result.warnings).toContain(warnings[0]);
  });

  it("handles hover variant producing :hover in CSS", async () => {
    const source = '<button className="bg-blue-500 hover:bg-blue-700">click</button>';
    const result = await rewriteFromSource(source);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain(":hover");
  });

  it("returns empty CSS for source with no class attributes", async () => {
    const source = '<div id="test">no classes</div>';
    const result = await rewriteFromSource(source);

    expect(result.component).toBe(source);
    expect(result.css).toBe("");
    expect(result.warnings).toHaveLength(0);
  });

  it("rewrite with customVariants produces CSS containing custom variant selector", async () => {
    const source = '<div className="bg-blue-500 ui-checked:bg-green-500">test</div>';
    const customVariants = [createVariantObject("ui-checked", "&[ui-checked]")];
    const result = await rewriteFromSource(source, "test.tsx", customVariants);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("background");
    // ui-checked:bg-green-500 should NOT be in unmatched warnings
    const unmatchedNames = result.warnings
      .filter((w) => w.type === "unmatched-class")
      .map((w) => w.message);
    expect(unmatchedNames.join()).not.toContain("ui-checked:bg-green-500");
  });
});

describe("rewrite with theme support", () => {
  it("rewrite threads themeConfig to generateCSS", async () => {
    const source = 'export function Card() { return <div className="bg-brand p-4">hi</div>; }';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, undefined, { colors: { brand: "#ff0000" } });

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("background");
    expect(result.css).toContain("padding");
  });

  it("rewrite returns themeCss field", async () => {
    const source = '<div className="bg-brand">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, undefined, { colors: { brand: "#ff0000" } });

    expect(result.themeCss).toBeDefined();
    expect(typeof result.themeCss).toBe("string");
  });

  it("rewrite without themeConfig returns preset default themeCss (not custom)", async () => {
    const source = '<div className="flex">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings);

    // UnoCSS preset-wind4 always emits a default theme layer with CSS variables
    // When no custom themeConfig is provided, this is the preset's default
    expect(typeof result.themeCss).toBe("string");
  });
});

describe("convert() theme integration", () => {
  it("convert without themeCss produces same output as before (THEME-10)", async () => {
    const { convert } = await import("../index");
    const source = 'export function App() { return <div className="flex p-4">hi</div>; }';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("node0");
    expect(result.css).toContain("display");
    expect(result.css).toContain("padding");
    // themeCss is always a string (preset-wind4 emits default :root variables)
    expect(typeof result.themeCss).toBe("string");
    // No theme-related warnings when no themeCss option provided
    const themeWarnings = result.warnings.filter(
      (w) => w.type === "unknown-theme-namespace" || w.type === "theme-parse-error"
    );
    expect(themeWarnings).toHaveLength(0);
  });

  it("convert with themeCss produces theme-aware CSS", async () => {
    const { convert } = await import("../index");
    const source = 'export function App() { return <div className="bg-brand p-4">hi</div>; }';
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: #ff0000; }",
    });

    expect(result.css).toContain("background");
    expect(result.css).toContain("padding");
    // bg-brand should NOT be unmatched
    const unmatchedMsgs = result.warnings
      .filter((w) => w.type === "unmatched-class")
      .map((w) => w.message);
    expect(unmatchedMsgs.join()).not.toContain("bg-brand");
  });

  it("convert with themeCss returns theme CSS variables in result (THEME-06)", async () => {
    const { convert } = await import("../index");
    const source = '<div className="bg-brand">hi</div>';
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: #ff0000; }",
    });

    expect(result.themeCss).toBeDefined();
    expect(typeof result.themeCss).toBe("string");
  });

  it("two convert calls with different themeCss produce different output (THEME-05)", async () => {
    const { convert } = await import("../index");
    const { resetGenerator } = await import("./generator");
    resetGenerator();

    const source = '<div className="bg-brand">hi</div>';
    const result1 = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: #ff0000; }",
    });
    const result2 = await convert(source, "test.tsx", {
      themeCss: "@theme { --color-brand: #00ff00; }",
    });

    // UnoCSS utility CSS uses CSS variables (color-mix), so utility CSS is identical.
    // The difference is in themeCss which contains the :root variable definitions.
    expect(result1.themeCss).not.toBe(result2.themeCss);
  });

  it("convert with unknown theme namespace includes warning", async () => {
    const { convert } = await import("../index");
    const source = '<div className="flex">hi</div>';
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { --unknown-thing: value; }",
    });

    const nsWarnings = result.warnings.filter((w) => w.type === "unknown-theme-namespace");
    expect(nsWarnings.length).toBeGreaterThanOrEqual(1);
  });

  it("convert with malformed theme declaration includes warning", async () => {
    const { convert } = await import("../index");
    const source = '<div className="flex">hi</div>';
    const result = await convert(source, "test.tsx", {
      themeCss: "@theme { not-a-declaration; }",
    });

    const parseWarnings = result.warnings.filter((w) => w.type === "theme-parse-error");
    expect(parseWarnings.length).toBeGreaterThanOrEqual(1);
  });
});
