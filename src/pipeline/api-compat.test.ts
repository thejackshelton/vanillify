import { describe, it, expect } from "vitest";
import { convert } from "../index";

/**
 * API backward compatibility test suite (Phase 11).
 *
 * These tests codify the public convert() contract so future changes
 * cannot silently break consumers.
 */

const SIMPLE_JSX = `const Comp = () => <div className="flex items-center p-4">hi</div>;`;
const VARIANT_JSX = `const Comp = () => <div className="ui-checked:bg-blue-500">hi</div>;`;
const THEME_JSX = `const Comp = () => <div className="bg-brand">hi</div>;`;
const UNMATCHED_JSX = `const Comp = () => <div className="not-a-real-class-xyz">hi</div>;`;
const DYNAMIC_JSX = `const Comp = () => <div className={isActive ? "flex" : "hidden"}>hi</div>;`;

describe("API backward compatibility (Phase 11)", () => {
  it("API-01: ConvertResult has correct shape", async () => {
    const result = await convert(SIMPLE_JSX, "test.tsx");

    // Must have these keys with correct types
    expect(result).toHaveProperty("component");
    expect(result).toHaveProperty("css");
    expect(result).toHaveProperty("themeCss");
    expect(result).toHaveProperty("warnings");
    expect(typeof result.component).toBe("string");
    expect(typeof result.css).toBe("string");
    expect(typeof result.themeCss).toBe("string");
    expect(Array.isArray(result.warnings)).toBe(true);

    // classMap should NOT be present in vanilla (default) format
    expect(result.classMap).toBeUndefined();
  });

  it("API-04: default path produces .nodeN classes and valid CSS", async () => {
    const result = await convert(SIMPLE_JSX, "test.tsx");

    // Component should have indexed class name
    expect(result.component).toContain("node0");

    // CSS should contain the selector and actual CSS properties
    expect(result.css).toContain(".node0");
    expect(result.css).toContain("display");
    expect(result.css).toMatch(/flex/);
    expect(result.css).toMatch(/padding/);

    // No theme, no warnings for valid classes
    expect(result.themeCss).toBe("");
    expect(result.warnings).toHaveLength(0);
  });

  it("API-02: css option with @custom-variant resolves custom variants", async () => {
    const result = await convert(VARIANT_JSX, "test.tsx", {
      css: "@custom-variant ui-checked (&:checked);",
    });

    // Should produce CSS with :checked selector
    expect(result.css).toContain(":checked");

    // Should NOT have an unmatched-class warning for the variant utility
    const unmatchedWarnings = result.warnings.filter(
      (w) => w.type === "unmatched-class",
    );
    expect(unmatchedWarnings).toHaveLength(0);
  });

  it("API-03: css option with @theme block resolves theme utilities", async () => {
    const result = await convert(THEME_JSX, "test.tsx", {
      css: "@theme { --color-brand: #ff0000; }",
    });

    // Should resolve bg-brand to CSS with background-related property
    expect(result.css).toMatch(/background|bg/);

    // Should NOT have unmatched-class warning for bg-brand
    const unmatchedWarnings = result.warnings.filter(
      (w) => w.type === "unmatched-class",
    );
    expect(unmatchedWarnings).toHaveLength(0);
  });

  it("API-03: css option with combined @theme and @custom-variant", async () => {
    const result = await convert(VARIANT_JSX, "test.tsx", {
      css: `
        @theme { --color-brand: #ff0000; }
        @custom-variant ui-checked (&:checked);
      `,
    });

    // Both @theme and @custom-variant should be processed
    expect(result.css).toContain(":checked");
    const unmatchedWarnings = result.warnings.filter(
      (w) => w.type === "unmatched-class",
    );
    expect(unmatchedWarnings).toHaveLength(0);
  });

  it("API-04: unmatched class produces warning", async () => {
    const result = await convert(UNMATCHED_JSX, "test.tsx");

    expect(
      result.warnings.some((w) => w.type === "unmatched-class"),
    ).toBe(true);
  });

  it("dynamic class produces warning", async () => {
    const result = await convert(DYNAMIC_JSX, "test.tsx");

    expect(
      result.warnings.some((w) => w.type === "dynamic-class"),
    ).toBe(true);
  });
});
