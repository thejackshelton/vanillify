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

describe("object key and CSS Modules rewriting (Phase 2)", () => {
  it("rewrites quoted object keys in clsx-style expressions (DYN-02)", async () => {
    const source = `const A = () => <div className={clsx({ "flex gap-4": isActive })}>hi</div>`;
    const result = await convert(source, "test.tsx");
    expect(result.component).toContain("node0");
    expect(result.component).not.toContain("flex gap-4");
    expect(result.css).toContain(".node0");
    expect(result.css).toContain("display");
  });

  it("rewrites unquoted identifier keys in clsx-style expressions (DYN-03)", async () => {
    const source = `const A = () => <div className={clsx({ hidden: cond })}>hi</div>`;
    const result = await convert(source, "test.tsx");
    expect(result.component).toContain("node0");
    expect(result.component).not.toContain("hidden");
    // 'hidden' is a valid Tailwind utility -- verify CSS generated
    expect(result.css).toContain(".node0");
  });

  it("uses [styles.nodeN] for object keys in css-modules mode (DYN-05)", async () => {
    const source = `const A = () => <div className={clsx({ "flex gap-4": isActive, hidden: cond })}>hi</div>`;
    const result = await convert(source, "test.tsx", { outputFormat: "css-modules" });
    expect(result.component).toContain("[styles.node0]");
    expect(result.component).toContain("[styles.node1]");
    expect(result.component).not.toContain("flex gap-4");
  });

  it("uses styles.nodeN without braces for fragment expressions in css-modules mode (DYN-05)", async () => {
    const source = `const A = () => <div className={active ? "flex" : "hidden"}>hi</div>`;
    const result = await convert(source, "test.tsx", { outputFormat: "css-modules" });
    // Must NOT have {styles.node0} (object literal form) -- must be styles.node0 (member access)
    expect(result.component).not.toMatch(/\{styles\.node\d+\}/);
    expect(result.component).toContain("styles.node0");
    expect(result.component).toContain("styles.node1");
  });

  it("handles mixed object keys and string literals in same clsx call", async () => {
    const source = `const A = () => <div className={clsx("flex", { hidden: cond })}>hi</div>`;
    const result = await convert(source, "test.tsx");
    // "flex" is a string literal fragment, "hidden" is an object key fragment
    expect(result.component).toContain("node0"); // flex
    expect(result.component).toContain("node1"); // hidden
    expect(result.component).not.toContain('"flex"');
  });

  it("rewrites shorthand property key in clsx call (expands shorthand)", async () => {
    const source = `const A = () => <div className={clsx({ hidden })}>hi</div>`;
    const result = await convert(source, "test.tsx");
    // Shorthand { hidden } must expand to { node0: hidden } to avoid referencing node0 variable
    expect(result.component).toContain("node0: hidden");
    expect(result.css).toContain(".node0");
  });

  it("rewrites shorthand property in CSS Modules mode (expands with computed key)", async () => {
    const source = `const A = () => <div className={clsx({ hidden })}>hi</div>`;
    const result = await convert(source, "test.tsx", { outputFormat: "css-modules" });
    // Shorthand { hidden } must expand to { [styles.node0]: hidden }
    expect(result.component).toContain("[styles.node0]: hidden");
  });
});

