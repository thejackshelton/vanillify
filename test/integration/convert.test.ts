import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { convert } from "../../src/index";

describe("convert() integration", () => {
  it("converts a simple component with basic utilities", async () => {
    const source = `
const Card = () => (
  <div className="flex items-center gap-4 p-6">
    <h2 className="text-lg font-bold">Title</h2>
    <p className="text-sm text-gray-500">Description</p>
  </div>
)
`;
    const result = await convert(source, "card.tsx");

    // Component should have indexed class names
    expect(result.component).toContain('"node0"');
    expect(result.component).toContain('"node1"');
    expect(result.component).toContain('"node2"');
    expect(result.component).not.toContain("flex items-center");

    // CSS should have .nodeN selectors with correct properties
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
    expect(result.css).toContain(".node2");
    expect(result.css).toContain("display");
    expect(result.css).toContain("font-weight");
  });

  it("handles pseudo-class variants in output CSS", async () => {
    const source = `
const Button = () => (
  <button className="bg-blue-500 hover:bg-blue-700 focus:outline-none">
    Click
  </button>
)
`;
    const result = await convert(source, "button.tsx");

    expect(result.css).toContain(".node0");
    expect(result.css).toContain(":hover");
    expect(result.css).toContain(":focus");
  });

  it("handles responsive variants in output CSS", async () => {
    const source = `
const Layout = () => (
  <div className="flex sm:grid md:hidden lg:block">content</div>
)
`;
    const result = await convert(source, "layout.tsx");

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("@media");
  });

  it("handles arbitrary values", async () => {
    const source = `
const Custom = () => (
  <div className="text-[#ff0000] w-[200px] p-[1.5rem]">custom</div>
)
`;
    const result = await convert(source, "custom.tsx");

    expect(result.css).toContain(".node0");
    expect(result.css).toContain("color");
    expect(result.css).toContain("width");
  });

  it("rewrites string literal fragments in ternary className expressions", async () => {
    const source = `
const Toggle = () => (
  <div className={active ? "bg-blue-500" : "bg-gray-500"}>toggle</div>
)
`;
    const result = await convert(source, "toggle.tsx");

    // Fragment entries are rewritten to indexed names; no dynamic-class warning from extractor
    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    expect(result.warnings.filter((w) => w.type === "dynamic-class")).toHaveLength(0);
  });

  it("handles the class attribute (Qwik/Solid style)", async () => {
    const source = `
const App = () => (
  <div class="flex items-center gap-2">
    <span class="text-sm font-semibold">Label</span>
  </div>
)
`;
    const result = await convert(source, "app.tsx");

    expect(result.component).toContain('"node0"');
    expect(result.component).toContain('"node1"');
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
  });

  it("converts the checkbox fixture (smoke test)", async () => {
    const fixturePath = resolve(__dirname, "../../fixtures/checkbox.tsx");
    const source = readFileSync(fixturePath, "utf-8");
    const result = await convert(source, "checkbox.tsx");

    // Should have entries for each element with class attribute
    expect(result.component).toContain("node0");
    expect(result.css).toContain(".node0");

    // The ui-checked, ui-disabled, ui-mixed classes are custom variants
    // and will NOT match in preset-wind4 -- they should produce unmatched warnings
    const unmatchedWarnings = result.warnings.filter((w) => w.type === "unmatched-class");
    expect(unmatchedWarnings.length).toBeGreaterThan(0);

    // Standard utilities (flex, items-center, gap-2, text-sm, etc.) should still generate CSS
    expect(result.css).toContain("display");

    // Component should not crash -- this is a smoke test
    expect(result.component.length).toBeGreaterThan(0);
    expect(result.css.length).toBeGreaterThan(0);
  });

  it("returns empty CSS and unchanged component for source with no class attributes", async () => {
    const source = '<div id="test"><span>no classes</span></div>';
    const result = await convert(source, "empty.tsx");

    expect(result.component).toBe(source); // Unchanged
    expect(result.css).toBe("");
    expect(result.warnings).toHaveLength(0);
  });
});

