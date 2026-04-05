import { describe, it, expect } from "vite-plus/test";
import { mapToThemeConfig } from "./mapper";

describe("mapToThemeConfig", () => {
  it("maps --color-* to colors namespace", () => {
    const result = mapToThemeConfig([
      { property: "--color-brand", value: "#ff0000" },
    ]);
    expect(result.theme).toEqual({ colors: { brand: "#ff0000" } });
    expect(result.warnings).toEqual([]);
  });

  it("nests color shades as numeric keys", () => {
    const result = mapToThemeConfig([
      { property: "--color-brand-500", value: "#ff0000" },
      { property: "--color-brand-600", value: "#cc0000" },
    ]);
    expect(result.theme).toEqual({
      colors: { brand: { 500: "#ff0000", 600: "#cc0000" } },
    });
    expect(result.warnings).toEqual([]);
  });

  it("maps --font-* to font namespace", () => {
    const result = mapToThemeConfig([
      { property: "--font-sans", value: "Inter, sans-serif" },
    ]);
    expect(result.theme).toEqual({ font: { sans: "Inter, sans-serif" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --font-weight-* before --font-* (longest prefix first)", () => {
    const result = mapToThemeConfig([
      { property: "--font-weight-bold", value: "700" },
    ]);
    expect(result.theme).toEqual({ fontWeight: { bold: "700" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --text-* with fontSize wrapper", () => {
    const result = mapToThemeConfig([
      { property: "--text-huge", value: "4rem" },
    ]);
    expect(result.theme).toEqual({
      text: { huge: { fontSize: "4rem" } },
    });
    expect(result.warnings).toEqual([]);
  });

  it("maps --text-*--line-height to lineHeight on existing text entry", () => {
    const result = mapToThemeConfig([
      { property: "--text-huge", value: "4rem" },
      { property: "--text-huge--line-height", value: "4.5rem" },
    ]);
    expect(result.theme).toEqual({
      text: { huge: { fontSize: "4rem", lineHeight: "4.5rem" } },
    });
    expect(result.warnings).toEqual([]);
  });

  it("maps bare namespace --spacing to DEFAULT key", () => {
    const result = mapToThemeConfig([
      { property: "--spacing", value: "0.5rem" },
    ]);
    expect(result.theme).toEqual({ spacing: { DEFAULT: "0.5rem" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --spacing-* to spacing namespace", () => {
    const result = mapToThemeConfig([
      { property: "--spacing-huge", value: "10rem" },
    ]);
    expect(result.theme).toEqual({ spacing: { huge: "10rem" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --radius-* to radius namespace", () => {
    const result = mapToThemeConfig([
      { property: "--radius-lg", value: "0.75rem" },
    ]);
    expect(result.theme).toEqual({ radius: { lg: "0.75rem" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --blur-* to blur namespace", () => {
    const result = mapToThemeConfig([
      { property: "--blur-xl", value: "24px" },
    ]);
    expect(result.theme).toEqual({ blur: { xl: "24px" } });
    expect(result.warnings).toEqual([]);
  });

  it("maps --ease-* to ease namespace", () => {
    const result = mapToThemeConfig([
      { property: "--ease-smooth", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
    ]);
    expect(result.theme).toEqual({
      ease: { smooth: "cubic-bezier(0.4, 0, 0.2, 1)" },
    });
    expect(result.warnings).toEqual([]);
  });

  it("maps --breakpoint-* to breakpoint namespace", () => {
    const result = mapToThemeConfig([
      { property: "--breakpoint-xl", value: "1280px" },
    ]);
    expect(result.theme).toEqual({ breakpoint: { xl: "1280px" } });
    expect(result.warnings).toEqual([]);
  });

  it("warns for unknown namespace but still passes through (THEME-07)", () => {
    const result = mapToThemeConfig([
      { property: "--custom-foo", value: "bar" },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("unknown-theme-namespace");
    expect(result.theme).toHaveProperty("customFoo");
    expect(result.theme.customFoo).toBe("bar");
  });

  it("returns empty theme for empty declarations", () => {
    const result = mapToThemeConfig([]);
    expect(result.theme).toEqual({});
    expect(result.warnings).toEqual([]);
  });
});
