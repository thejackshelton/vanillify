import { compile } from "tailwindcss";
import type { Warning } from "../types";

// --- Virtual stylesheet resolution ---
// Read CSS content once at module load (not per-call) [ENG-02]
import { createRequire } from "module";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";

const _require = createRequire(import.meta.url);
const twDir = dirname(_require.resolve("tailwindcss/package.json"));
const tailwindIndexCss = readFileSync(resolve(twDir, "index.css"), "utf-8");

async function loadStylesheet(id: string, base: string) {
  if (id === "tailwindcss") {
    return {
      path: "virtual:tailwindcss/index.css",
      base,
      content: tailwindIndexCss,
    };
  }
  // T-09-03: bounded error message, no filesystem path leak
  throw new Error(`Vanillify: cannot resolve stylesheet "${id}"`);
}

// --- Compiler creation [ENG-04] ---
// Tailwind's build() is cumulative — candidates from prior calls persist on the
// same compiler instance. This means we CANNOT reuse a compiler across calls with
// different candidate sets, or earlier candidates leak into later CSS output.
// Instead we cache by (cssInput + sorted candidates) to get isolation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- internal cache exposed for test inspection only
export const _cache: Map<string, any> = new Map();

// --- Layer extraction [ENG-05] ---
function extractLayers(output: string): {
  themeCss: string;
  utilityCss: string;
} {
  // Theme layer regex: matches @layer theme { ... } with non-greedy [\s\S]*? and
  // positive lookahead (?=@layer) to stop before the next layer block.
  // RATIONALE: stays raw -- magic-regexp lacks lookahead support and [\s\S] non-greedy quantifiers.
  const themeMatch = output.match(/@layer theme \{([\s\S]*?)\}\s*(?=@layer)/);
  const themeCss = themeMatch ? themeMatch[1].trim() : "";

  // Utilities layer: Tailwind always emits @layer utilities { ... } as the last @layer block,
  // optionally followed by @property and/or @layer properties blocks on new lines.
  // Rather than parsing CSS braces (which is fragile with escaped chars, quoted values, etc.),
  // we find the boundary by locating the first post-utilities directive and scanning backwards
  // to find the closing } of @layer utilities.
  const utilStart = output.indexOf("@layer utilities {");
  let utilityCss = "";
  if (utilStart !== -1) {
    const contentStart = utilStart + "@layer utilities {".length;

    // Find where post-utilities blocks begin (if any).
    // Tailwind may emit @property, @layer properties, @keyframes, etc. after @layer utilities.
    // All top-level directives start with \n@ at column 0. Find the first such occurrence
    // after the utilities content (skipping the \n@ inside nested rules by requiring
    // it appears after the utilities block closes — we search from contentStart and
    // the pattern \n}\n@ reliably marks the end of @layer utilities followed by a directive).
    const closePattern = "\n}\n@";
    const closeIdx = output.indexOf(closePattern, contentStart);
    // endBoundary is right after the closing } of @layer utilities
    const endBoundary = closeIdx !== -1 ? closeIdx + 2 : output.length; // +2 to include \n}

    // The closing } of @layer utilities is the last } before the endBoundary
    const slice = output.slice(contentStart, endBoundary);
    const lastBrace = slice.lastIndexOf("}");
    utilityCss = lastBrace !== -1 ? slice.slice(0, lastBrace).trim() : slice.trim();
  }

  return { themeCss, utilityCss };
}

// --- Unmatched detection [ENG-01] ---

/**
 * Unescape a CSS selector identifier back to its original class name.
 * Handles:
 * - `\\:` → `:` (escaped colons for variants like hover\:bg-blue)
 * - `\\/` → `/` (escaped slashes for fractions like w-1\/2)
 * - `\\32 xl` → `2xl` (numeric escapes: `\XX ` where XX is hex code point + mandatory space)
 * - `\\.` → `.` (escaped dots for arbitrary values)
 * - Generic `\\X` → `X`
 */
function unescapeCssSelector(escaped: string): string {
  // CSS unescape regex: matches hex escape sequences (\HHHHHH + optional space) OR
  // single-char escapes (\X). Used in .replace() callback with capture group references.
  // RATIONALE: stays raw -- backreference capture groups in alternation with hex ranges
  // and quantifier limits ({1,6}) cannot be expressed in magic-regexp.
  return escaped.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_, hex, ch) => {
    if (hex) return String.fromCodePoint(parseInt(hex, 16));
    return ch;
  });
}