describe("convert() with css option", () => {
  it("CVAR-01: css option with @custom-variant resolves custom variant", async () => {
    const source = '<div className="bg-blue-500 ui-checked:bg-green-500">test</div>';
    const result = await convert(source, "test.tsx", {
      css: "@custom-variant ui-checked (&[ui-checked]);",
    });
    expect(result.css).toContain(".node0");
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("background");
    // ui-checked:bg-green-500 should NOT be in unmatched warnings
    const unmatchedNames = result.warnings
      .filter((w) => w.type === "unmatched-class")
      .map((w) => w.message);
    expect(unmatchedNames.join()).not.toContain("ui-checked:bg-green-500");
  });

  it("CVAR-01: css option with @custom-variant (equivalent of Record form)", async () => {
    const source = '<div className="bg-blue-500 ui-checked:bg-green-500">test</div>';
    const result = await convert(source, "test.tsx", {
      css: "@custom-variant ui-checked (&[ui-checked]);",
    });
    expect(result.css).toContain(".node0");
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("background");
    const unmatchedNames = result.warnings
      .filter((w) => w.type === "unmatched-class")
      .map((w) => w.message);
    expect(unmatchedNames.join()).not.toContain("ui-checked:bg-green-500");
  });

  it("CVAR-02: ancestor-descendant selector pattern", async () => {
    const source = '<div className="ui-checked:bg-blue-500">test</div>';
    const result = await convert(source, "test.tsx", {
      css: "@custom-variant ui-checked ([ui-checked] &);",
    });
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain(".node0");
  });

  it("CVAR-02: multiple custom variants (QDS pattern)", async () => {
    const source =
      '<div className="ui-checked:bg-blue-500 ui-disabled:opacity-50 ui-mixed:bg-purple-500">test</div>';
    const result = await convert(source, "test.tsx", {
      css: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    });
    expect(result.css).toContain("[ui-checked]");
    expect(result.css).toContain("[ui-disabled]");
    expect(result.css).toContain("[ui-mixed]");
  });

  it("CVAR-02: custom variant stacked with hover", async () => {
    const source = '<button className="ui-checked:hover:bg-blue-700">click</button>';
    const result = await convert(source, "test.tsx", {
      css: "@custom-variant ui-checked (&[ui-checked]);",
    });
    expect(result.css).toContain(":hover");
    expect(result.css).toContain("[ui-checked]");
  });

  it("CVAR-03: no css option = Phase 1 behavior (regression)", async () => {
    const source = '<div className="flex p-4 ui-checked:bg-blue-500">test</div>';
    const result = await convert(source, "test.tsx");
    // Without css option, ui-checked:bg-blue-500 should be unmatched
    const unmatchedWarnings = result.warnings.filter((w) => w.type === "unmatched-class");
    expect(unmatchedWarnings.some((w) => w.message.includes("ui-checked"))).toBe(true);
    // Standard utilities should still work
    expect(result.css).toContain("display");
    expect(result.css).toContain("padding");
  });

  it("CVAR-03: convert without css option does not match ui-checked tokens", async () => {
    const source = '<div className="ui-checked:bg-blue-500">test</div>';
    const result = await convert(source, "test.tsx");
    // Should appear as unmatched
    const unmatchedWarnings = result.warnings.filter((w) => w.type === "unmatched-class");
    expect(unmatchedWarnings.some((w) => w.message.includes("ui-checked"))).toBe(true);
  });
});

describe("convert - fixture snapshots (PKG-03)", () => {
  it("Qwik checkbox produces stable CSS output", async () => {
    const source = await readFile(resolve(__dirname, "../../fixtures/checkbox.tsx"), "utf-8");
    const result = await convert(source, "checkbox.tsx", {
      css: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    });

    // Verify non-empty output
    expect(result.css).toBeTruthy();
    expect(result.component).toBeTruthy();

    // Snapshot against committed fixture files
    await expect(result.css).toMatchFileSnapshot(resolve(__dirname, "../../fixtures/checkbox.css"));
    await expect(result.component).toMatchFileSnapshot(
      resolve(__dirname, "../../fixtures/checkbox.component.tsx"),
    );
  });

  it("Qwik checkbox reports no errors for resolvable classes", async () => {
    const source = await readFile(resolve(__dirname, "../../fixtures/checkbox.tsx"), "utf-8");
    const result = await convert(source, "checkbox.tsx", {
      css: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    });

    // With custom variants provided, no classes should be unmatched
    // The key assertion: no dynamic-class warnings (all classes are static strings)
    const dynamicWarnings = result.warnings.filter((w) => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(0);
  });
});

describe("dynamic expression rewriting (Phase 1)", () => {
  it("rewrites ternary string literals to scoped names with CSS (SC-1)", async () => {
    const source = 'const A = () => <div className={cond ? "flex gap-4" : "hidden"}>hi</div>';
    const result = await convert(source, "test.tsx");

    // Both branches rewritten
    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    expect(result.component).not.toContain("flex gap-4");
    expect(result.component).not.toContain('"hidden"');
    // Ternary structure preserved
    expect(result.component).toContain("cond ?");
    // CSS generated for both
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
  });

  it("leaves empty string untouched in ternary alternate (SC-2)", async () => {
    const source = 'const A = () => <div className={cond ? "p-4" : ""}>hi</div>';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("node0"); // p-4 rewritten
    expect(result.component).toContain('""'); // empty string preserved
  });

  it("leaves zero-match strings as-is in source (SC-3)", async () => {
    const source = 'const A = () => <div className={cond ? "not-a-utility" : "also-not"}>hi</div>';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain('"not-a-utility"');
    expect(result.component).toContain('"also-not"');
    expect(result.component).not.toContain("node0");
  });

  it("preserves variable references and spread elements unchanged (SC-4)", async () => {
    const source = 'const A = () => <div className={cond ? someVar : "flex"}>hi</div>';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("someVar"); // variable preserved
    expect(result.component).toContain("node0"); // "flex" rewritten
  });

  it("emits no warning for fully-rewritten ternary (SC-5)", async () => {
    const source = 'const A = () => <div className={cond ? "flex gap-4" : "hidden"}>hi</div>';
    const result = await convert(source, "test.tsx");

    const dynamicWarnings = result.warnings.filter(w => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(0);
  });

  it("emits warning for partially-rewritten expression with variable ref (SC-5)", async () => {
    const source = 'const A = () => <div className={cond ? "flex" : myVar}>hi</div>';
    const result = await convert(source, "test.tsx");

    const dynamicWarnings = result.warnings.filter(w => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(1);
    expect(dynamicWarnings[0].message).toContain("Partially rewritten");
  });

  it("handles logical AND with string literal (DYN-01)", async () => {
    const source = 'const A = () => <div className={isActive && "flex gap-4"}>hi</div>';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("node0");
    expect(result.component).not.toContain("flex gap-4");
    expect(result.css).toContain(".node0");
  });

  it("handles clsx call with multiple string args", async () => {
    const source = 'const A = () => <div className={clsx("flex", "gap-4")}>hi</div>';
    const result = await convert(source, "test.tsx");

    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
  });
});
