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

    expect(entries).toHaveLength(1);
    expect(entries[0].isDynamic).toBe(true);
    expect(entries[0].classNames).toContain("bg-blue-500");
    expect(entries[0].classNames).toContain("bg-gray-500");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].type).toBe("dynamic-class");
  });

  it("detects template literal as dynamic and extracts static parts", () => {
    const source = "const A = () => <div className={`flex ${size}`}>hi</div>";
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].isDynamic).toBe(true);
    expect(entries[0].classNames).toContain("flex");
    expect(warnings).toHaveLength(1);
  });

  it("detects function call (clsx/cn) as dynamic", () => {
    const source = 'const A = () => <div className={clsx("flex", active && "bg-blue")}>hi</div>';
    const { program } = parse("test.tsx", source);
    const { entries, warnings } = extract(program, source);

    expect(entries).toHaveLength(1);
    expect(entries[0].isDynamic).toBe(true);
    expect(warnings).toHaveLength(1);
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
});