function detectMatches(
  candidates: string[],
  utilityCss: string,
): { matched: Set<string>; unmatched: string[] } {
  // Extract class selectors from CSS. Tailwind emits one selector per rule.
  // Selectors may contain escaped chars: \: \[ \] \{ \} \, \/ \. \32 (numeric)
  // Numeric escapes include a mandatory space: \32 xl means char 0x32 ('2') + 'xl'.
  // We capture from the leading dot up to the opening brace, handling escaped
  // characters as single units so escaped commas/braces don't terminate prematurely.
  // Selector extraction regex: matches CSS class selectors handling escaped characters
  // (hex escapes \HHHHHH, single-char escapes \X) and stops at opening brace.
  // Non-capturing groups, character class exclusions, and hex range quantifiers.
  // RATIONALE: stays raw -- nested alternation within character groups, hex range
  // quantifiers ({1,6}), and non-capturing groups with non-greedy modifiers exceed
  // magic-regexp's expressive capability.
  const selectorRe = /^\s*\.((?:\\[0-9a-fA-F]{1,6}\s?|\\.|[^{,\s])*)\s*(?:,.*?)?\s*\{/gm;
  const generated = new Set<string>();
  let m;
  while ((m = selectorRe.exec(utilityCss)) !== null) {
    generated.add(unescapeCssSelector(m[1].trimEnd()));
  }

  const matched = new Set<string>();
  const unmatched: string[] = [];
  for (const c of candidates) {
    if (generated.has(c)) matched.add(c);
    else unmatched.push(c);
  }
  return { matched, unmatched };
}

// --- Public API ---
export interface TwGenerateCSSResult {
  /** Raw CSS for all matched tokens (without @layer wrappers) */
  css: string;
  /** :root CSS variable definitions from theme layer */
  themeCss: string;
  /** Tokens that successfully generated CSS */
  matched: Set<string>;
  /** Tokens that produced no CSS (coverage gaps) */
  unmatched: string[];
  /** Warnings for unmatched tokens */
  warnings: Warning[];
}

/**
 * Generate CSS from a set of Tailwind class tokens using Tailwind's
 * native compile().build() API.
 *
 * @param tokens - Set of Tailwind class tokens to generate CSS for
 * @param css - Optional CSS string with @custom-variant, @theme, or other Tailwind directives
 * @returns TwGenerateCSSResult with CSS string, theme CSS, and match info
 */
export async function twGenerateCSS(
  tokens: Set<string>,
  css?: string,
): Promise<TwGenerateCSSResult> {
  // Early return for empty token set
  if (tokens.size === 0) {
    return {
      css: "",
      themeCss: "",
      matched: new Set<string>(),
      unmatched: [],
      warnings: [],
    };
  }

  // Build CSS input [ENG-03: source(none) prevents file scanning]
  const parts: string[] = ['@import "tailwindcss" source(none);'];
  if (css) parts.push(css);
  const cssInput = parts.join("\n");

  // Fresh compile() per call to avoid cumulative build() state leaking
  // across calls with different candidate sets. compile() is ~4ms which
  // is acceptable for a build-time tool. [ENG-04: cache by cssInput]
  const candidates = [...tokens];
  const cacheKey = cssInput + "\0" + JSON.stringify([...tokens].sort());
  const cached = _cache.get(cacheKey);
  if (cached) {
    // Return a defensive copy so callers can't mutate the cache
    return {
      css: cached.css,
      themeCss: cached.themeCss,
      matched: new Set(cached.matched),
      unmatched: [...cached.unmatched],
      warnings: cached.warnings.map((w: Warning) => ({ ...w, location: { ...w.location } })),
    };
  }

  let compiler;
  try {
    compiler = await compile(cssInput, { loadStylesheet });
  } catch (err: unknown) {
    // Malformed @theme CSS (e.g. invalid declarations) causes CssSyntaxError.
    // Gracefully degrade: return empty CSS with a theme-parse-error warning.
    const msg = err instanceof Error ? err.message : String(err);
    const warnings: Warning[] = [{
      type: "theme-parse-error" as const,
      message: `Tailwind CSS compilation error: ${msg}`,
      location: { line: 0, column: 0 },
    }];
    // Still try to generate without theme by compiling base CSS only
    const fallbackInput = '@import "tailwindcss" source(none);';
    const fallbackCompiler = await compile(fallbackInput, { loadStylesheet });
    const fallbackOutput = fallbackCompiler.build(candidates);
    const { themeCss: fallbackTheme, utilityCss: fallbackUtility } = extractLayers(fallbackOutput);
    const { unmatched: fallbackUnmatched } = detectMatches(candidates, fallbackUtility);
    warnings.push(...fallbackUnmatched.map((token) => ({
      type: "unmatched-class" as const,
      message: `Unmatched Tailwind class: "${token}" -- no CSS generated`,
      location: { line: 0, column: 0 },
    })));
    return {
      css: fallbackUtility,
      themeCss: fallbackTheme,
      matched: new Set(candidates.filter((c) => !fallbackUnmatched.includes(c))),
      unmatched: fallbackUnmatched,
      warnings,
    };
  }
  const output = compiler.build(candidates);

  // Extract layers [ENG-05]
  const { themeCss: extractedTheme, utilityCss } = extractLayers(output);

  // Detect unmatched [ENG-01]
  const { matched, unmatched } = detectMatches(candidates, utilityCss);

  const warnings: Warning[] = unmatched.map((token) => ({
    type: "unmatched-class" as const,
    message: `Unmatched Tailwind class: "${token}" -- no CSS generated`,
    location: { line: 0, column: 0 },
  }));

  const result: TwGenerateCSSResult = {
    css: utilityCss,
    themeCss: extractedTheme,
    matched,
    unmatched,
    warnings,
  };
  // Cache a defensive copy to prevent mutation poisoning.
  // Freeze strings (css, themeCss) are immutable. Clone mutable containers.
  _cache.set(cacheKey, {
    css: utilityCss,
    themeCss: extractedTheme,
    matched: new Set(matched),
    unmatched: [...unmatched],
    warnings: warnings.map((w) => ({ ...w, location: { ...w.location } })),
  });
  return result;
}

/**
 * Reset the Tailwind generator cache (for testing only).
 */
export function resetTwGenerator(): void {
  _cache.clear();
}