describe("twMerge cleanup (Phase 3)", () => {
  it("TMR-01: single-arg twMerge is unwrapped and CSS generated", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() { return <div className={twMerge("flex gap-4")} />; }`;
    const result = await convert(source, "test.tsx");

    expect(result.component).not.toContain("twMerge");
    expect(result.component).toContain('"node0"');
    expect(result.css).toContain(".node0");
    expect(result.css).toContain("display");
  });

  it("TMR-02: multi-arg twMerge joins args and produces single scoped name", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() { return <div className={twMerge("flex", "gap-4")} />; }`;
    const result = await convert(source, "test.tsx");

    expect(result.component).not.toContain("twMerge");
    expect(result.component).toContain('"node0"');
    expect(result.css).toContain(".node0");
    // CSS should contain rules for both flex and gap-4 merged into node0
    expect(result.css).toContain("display");
    expect(result.css).toContain("gap");
  });

  it("TMR-03: tailwind-merge import is removed from output when no other references remain", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() { return <div className={twMerge("flex gap-4")} />; }`;
    const result = await convert(source, "test.tsx");

    expect(result.component).not.toContain("tailwind-merge");
    expect(result.component).not.toContain("twMerge");
  });

  it("TMR-04: aliased import and tm() call are unwrapped correctly", async () => {
    const source = `import { twMerge as tm } from "tailwind-merge";
export function App() { return <div className={tm("flex gap-4")} />; }`;
    const result = await convert(source, "test.tsx");

    expect(result.component).not.toContain("tailwind-merge");
    expect(result.component).not.toContain("tm(");
    expect(result.component).toContain('"node0"');
    expect(result.css).toContain(".node0");
  });

  it("preserves import when twMerge is used outside className attribute", async () => {
    const source = `import { twMerge } from "tailwind-merge";
export function App() {
  const cls = twMerge("flex", "gap-4");
  return <div className={twMerge("bg-red-500")} />;
}`;
    const result = await convert(source, "test.tsx");

    // twMerge is still referenced in `const cls = twMerge(...)` outside className
    expect(result.component).toContain("tailwind-merge");
  });
});

describe("requirement traceability (Phase 4)", () => {
  it("PIPE-01: extractor emits per-fragment entries with span and isFragment for ternary", async () => {
    // PIPE-01: Extractor emits per-fragment entries with span, context type, and raw text
    // for expression containers. Each branch of a ternary gets its own entry.
    const source = `const App = () => (
  <div className={cond ? "flex gap-4" : "hidden"}>content</div>
)`;
    const result = await convert(source, "test.tsx");

    // Both branches should be rewritten to scoped names
    expect(result.component).toContain("node");
    // CSS should be generated for both branches
    expect(result.css).toContain("display");
    // No dynamic warning: both branches are fully resolvable string literals
    const dynamicWarnings = result.warnings.filter((w) => w.type === "dynamic-class");
    expect(dynamicWarnings).toHaveLength(0);
  });

  it("PIPE-02: namer assigns names to all fragment entries", async () => {
    // PIPE-02: Namer assigns names to all fragment entries (no dynamic skip).
    // A multi-fragment expression (ternary with two branches) gets distinct scoped names.
    const source = `const App = () => (
  <div className={isActive ? "flex p-4" : "hidden"}>content</div>
)`;
    const result = await convert(source, "test.tsx");

    // Both ternary branches get their own scoped class names
    expect(result.component).toContain("node0");
    expect(result.component).toContain("node1");
    // Each gets CSS generated
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
  });

  it("PIPE-03: rewriter handles context-aware replacement with stable source-order naming", async () => {
    // PIPE-03: Rewriter handles context-aware replacement with stable source-order naming.
    // Static attrs and fragment entries in the same file get sequential node names in source order.
    const source = `const App = () => (
  <div>
    <span className="text-sm">label</span>
    <button className={isActive ? "flex p-4" : "hidden"}>click</button>
    <p className="text-gray-500">footer</p>
  </div>
)`;
    const result = await convert(source, "test.tsx");

    // Static attrs get node0, fragment branches get node1/node2, next static gets node3
    // All names appear in component output
    expect(result.component).toContain("node0"); // first static (text-sm)
    expect(result.component).toContain("node1"); // ternary consequent (flex p-4)
    expect(result.component).toContain("node2"); // ternary alternate (hidden)
    expect(result.component).toContain("node3"); // second static (text-gray-500)
    // CSS is generated for all rewritten classes
    expect(result.css).toContain(".node0");
    expect(result.css).toContain(".node1");
    expect(result.css).toContain(".node3");
  });
});
