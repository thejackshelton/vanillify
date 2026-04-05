import {
  anyOf,
  charNotIn,
  createRegExp,
  exactly,
  global,
  oneOrMore,
  whitespace,
  wordChar,
} from "magic-regexp";
import type { ParsedVariant } from "./types";

/** Maximum input length to prevent regex DoS (T-02-01) */
const MAX_INPUT_LENGTH = 10000;

/** Matches @custom-variant shorthand: @custom-variant <name> (<selector>); */
const SHORTHAND_RE = createRegExp(
  exactly("@custom-variant")
    .and(oneOrMore(whitespace))
    .and(oneOrMore(anyOf(wordChar, exactly("-"))).as("name"))
    .and(oneOrMore(whitespace))
    .and(exactly("("))
    .and(oneOrMore(charNotIn(")")).as("selector"))
    .and(exactly(")"))
    .and(whitespace.times.any())
    .and(exactly(";")),
  [global],
);

/** Validates variant name contains only word characters and hyphens */
const NAME_RE = createRegExp(oneOrMore(anyOf(wordChar, exactly("-"))).at.lineStart().at.lineEnd());

/**
 * Parse @custom-variant shorthand directives from a CSS string.
 *
 * Handles: `@custom-variant <name> (<selector>);`
 * The `&` in the selector template represents the target element.
 *
 * @param css - CSS string potentially containing @custom-variant directives
 * @returns Array of parsed variant definitions in source order
 */
export function parseCustomVariantCSS(css: string): ParsedVariant[] {
  if (!css || css.length > MAX_INPUT_LENGTH) {
    return [];
  }

  const variants: ParsedVariant[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state for reuse
  SHORTHAND_RE.lastIndex = 0;

  while ((match = SHORTHAND_RE.exec(css)) !== null) {
    const name = match.groups?.name ?? match[1];
    const selectorTemplate = (match.groups?.selector ?? match[2]).trim();

    // Validate variant name (T-02-02: no CSS special characters)
    if (!NAME_RE.test(name)) {
      continue;
    }

    variants.push({ name, selectorTemplate });
  }

  return variants;
}
