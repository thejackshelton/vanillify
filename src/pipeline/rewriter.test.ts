import { describe, it, expect } from "vitest";
import { rewrite } from "./rewriter";
import { parse } from "./parser";
import { extract } from "./extractor";
import { assignNames } from "./namer";
import { convert } from "../index";
import type { OutputFormat, Warning } from "../types";

/**
 * Helper: run parse -> extract -> assignNames for a source, then call rewrite.
 * This ensures span offsets are always correct (from the actual parser).
 */
async function rewriteFromSource(
  source: string,
  filename = "test.tsx",
  css?: string,
  outputFormat?: OutputFormat,
) {
  const { program } = parse(filename, source);
  const { entries, warnings, unresolvableContainers } = extract(program, source);
  const nameMap = assignNames(entries);
  return rewrite(source, entries, nameMap, warnings, css, outputFormat, filename, unresolvableContainers);
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

  it("rewrites string literals inside dynamic className expressions", async () => {
    const source = '<div className={active ? "bg-blue-500" : "bg-gray-500"}>hi</div>';
    const result = await rewriteFromSource(source);

    // Both branches should be rewritten to scoped names
    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    expect(result.component).not.toContain("bg-blue-500");
    expect(result.component).not.toContain("bg-gray-500");
    // Ternary structure preserved
    expect(result.component).toContain("active ?");
  });

  it("preserves zero-match fragment strings in source (DYN-07)", async () => {
    const source = '<div className={cond ? "flex" : "not-a-utility"}>hi</div>';
    const result = await rewriteFromSource(source);

    expect(result.component).toContain("node0"); // flex -> node0
    expect(result.component).toContain('"not-a-utility"'); // unchanged
    expect(result.component).toContain("cond ?"); // ternary preserved
  });

  it("emits no warning for fully-rewritten expression (DYN-08)", async () => {
    const source = '<div className={cond ? "flex gap-4" : "hidden"}>hi</div>';
    const result = await rewriteFromSource(source);

    const dynamicWarnings = result.warnings.filter(w => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(0);
  });

  it("emits warning for partially-rewritten expression with variable ref (DYN-08)", async () => {
    const source = '<div className={cond ? "flex" : myVar}>hi</div>';
    const result = await rewriteFromSource(source);

    const dynamicWarnings = result.warnings.filter(w => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(1);
    expect(dynamicWarnings[0].message).toContain("Partially rewritten");
    expect(dynamicWarnings[0].message).toContain("1 fragment(s) rewritten");
  });

  it("handles multiple fragment replacements without offset drift", async () => {
    const source = '<div className={a ? "flex gap-4" : "hidden p-2"}>hi</div>';
    const result = await rewriteFromSource(source);

    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    expect(result.component).not.toContain("flex gap-4");
    expect(result.component).not.toContain("hidden p-2");
    // Both have generated CSS
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
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

  it("rewrite with @custom-variant css produces CSS containing custom variant selector", async () => {
    const source = '<div className="bg-blue-500 ui-checked:bg-green-500">test</div>';
    const css = "@custom-variant ui-checked (&[ui-checked]);";
    const result = await rewriteFromSource(source, "test.tsx", css);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("background");
    // ui-checked:bg-green-500 should NOT be in unmatched warnings
    const unmatchedNames = result.warnings
      .filter((w: Warning) => w.type === "unmatched-class")
      .map((w: Warning) => w.message);
    expect(unmatchedNames.join()).not.toContain("ui-checked:bg-green-500");
  });
});

describe("rewrite with theme support", () => {
  it("rewrite threads css to generateCSS", async () => {
    const source = 'export function Card() { return <div className="bg-brand p-4">hi</div>; }';
    const css = "@theme { --color-brand: #ff0000; }";
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, css);

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("background");
    expect(result.css).toContain("padding");
  });

  it("rewrite returns themeCss field", async () => {
    const source = '<div className="bg-brand">hi</div>';
    const css = "@theme { --color-brand: #ff0000; }";
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, css);

    expect(result.themeCss).toBeDefined();
    expect(typeof result.themeCss).toBe("string");
  });

  it("rewrite without css returns preset default themeCss (not custom)", async () => {
    const source = '<div className="flex">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings);

    // Tailwind always emits a default theme layer with CSS variables
    // When no custom css is provided, this is the preset's default
    expect(typeof result.themeCss).toBe("string");
  });
});

describe("convert() theme integration", () => {
  it("convert without css produces same output as before (THEME-10)", async () => {
    const source = 'export function App() { return <div className="flex p-4">hi</div>; }';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("node0");
    expect(result.css).toContain("display");
    expect(result.css).toContain("padding");
    // themeCss is always a string (Tailwind emits default :root variables)
    expect(typeof result.themeCss).toBe("string");
    // No theme-related warnings when no css option provided
    const themeWarnings = result.warnings.filter(
      (w) => w.type === "theme-parse-error"
    );
    expect(themeWarnings).toHaveLength(0);
  });

  it("convert with css produces theme-aware CSS", async () => {
    const source = 'export function App() { return <div className="bg-brand p-4">hi</div>; }';
    const result = await convert(source, "test.tsx", {
      css: "@theme { --color-brand: #ff0000; }",
    });

    expect(result.css).toContain("background");
    expect(result.css).toContain("padding");
    // bg-brand should NOT be unmatched
    const unmatchedMsgs = result.warnings
      .filter((w) => w.type === "unmatched-class")
      .map((w) => w.message);
    expect(unmatchedMsgs.join()).not.toContain("bg-brand");
  });

  it("convert with css option returns theme CSS variables in result (THEME-06)", async () => {
    const source = '<div className="bg-brand">hi</div>';
    const result = await convert(source, "test.tsx", {
      css: "@theme { --color-brand: #ff0000; }",
    });

    expect(result.themeCss).toBeDefined();
    expect(typeof result.themeCss).toBe("string");
  });

  it("two convert calls with different css produce different output (THEME-05)", async () => {
    const { resetTwGenerator } = await import("./generator");
    resetTwGenerator();

    const source = '<div className="bg-brand">hi</div>';
    const result1 = await convert(source, "test.tsx", {
      css: "@theme { --color-brand: #ff0000; }",
    });
    const result2 = await convert(source, "test.tsx", {
      css: "@theme { --color-brand: #00ff00; }",
    });

    // The difference is in themeCss which contains the :root variable definitions.
    expect(result1.themeCss).not.toBe(result2.themeCss);
  });

  it("convert with malformed theme declaration includes warning", async () => {
    const source = '<div className="flex">hi</div>';
    const result = await convert(source, "test.tsx", {
      css: "@theme { not-a-declaration; }",
    });

    const parseWarnings = result.warnings.filter((w) => w.type === "theme-parse-error");
    expect(parseWarnings.length).toBeGreaterThanOrEqual(1);
  });
});

describe("rewrite with css-modules format", () => {
  it("produces {styles.node0} instead of string literal", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.component).toContain("{styles.node0}");
    expect(result.component).not.toContain('"node0"');
  });

  it("prepends import styles from './test.module.css'", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.component).toContain("import styles from './test.module.css'");
  });

  it("inserts import AFTER existing imports", async () => {
    const source = `import { component$ } from "@qwik.dev/core";\n\nexport default component$(() => {\n  return <div className="flex p-4">hi</div>;\n});`;
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    const lines = result.component.split("\n");
    const qwikImportIdx = lines.findIndex((l: string) => l.includes("@qwik.dev/core"));
    const stylesImportIdx = lines.findIndex((l: string) => l.includes("import styles from"));
    expect(stylesImportIdx).toBeGreaterThan(qwikImportIdx);
    expect(stylesImportIdx).toBeLessThan(lines.findIndex((l: string) => l.includes("export")));
  });

  it("default (no outputFormat) produces same output as vanilla", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source, "test.tsx");

    expect(result.component).toContain('"node0"');
    expect(result.component).not.toContain("styles.");
    expect(result.component).not.toContain("import styles");
  });

  it("CSS content is identical between vanilla and css-modules", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const vanilla = await rewriteFromSource(source, "test.tsx");
    const modules = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(modules.css).toBe(vanilla.css);
  });

  it("rewrites string literal fragments from ternary expressions", async () => {
    const source = '<div className={active ? "bg-blue-500" : "bg-gray-500"}>hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    // Fragment entries are rewritten to indexed CSS module references
    expect(result.component).toContain('styles.node0');
    expect(result.component).toContain('styles.node1');
    expect(result.component).toContain('active ?');
  });

  it("returns classMap in result", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.classMap).toBeDefined();
    expect(result.classMap!["node0"]).toBe("node0");
  });
});

