import { createRegExp, exactly } from "magic-regexp";
import type { VariantObject } from "@unocss/core";
import type { CustomVariantsOption } from "./types";
import { parseCustomVariantCSS } from "./parser";

const AMPERSAND_RE = createRegExp(exactly("&"), ["g"]);

/**
 * Create a UnoCSS VariantObject from a variant name and selector template.
 *
 * The VariantObject's `match` function checks if a token starts with the
 * variant prefix (e.g., `ui-checked:`). If it does, it strips the prefix
 * and provides a selector transformation function that replaces `&` in the
 * template with the actual CSS selector.
 *
 * @param name - Variant name (e.g., 'ui-checked')
 * @param selectorTemplate - CSS selector with & placeholder (e.g., '&[ui-checked]')
 */
export function createVariantObject(name: string, selectorTemplate: string): VariantObject {
  const prefix = `${name}:`;
  return {
    name,
    match(matcher: string) {
      if (!matcher.startsWith(prefix)) {
        return matcher;
      }
      return {
        matcher: matcher.slice(prefix.length),
        selector: (s: string) => selectorTemplate.replace(AMPERSAND_RE, s),
      };
    },
  };
}

/**
 * Resolve customVariants option to UnoCSS VariantObject array.
 *
 * Accepts either:
 * - A CSS string containing @custom-variant directives (parsed automatically)
 * - A Record<string, string> mapping variant names to selector templates
 *
 * @param input - CSS string or Record of variant definitions
 * @returns Array of UnoCSS VariantObject entries for createGenerator config
 */
export function resolveCustomVariants(input: CustomVariantsOption): VariantObject[] {
  if (typeof input === "string") {
    const parsed = parseCustomVariantCSS(input);
    return parsed.map((v) => createVariantObject(v.name, v.selectorTemplate));
  }

  return Object.entries(input).map(([name, selectorTemplate]) =>
    createVariantObject(name, selectorTemplate),
  );
}
