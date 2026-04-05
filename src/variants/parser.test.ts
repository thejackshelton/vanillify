import { describe, it, expect } from "vitest";
import { parseCustomVariantCSS } from "./parser";

describe("parseCustomVariantCSS", () => {
  it("parses self-referencing @custom-variant shorthand", () => {
    const result = parseCustomVariantCSS("@custom-variant ui-checked (&[ui-checked]);");
    expect(result).toEqual([{ name: "ui-checked", selectorTemplate: "&[ui-checked]" }]);
  });

  it("parses ancestor-descendant @custom-variant shorthand", () => {
    const result = parseCustomVariantCSS("@custom-variant ui-checked ([ui-checked] &);");
    expect(result).toEqual([{ name: "ui-checked", selectorTemplate: "[ui-checked] &" }]);
  });

  it("parses multiple @custom-variant directives in order", () => {
    const css = `
      @custom-variant ui-checked (&[ui-checked]);
      @custom-variant ui-disabled (&[ui-disabled]);
      @custom-variant ui-mixed (&[ui-mixed]);
    `;
    const result = parseCustomVariantCSS(css);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "ui-checked", selectorTemplate: "&[ui-checked]" });
    expect(result[1]).toEqual({ name: "ui-disabled", selectorTemplate: "&[ui-disabled]" });
    expect(result[2]).toEqual({ name: "ui-mixed", selectorTemplate: "&[ui-mixed]" });
  });

  it("returns empty array for empty string", () => {
    expect(parseCustomVariantCSS("")).toEqual([]);
  });

  it("returns empty array for non-@custom-variant CSS", () => {
    const css = `
      .foo { color: red; }
      @media (min-width: 768px) { .bar { display: flex; } }
    `;
    expect(parseCustomVariantCSS(css)).toEqual([]);
  });

  it("handles variant names with hyphens", () => {
    const css = `
      @custom-variant my-custom-state (&[data-my-custom-state]);
    `;
    const result = parseCustomVariantCSS(css);
    expect(result).toEqual([
      { name: "my-custom-state", selectorTemplate: "&[data-my-custom-state]" },
    ]);
  });

  it("rejects input exceeding 10000 characters (DoS protection)", () => {
    const longInput = "@custom-variant a (&[a]);".padEnd(10001, " ");
    const result = parseCustomVariantCSS(longInput);
    expect(result).toEqual([]);
  });

  it("trims whitespace from selector template", () => {
    const result = parseCustomVariantCSS("@custom-variant ui-checked (  &[ui-checked]  );");
    expect(result).toEqual([{ name: "ui-checked", selectorTemplate: "&[ui-checked]" }]);
  });
});