describe("convert() css-modules integration", () => {
  it("convert with outputFormat css-modules produces styles.node0", async () => {
    const source = 'export function App() { return <div className="flex p-4">hi</div>; }';
    const result = await convert(source, "test.tsx", { outputFormat: "css-modules" });

    expect(result.component).toContain("{styles.node0}");
    expect(result.component).toContain("import styles from");
    expect(result.classMap).toBeDefined();
  });

  it("convert without outputFormat produces identical output to current behavior", async () => {
    const source = 'export function App() { return <div className="flex p-4">hi</div>; }';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain('"node0"');
    expect(result.component).not.toContain("styles.");
    expect(result.classMap).toBeUndefined();
  });
});

// Phase 2: DYN-05 replacement value tests

describe("rewrite object key and CSS Modules replacement values (DYN-05)", () => {
  it("DYN-05 object key vanilla: rewrites quoted key to bare name", async () => {
    const source = 'const A = () => <div className={clsx({ "flex gap-4": cond })}>hi</div>';
    const result = await rewriteFromSource(source);

    // Bare name (no quotes) replaces the key
    expect(result.component).toContain("node0");
    expect(result.component).not.toContain("flex gap-4");
  });

  it("DYN-05 object key css-modules: rewrites quoted key to [styles.nodeN]", async () => {
    const source = 'const A = () => <div className={clsx({ "flex gap-4": cond })}>hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.component).toContain("[styles.node0]");
    expect(result.component).not.toContain("flex gap-4");
  });

  it("DYN-05 unquoted key vanilla: rewrites identifier key to bare name", async () => {
    const source = 'const A = () => <div className={clsx({ hidden: cond })}>hi</div>';
    const result = await rewriteFromSource(source);

    expect(result.component).toContain("node0");
    expect(result.component).not.toContain(": hidden");
  });

  it("DYN-05 unquoted key css-modules: rewrites identifier key to [styles.nodeN]", async () => {
    const source = 'const A = () => <div className={clsx({ hidden: cond })}>hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.component).toContain("[styles.node0]");
    expect(result.component).not.toContain(": hidden");
  });

  it("DYN-05a fragment expression css-modules fix: no curly braces around styles.nodeN in expression", async () => {
    const source = '<div className={active ? "flex" : "hidden"}>hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    // Must NOT have {styles.node0} (object literal form) in ternary context
    expect(result.component).not.toMatch(/\{styles\.node\d+\}/);
    expect(result.component).toContain("styles.node0");
    expect(result.component).toContain("styles.node1");
  });

  it("DYN-05 static attribute css-modules: still uses {styles.nodeN} with braces", async () => {
    const source = '<div className="flex p-4">hi</div>';
    const result = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    expect(result.component).toContain("{styles.node0}");
  });

  it("DYN-05 mixed: object keys use object-key format, fragments use expression format", async () => {
    const source = 'const A = () => <div className={clsx("flex", { hidden: cond })}>hi</div>';
    const cssModulesResult = await rewriteFromSource(source, "test.tsx", undefined, "css-modules");

    // "flex" is a fragment -> styles.node0 (no braces)
    expect(cssModulesResult.component).toContain("styles.node0");
    // "hidden" is an object key -> [styles.node1]
    expect(cssModulesResult.component).toContain("[styles.node1]");
  });
});

