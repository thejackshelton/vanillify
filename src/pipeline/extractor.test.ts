import { describe, it, expect } from "vitest";
import { parse } from "./parser";
import { extract } from "./extractor";

describe("extract", () => {
  it("extracts static className from a single element", () => {
    const source = 'const A = () => <div className="flex items-center gap-2">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex", "items-center", "gap-2"]);
    expect(entries[0].isDynamic).toBe(false);
    expect(entries[0].nodeIndex).toBe(0);
    expect(warnings).toHaveLength(0);
  });

  it("extracts class attribute (not just className)", () => {
    const source = 'const A = () => <div class="flex gap-2">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex", "gap-2"]);
  });

  it("assigns nodeIndex in DOM order across multiple elements", () => {
    const source = `const A = () => (
      <div className="flex">
        <span className="text-sm">a</span>
        <span className="text-lg">b</span>
      </div>
    )`;
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(3);
    expect(entries[0].nodeIndex).toBe(0);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(entries[1].nodeIndex).toBe(1);
    expect(entries[1].classNames).toEqual(["text-sm"]);
    expect(entries[2].nodeIndex).toBe(2);
    expect(entries[2].classNames).toEqual(["text-lg"]);
  });

  it("detects ternary expression as dynamic and extracts both branches", () => {
    const source =
      'const A = () => <div className={active ? "bg-blue-500" : "bg-gray-500"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    expect(entries).toHaveLength(2);
    expect(entries[0].isDynamic).toBe(false);
    expect(entries[0].isFragment).toBe(true);
    expect(entries[0].classNames).toEqual(["bg-blue-500"]);
    expect(entries[1].isDynamic).toBe(false);
    expect(entries[1].isFragment).toBe(true);
    expect(entries[1].classNames).toEqual(["bg-gray-500"]);
    expect(warnings).toHaveLength(0); // no warning from extractor
  });

  it("detects template literal as dynamic and extracts static parts", () => {
    const source = "const A = () => <div className={`flex ${size}`}>hi</div>";
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    // TemplateLiteral with interpolations is unresolvable -- no fragments extracted
    expect(entries).toHaveLength(0);
    expect(warnings).toHaveLength(0); // warnings now deferred to rewriter
  });

  it("detects function call (clsx/cn) as dynamic", () => {
    const source = 'const A = () => <div className={clsx("flex", active && "bg-blue")}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    // clsx("flex", active && "bg-blue") -- "flex" is direct arg Literal, "bg-blue" is LogicalExpression right
    expect(entries).toHaveLength(2);
    expect(entries[0].isDynamic).toBe(false);
    expect(entries[0].isFragment).toBe(true);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(entries[1].isDynamic).toBe(false);
    expect(entries[1].isFragment).toBe(true);
    expect(entries[1].classNames).toEqual(["bg-blue"]);
    expect(warnings).toHaveLength(0); // no extractor warning
  });

  it("records correct byte offset spans", () => {
    const source = '<div className="flex gap-2">hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    // The span should point to the string literal value in the source
    const sliced = source.slice(entries[0].span.start, entries[0].span.end);
    // Should contain the class string (with or without quotes depending on oxc-parser)
    expect(sliced).toMatch(/flex gap-2/);
  });

  it("handles elements with no class attribute (skips them)", () => {
    const source = 'const A = () => <div id="test"><span className="text-sm">hi</span></div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["text-sm"]);
  });

  it("emits fragment entries with individual Literal spans for ternary", () => {
    const source = 'const A = () => <div className={cond ? "flex gap-4" : "hidden"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(2);
    // First fragment: "flex gap-4"
    expect(entries[0].classNames).toEqual(["flex", "gap-4"]);
    expect(entries[0].isDynamic).toBe(false);
    expect(entries[0].isFragment).toBe(true);
    const frag0 = source.slice(entries[0].span.start, entries[0].span.end);
    expect(frag0).toBe('"flex gap-4"');

    // Second fragment: "hidden"
    expect(entries[1].classNames).toEqual(["hidden"]);
    expect(entries[1].isDynamic).toBe(false);
    expect(entries[1].isFragment).toBe(true);
    const frag1 = source.slice(entries[1].span.start, entries[1].span.end);
    expect(frag1).toBe('"hidden"');
  });

  it("skips empty strings in ternary alternate (DYN-04)", () => {
    const source = 'const A = () => <div className={cond ? "p-4" : ""}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["p-4"]);
  });

  it("skips whitespace-only strings (DYN-04)", () => {
    const source = 'const A = () => <div className={cond ? "p-4" : "  "}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["p-4"]);
  });

  it("ignores variable references in expression (DYN-06)", () => {
    const source = 'const A = () => <div className={cond ? "flex" : myVar}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, unresolvableContainers } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex"]);
    // Container is flagged as having unresolvable parts
    expect(unresolvableContainers?.size).toBe(1);
  });

  it("flags || fallback with variable left side as unresolvable (DYN-08)", () => {
    const source = 'const A = () => <div className={myVar || "flex"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, unresolvableContainers } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex"]);
    // myVar is a class value position in ||, so container is unresolvable
    expect(unresolvableContainers?.size).toBe(1);
  });

  it("flags ?? fallback with variable left side as unresolvable (DYN-08)", () => {
    const source = 'const A = () => <div className={myVar ?? "flex"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, unresolvableContainers } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(unresolvableContainers?.size).toBe(1);
  });

  it("extracts fragments from clsx call arguments (DYN-01)", () => {
    const source = 'const A = () => <div className={clsx("flex", cond && "gap-4")}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(2);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(entries[1].classNames).toEqual(["gap-4"]);
  });

  it("assigns sequential nodeIndex across static and fragment entries", () => {
    const source = '<div className="text-sm"><span className={cond ? "flex" : "hidden"}>hi</span></div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(3);
    expect(entries[0].nodeIndex).toBe(0); // static
    expect(entries[0].isDynamic).toBe(false);
    expect(entries[0].isFragment).toBeUndefined(); // static entry has no isFragment
    expect(entries[1].nodeIndex).toBe(1); // fragment from ternary consequent
    expect(entries[1].isFragment).toBe(true);
    expect(entries[2].nodeIndex).toBe(2); // fragment from ternary alternate
    expect(entries[2].isFragment).toBe(true);
  });

  it("sets containerStart to JSXExpressionContainer start offset", () => {
    const source = 'const A = () => <div className={cond ? "flex" : "hidden"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(2);
    // Both fragments share the same containerStart
    expect(entries[0].containerStart).toBeDefined();
    expect(entries[0].containerStart).toBe(entries[1].containerStart);
  });

  it("extracts direct literal in expression container", () => {
    const source = 'const A = () => <div className={"flex gap-4"}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex", "gap-4"]);
    expect(entries[0].isFragment).toBe(true);
  });

  // Phase 2: ObjectExpression support (DYN-02, DYN-03)

  it("extracts quoted object key as fragment with isObjectKey=true (DYN-02)", () => {
    const source = 'const A = () => <div className={clsx({ "flex gap-4": isActive })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex", "gap-4"]);
    expect(entries[0].isFragment).toBe(true);
    expect(entries[0].isObjectKey).toBe(true);
  });

  it("extracts unquoted identifier key as fragment with isObjectKey=true (DYN-03)", () => {
    const source = 'const A = () => <div className={clsx({ hidden: cond })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["hidden"]);
    expect(entries[0].isFragment).toBe(true);
    expect(entries[0].isObjectKey).toBe(true);
  });

  it("extracts shorthand property as isObjectKey (shorthand treated as Identifier key)", () => {
    const source = 'const A = () => <div className={clsx({ hidden })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["hidden"]);
    expect(entries[0].isObjectKey).toBe(true);
  });

  it("extracts multiple object keys in mixed object with both isObjectKey=true", () => {
    const source = 'const A = () => <div className={clsx({ "flex": a, hidden: b })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(2);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(entries[0].isObjectKey).toBe(true);
    expect(entries[1].classNames).toEqual(["hidden"]);
    expect(entries[1].isObjectKey).toBe(true);
  });

  it("skips computed keys in ObjectExpression (DYN-06 preserved)", () => {
    const source = 'const A = () => <div className={clsx({ [someVar]: cond })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(0);
  });

  it("skips SpreadElement in ObjectExpression", () => {
    const source = 'const A = () => <div className={clsx({ ...spread })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(0);
  });

  it("expressionHasUnresolvable: ObjectExpression with computed key returns true", () => {
    const source = 'const A = () => <div className={clsx({ [someVar]: cond })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { unresolvableContainers } = extract(program, source);

    expect(unresolvableContainers?.size).toBe(1);
  });

  it("expressionHasUnresolvable: ObjectExpression with only Literal/Identifier keys returns false", () => {
    const source = 'const A = () => <div className={clsx({ "flex": a, hidden: b })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { unresolvableContainers } = extract(program, source);

    // No unresolvable containers (all keys are Literals or Identifiers)
    expect(unresolvableContainers?.size).toBe(0);
  });

  it("expressionHasUnresolvable: ObjectExpression with SpreadElement returns true", () => {
    const source = 'const A = () => <div className={clsx({ ...spread })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { unresolvableContainers } = extract(program, source);

    expect(unresolvableContainers?.size).toBe(1);
  });

  it("extracts nested ObjectExpression inside LogicalExpression inside CallExpression", () => {
    const source = 'const A = () => <div className={clsx(cond && { "flex": true })}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].classNames).toEqual(["flex"]);
    expect(entries[0].isObjectKey).toBe(true);
  });
});