describe("twMerge import removal (Phase 3)", () => {
  it("removes unused tailwind-merge import when twMerge has no remaining references after unwrapping", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() { return <div className={twMerge("flex gap-4")} />; }`;
    const { program } = parse("test.tsx", source);
    const { findTwMergeNames } = await import("./extractor");
    const twMergeNames = findTwMergeNames(program);
    const { entries, warnings } = extract(program, source, twMergeNames);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, undefined, undefined, "test.tsx", undefined, twMergeNames);

    expect(result.component).not.toContain("tailwind-merge");
    expect(result.component).not.toContain("twMerge");
    expect(result.component).toContain('"node0"');
  });

  it("preserves import when twMerge is referenced outside className", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() {
  const cls = twMerge("flex", "gap-4");
  return <div className={twMerge("bg-red-500")} />;
}`;
    const { program } = parse("test.tsx", source);
    const { findTwMergeNames } = await import("./extractor");
    const twMergeNames = findTwMergeNames(program);
    const { entries, warnings } = extract(program, source, twMergeNames);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, undefined, undefined, "test.tsx", undefined, twMergeNames);

    // twMerge is still used in `const cls = twMerge(...)` — import must stay
    expect(result.component).toContain("tailwind-merge");
  });

  it("removes aliased import when alias has no remaining references after unwrapping", async () => {
    const source = `import { twMerge as tm } from "tailwind-merge";
export function App() { return <div className={tm("flex gap-4")} />; }`;
    const { program } = parse("test.tsx", source);
    const { findTwMergeNames } = await import("./extractor");
    const twMergeNames = findTwMergeNames(program);
    const { entries, warnings } = extract(program, source, twMergeNames);
    const nameMap = assignNames(entries);
    const result = await rewrite(source, entries, nameMap, warnings, undefined, undefined, "test.tsx", undefined, twMergeNames);

    expect(result.component).not.toContain("tailwind-merge");
    expect(result.component).not.toContain("tm");
    expect(result.component).toContain('"node0"');
  });
});
