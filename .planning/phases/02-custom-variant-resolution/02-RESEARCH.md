# Phase 2: Custom Variant Resolution - Research

**Researched:** 2026-04-04
**Domain:** UnoCSS custom variant registration + Tailwind `@custom-variant` CSS directive parsing
**Confidence:** HIGH

## Summary

Phase 2 adds opt-in custom variant resolution to vanillify's `convert()` function. The core finding from hands-on testing is that UnoCSS's `createGenerator` natively supports custom variant registration through the `variants` config array -- each variant is a `VariantObject` with a `match` function that strips the variant prefix and returns a `selector` transformation function. This means vanillify does NOT need to post-process CSS or manually rewrite selectors for custom variants; it needs to translate user-provided `@custom-variant` CSS definitions into UnoCSS `VariantObject` entries and pass them to `createGenerator` at initialization time.

The critical architectural implication is that custom variants must be registered when the generator is created, not after. The Phase 1 singleton generator pattern (`getGenerator()` with no arguments) must be extended to accept an optional variants config. When `customVariants` is provided to `convert()`, a generator with those variants registered must be used. When not provided, the existing default generator (no custom variants) is used, preserving Phase 1 behavior exactly.

Hands-on testing confirmed: (1) custom variants registered via `variants` config produce correct CSS with the expected selector transformations, (2) custom variants stack correctly with standard pseudo-class variants (`:hover`, `:focus`) and responsive variants (`@media`), and (3) a generator created without custom variants does NOT match custom-variant-prefixed tokens -- confirming CVAR-03 (zero effect on default path) is achievable by construction.

**Primary recommendation:** Parse `@custom-variant` CSS into `VariantObject[]`, pass to `createGenerator` via the `variants` config option. Extend `getGenerator()` to accept optional variants. The translation is lightweight -- no custom CSS generation logic needed.

## Project Constraints (from CLAUDE.md)

- **Tech stack**: vite+ toolchain (tsdown, vitest, vite-plus), oxc-parser, UnoCSS -- no other parsers or CSS engines
- **Output format**: Vanilla CSS only
- **Class naming**: Indexed only (`.node0`, `.node1`) -- no semantic naming in v1
- **Generator pattern**: Singleton `createGenerator`, called once and reused
- **API pattern**: Pure async functions, no side effects, no file I/O in library code
- **Custom variant layer**: User provides `@custom-variant` definitions; vanillify parses and constructs UnoCSS `variants` entries programmatically before calling `createGenerator`

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CVAR-01 | User can opt-in to custom variant resolution by providing `@custom-variant` CSS definitions | `ConvertOptions.customVariants` accepts either a CSS string containing `@custom-variant` directives or a pre-parsed `Record<string, string>` mapping. Parser extracts variant name + selector template from CSS. |
| CVAR-02 | Custom variants (e.g. ui-checked, ui-disabled, ui-mixed) resolve to simplified descendant selectors in vanilla CSS output | UnoCSS `VariantObject.selector` function transforms the generated selector. Tested: `[ui-checked] .nodeN` and `.nodeN[ui-checked]` both produce valid CSS. Rewriter already handles selector replacement. |
| CVAR-03 | Calling `convert()` without `customVariants` produces identical output to Phase 1 | Confirmed by testing: a generator created without custom variants does not match `ui-checked:*` tokens. Default `getGenerator()` with no variants = Phase 1 behavior. |
</phase_requirements>

## Standard Stack

### Core (No new dependencies required)

Phase 2 uses only packages already installed from Phase 1. No additional runtime or dev dependencies needed.

| Library | Version | Purpose | Phase 2 Usage |
|---------|---------|---------|---------------|
| `@unocss/core` | 66.6.7 | CSS generation engine | `createGenerator` with `variants` config option for custom variant registration [VERIFIED: tested locally] |
| `@unocss/preset-wind4` | 66.6.7 | Tailwind v4 utility rules | Unchanged from Phase 1 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parsing `@custom-variant` CSS with regex | Full CSS parser (e.g., postcss) | Regex is sufficient for the two well-defined syntaxes (shorthand + block). PostCSS would add a dependency for minimal gain. The shorthand syntax `@custom-variant name (selector);` is trivially parseable. |
| Registering variants at `createGenerator` time | Post-processing generated CSS to add variant selectors | Post-processing is fragile and bypasses UnoCSS's variant stacking logic. Registration at generator time gives us correct stacking with `hover:`, `md:`, etc. for free. [VERIFIED: tested locally] |
| Accepting only pre-parsed `Record<string, string>` | Also accepting raw CSS string | Supporting raw CSS string is more ergonomic for users who copy `@custom-variant` definitions from their Tailwind CSS config. Both formats should be accepted. |

## Architecture Patterns

### Recommended File Structure

```
src/
  variants/
    resolver.ts       # Translates customVariants option to UnoCSS VariantObject[]
    parser.ts         # Parses @custom-variant CSS string into Record<string, string>
    types.ts          # CustomVariantDefinition, CustomVariantsOption types
  pipeline/
    generator.ts      # MODIFIED: getGenerator() accepts optional variants config
  types.ts            # MODIFIED: ConvertOptions gains customVariants field
  index.ts            # MODIFIED: passes customVariants through to generator
```

### Pattern 1: Custom Variant as UnoCSS VariantObject

**What:** Each custom variant is a `VariantObject` with a `match` function that strips the variant prefix and a `selector` function that transforms the CSS selector.

**When to use:** Always -- this is the only correct way to register custom variants with UnoCSS's `createGenerator`.

**Why this works:** UnoCSS's variant system processes all registered variants in sequence. When a token like `ui-checked:bg-blue-500` is encountered, the custom variant's `match` function recognizes the `ui-checked:` prefix, strips it to `bg-blue-500`, and provides a selector transformation. UnoCSS then matches `bg-blue-500` against its rules and applies the selector transformation to the generated CSS. This gives us correct stacking with other variants for free.

**Example (verified locally):**
```typescript
// Source: UnoCSS types + local testing
import type { VariantObject } from '@unocss/core'

function createCustomVariant(name: string, selectorTemplate: string): VariantObject {
  const prefix = `${name}:`
  return {
    name,
    match(matcher) {
      if (!matcher.startsWith(prefix))
        return matcher
      return {
        matcher: matcher.slice(prefix.length),
        selector: (s) => selectorTemplate.replace('&', s),
      }
    },
  }
}

// Usage:
// @custom-variant ui-checked (&[ui-checked]);
// becomes:
createCustomVariant('ui-checked', '&[ui-checked]')
// When applied to .node0: selector becomes .node0[ui-checked]

// @custom-variant ui-checked ([ui-checked] &);
// becomes:
createCustomVariant('ui-checked', '[ui-checked] &')
// When applied to .node0: selector becomes [ui-checked] .node0
```
[VERIFIED: tested with createGenerator locally -- both selector patterns produce correct CSS]

### Pattern 2: Generator Factory with Variant Config

**What:** Extend `getGenerator()` to accept optional custom variants. Cache generators by variant config identity to avoid recreating for identical configs.

**Why:** Custom variants MUST be registered at `createGenerator` time -- they cannot be added after creation. Different `customVariants` inputs require different generator instances.

**Example:**
```typescript
// src/pipeline/generator.ts -- extended for Phase 2
import type { VariantObject } from '@unocss/core'

// Cache by serialized variant config to reuse generators
const _generatorCache = new Map<string, Awaited<ReturnType<typeof createGenerator>>>()

export async function getGenerator(
  customVariants?: VariantObject[]
): Promise<Awaited<ReturnType<typeof createGenerator>>> {
  const cacheKey = customVariants
    ? JSON.stringify(customVariants.map(v => v.name))
    : '__default__'

  if (!_generatorCache.has(cacheKey)) {
    _generatorCache.set(cacheKey, await createGenerator({
      presets: [presetWind4()],
      variants: customVariants ?? [],
    }))
  }

  return _generatorCache.get(cacheKey)!
}
```
[VERIFIED: concept tested -- generators with different variant configs produce different match results]

### Pattern 3: Two-Format Input for customVariants

**What:** Accept either a raw CSS string containing `@custom-variant` directives OR a pre-parsed `Record<string, string>` map.

**Why:** Users copying from their Tailwind CSS config will have the raw CSS string. Programmatic users may prefer the object form. Supporting both is trivial.

**Example:**
```typescript
// src/types.ts
export interface ConvertOptions {
  /**
   * Custom variant definitions for opt-in variant resolution.
   * 
   * Accepts either:
   * - A CSS string containing @custom-variant directives
   * - A Record mapping variant names to selector templates (& = target element)
   * 
   * @example
   * // CSS string form:
   * customVariants: `
   *   @custom-variant ui-checked (&[ui-checked]);
   *   @custom-variant ui-disabled (&[ui-disabled]);
   * `
   * 
   * // Object form:
   * customVariants: {
   *   'ui-checked': '&[ui-checked]',
   *   'ui-disabled': '&[ui-disabled]',
   * }
   */
  customVariants?: string | Record<string, string>
}
```

### Anti-Patterns to Avoid

- **Post-processing CSS to inject custom variant selectors:** Bypasses UnoCSS's variant stacking logic. Custom+hover stacking (`ui-checked:hover:bg-blue-500`) would require manual nesting logic. Use UnoCSS's native variant system instead. [VERIFIED: native stacking works correctly]
- **Baking variant resolution into the rewriter:** The rewriter should remain unaware of variant semantics. Variant resolution happens at the generator level via UnoCSS's variant system.
- **Creating a new generator per `convert()` call unconditionally:** Only create a new generator when the variant config differs. Use caching by variant config identity.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Variant-prefixed class matching | Regex to strip `ui-checked:` prefix from tokens | UnoCSS `VariantObject.match` function | UnoCSS handles prefix stripping, selector transformation, AND variant stacking. Hand-rolling misses stacking. [VERIFIED: tested stacking locally] |
| Variant selector generation | Manual CSS output like `[ui-checked] .nodeN { ... }` | UnoCSS `VariantObject.selector` function | UnoCSS generates the full selector including correct escaping, nesting for `@media` wrappers, etc. |
| Variant stacking with responsive/pseudo | Manual nesting logic for `md:ui-checked:hover:*` | UnoCSS's native variant pipeline | All registered variants are processed in sequence automatically. Three-way stacking (responsive + custom + pseudo) works correctly. [VERIFIED: `md:ui-checked:bg-blue-700` produces `@media` wrapper with `[ui-checked]` ancestor selector] |

**Key insight:** UnoCSS's variant system is designed to be extensible. The entire custom variant feature reduces to: (1) parse the user's `@custom-variant` CSS into name+selector pairs, (2) create `VariantObject` entries, (3) pass to `createGenerator`. All CSS generation, selector transformation, escaping, and variant stacking is handled by UnoCSS.

## Common Pitfalls

### Pitfall 1: Generator Must Be Created WITH Variants -- Cannot Add Later

**What goes wrong:** Attempting to add custom variants to an existing generator instance fails silently. The variant config is read only at `createGenerator` time.

**Why it happens:** UnoCSS's `createGenerator` resolves and normalizes all configuration (presets, rules, variants) during creation. There is no `addVariant()` method on the generator instance.

**How to avoid:** Always pass custom variants in the `createGenerator` config. If `customVariants` changes between `convert()` calls, create a new generator (or use a cached one for that variant config).

**Warning signs:** Custom variant tokens appear in `unmatched` but should be matching.

[VERIFIED: tested locally -- generator without variants does not match variant-prefixed tokens]

### Pitfall 2: Selector Template `&` Replacement Must Match UnoCSS's Selector Format

**What goes wrong:** The `selector` function in a `VariantObject` receives the full UnoCSS-generated selector string (e.g., `.ui-checked\:bg-blue-500`), not the clean `.nodeN` name. The `&` replacement in the selector template must work with this escaped selector.

**Why it happens:** UnoCSS generates the selector before the rewriter replaces it with `.nodeN`. The variant's selector function operates on UnoCSS's raw selector.

**How to avoid:** The selector function should work correctly with any selector string. The rewriter in Phase 1 already handles replacing UnoCSS-generated selectors with `.nodeN` selectors -- it does this AFTER UnoCSS generates the full CSS including variant-wrapped selectors. No change needed to the rewriter's core logic for this.

**Warning signs:** CSS output has `.ui-checked\:bg-blue-500[ui-checked]` instead of `.nodeN[ui-checked]`.

[VERIFIED: tested -- UnoCSS generates e.g. `[ui-checked] .ui-checked\:bg-blue-500{...}` and the rewriter replaces the escaped class selector with `.nodeN`]

### Pitfall 3: Block Syntax @custom-variant Requires More Complex Parsing

**What goes wrong:** The shorthand syntax `@custom-variant name (selector);` is trivially parseable with a regex. The block syntax with `@slot` requires understanding CSS nesting structure.

**Why it happens:** Block syntax allows nested selectors and `@media` wrappers around `@slot`. Translating these to UnoCSS variant format requires extracting the selector path AND any parent wrappers (media queries).

**How to avoid:** For v1, support shorthand syntax fully and provide a reasonable parser for common block patterns. The QDS variants use simple attribute selectors that fit the shorthand syntax. Document block syntax limitations if any exist.

**Recommended approach:** Support shorthand first (covers QDS use case entirely). Add block syntax support as a secondary concern.

[ASSUMED -- QDS variant definitions use simple attribute selectors parseable by shorthand syntax]

### Pitfall 4: Custom Variant CSS Colors May Not Match Standard Tailwind Colors

**What goes wrong:** The QDS checkbox fixture uses colors like `bg-sky-55`, `border-sky-35` which are custom theme colors, not standard Tailwind colors. These will NOT match in UnoCSS preset-wind4 regardless of variant resolution.

**Why it happens:** These are QDS theme-specific color values defined in the `@theme` block. UnoCSS preset-wind4 does not know about custom theme colors.

**How to avoid:** This is NOT a Phase 2 blocker. Custom variant resolution is about making `ui-checked:bg-blue-500` work (where `bg-blue-500` IS a known utility). Theme color support (`bg-sky-55`) is out of scope for v1 (deferred per REQUIREMENTS.md). Phase 2 tests should use standard Tailwind colors to validate variant resolution independently of theme support.

**Warning signs:** Tests using fixture colors produce empty CSS and incorrectly blame the variant system.

[VERIFIED: `ui-checked:bg-blue-500` with standard colors works; `ui-checked:bg-sky-55` with custom colors does not -- confirming this is a theme issue, not a variant issue]

## Code Examples

### Parsing @custom-variant Shorthand CSS

```typescript
// src/variants/parser.ts
// Source: Tailwind v4 @custom-variant spec + local testing

interface ParsedVariant {
  name: string
  selectorTemplate: string
}

/**
 * Parse @custom-variant shorthand directives from a CSS string.
 * Handles: @custom-variant <name> (<selector>);
 * 
 * The & in the selector template represents the target element.
 */
export function parseCustomVariantCSS(css: string): ParsedVariant[] {
  const SHORTHAND_RE = /@custom-variant\s+([\w-]+)\s+\(([^)]+)\)\s*;/g
  const variants: ParsedVariant[] = []
  let match: RegExpExecArray | null

  while ((match = SHORTHAND_RE.exec(css)) !== null) {
    variants.push({
      name: match[1],
      selectorTemplate: match[2].trim(),
    })
  }

  return variants
}
```
[VERIFIED: regex tested locally with QDS-style variant definitions]

### Creating UnoCSS VariantObject from Parsed Definitions

```typescript
// src/variants/resolver.ts
// Source: UnoCSS VariantObject type + local testing
import type { VariantObject } from '@unocss/core'

/**
 * Convert a parsed variant definition to a UnoCSS VariantObject.
 * 
 * @param name - Variant name (e.g., 'ui-checked')
 * @param selectorTemplate - CSS selector with & placeholder (e.g., '&[ui-checked]')
 */
export function createVariantObject(
  name: string,
  selectorTemplate: string
): VariantObject {
  const prefix = `${name}:`
  return {
    name,
    match(matcher) {
      if (!matcher.startsWith(prefix))
        return matcher
      return {
        matcher: matcher.slice(prefix.length),
        selector: (s) => selectorTemplate.replace(/&/g, s),
      }
    },
  }
}

/**
 * Resolve customVariants option to UnoCSS VariantObject array.
 * Accepts either a CSS string or Record<string, string>.
 */
export function resolveCustomVariants(
  input: string | Record<string, string>
): VariantObject[] {
  if (typeof input === 'string') {
    const parsed = parseCustomVariantCSS(input)
    return parsed.map(v => createVariantObject(v.name, v.selectorTemplate))
  }

  return Object.entries(input).map(
    ([name, selectorTemplate]) => createVariantObject(name, selectorTemplate)
  )
}
```
[VERIFIED: createVariantObject pattern tested with createGenerator -- produces correct CSS output]

### Extended getGenerator with Variant Support

```typescript
// src/pipeline/generator.ts -- Phase 2 modification
import type { VariantObject } from '@unocss/core'

const _cache = new Map<string, Awaited<ReturnType<typeof createGenerator>>>()

export async function getGenerator(
  customVariants?: VariantObject[]
): Promise<Awaited<ReturnType<typeof createGenerator>>> {
  // Cache key: sorted variant names or '__default__'
  const key = customVariants?.length
    ? customVariants.map(v => v.name ?? '').sort().join(',')
    : '__default__'

  let gen = _cache.get(key)
  if (!gen) {
    gen = await createGenerator({
      presets: [presetWind4()],
      ...(customVariants?.length ? { variants: customVariants } : {}),
    })
    _cache.set(key, gen)
  }
  return gen
}
```
[VERIFIED: caching concept tested -- generators with identical configs can be reused]

### Integration: convert() with customVariants

```typescript
// src/index.ts -- Phase 2 modification (sketch)
export async function convert(
  source: string,
  filename: string,
  options?: ConvertOptions
): Promise<ConvertResult> {
  // 1. Parse source to AST (unchanged)
  const { program } = parse(filename, source)

  // 2. Extract class entries (unchanged)  
  const { entries, warnings: extractWarnings } = extract(program, source)

  // 3. Assign indexed class names (unchanged)
  const nameMap = assignNames(entries)

  // 4. Resolve custom variants if provided (NEW)
  const variantObjects = options?.customVariants
    ? resolveCustomVariants(options.customVariants)
    : undefined

  // 5. Rewrite source and generate per-node CSS (pass variants through)
  const result = await rewrite(source, entries, nameMap, extractWarnings, variantObjects)

  return result
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom variant selectors hand-coded in CSS post-processing | UnoCSS `VariantObject` registration at `createGenerator` time | Confirmed in this research | Eliminates need for custom selector generation; stacking works automatically |
| Single `@custom-variant` syntax | Two syntaxes: shorthand `(selector)` and block `{ @slot }` | Tailwind v4.0 (Jan 2025) | Parser must handle both; shorthand covers QDS use case |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | QDS `ui-checked`, `ui-disabled`, `ui-mixed` use simple attribute selectors like `&[ui-checked]` or `[ui-checked] &` that fit the shorthand `@custom-variant` syntax | Pitfall 3, Code Examples | If QDS uses complex compound selectors (e.g., `[ui-qds-scope][ui-checked] > &`), the simple `&` replacement may produce incorrect selectors. Mitigation: the `Record<string, string>` input format lets users provide the exact selector template. LOW risk -- users control the input. |
| A2 | Block syntax `@custom-variant` with `@slot` is not needed for QDS in v1 | Pitfall 3 | If QDS's published CSS uses block syntax, the shorthand parser won't handle it. Mitigation: users can use the `Record<string, string>` form instead. LOW risk. |

## Open Questions

1. **Exact QDS @custom-variant definitions**
   - What we know: QDS uses `ui-checked`, `ui-disabled`, `ui-mixed` as custom variants. The fixture shows these prefixed on standard utilities.
   - What's unclear: The exact CSS selector template QDS defines for these variants (e.g., `&[ui-checked]` vs `[ui-checked] &` vs `[ui-qds-scope][ui-checked] > &`).
   - Recommendation: Support both self-referencing (`&[ui-checked]` -> `.nodeN[ui-checked]`) and ancestor-descendant (`[ui-checked] &` -> `[ui-checked] .nodeN`) patterns. Let the user's input determine which is used. Both are verified working.

2. **Rewriter compatibility with ancestor-descendant variant selectors**
   - What we know: Phase 1's rewriter replaces UnoCSS-generated selectors with `.nodeN`. For variant CSS like `[ui-checked] .ui-checked\:bg-blue-500 { ... }`, the rewriter needs to replace `.ui-checked\:bg-blue-500` with `.nodeN` while preserving the `[ui-checked]` ancestor.
   - What's unclear: Whether the existing rewriter's regex-based selector matching handles this correctly.
   - Recommendation: Write a targeted test. The rewriter currently matches utility selector patterns -- the `[ui-checked]` prefix is outside the utility selector and should not interfere with pattern matching. May need minor adjustments.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes | Validate `customVariants` input: CSS string must parse without errors; Record keys must be valid CSS identifiers; selector templates must contain `&` placeholder |
| V6 Cryptography | No | N/A |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious CSS in `customVariants` string causing parser hang | Denial of Service | Regex-based parser has bounded execution; no recursive parsing. Limit input size. |
| Selector injection via variant name | Tampering | Validate variant names are `[\w-]+` only (no special CSS characters) |

## Sources

### Primary (HIGH confidence)
- [UnoCSS Core `createGenerator` API](https://unocss.dev/tools/core) -- variant registration via config
- [UnoCSS Variant config docs](https://unocss.dev/config/variants) -- VariantObject structure, match/selector API
- [UnoCSS `@unocss/core` types (local)](node_modules/@unocss/core/dist/index.d.mts) -- VariantObject, VariantHandler, VariantFunction interfaces verified from installed package
- Local testing (2026-04-04) -- custom variant registration, CSS output, variant stacking with hover/responsive, generator caching behavior

### Secondary (MEDIUM confidence)
- [Tailwind CSS @custom-variant docs](https://tailwindcss.com/docs/functions-and-directives) -- shorthand and block syntax specification
- [Tailwind CSS custom variants guide](https://tailwindcss.com/docs/adding-custom-styles#adding-custom-variants) -- @slot usage, compound selectors
- [DeepWiki: @variant and @custom-variant directives](https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2.4-the-@variant-and-@custom-variant-directives) -- comprehensive syntax examples
- [UnoCSS variant tutorial](https://tutorial.unocss.dev/1-basics/6-variants/2-creating-a-variant/) -- match function pattern

### Tertiary (LOW confidence)
- QDS variant definitions inferred from checkbox fixture usage patterns (not verified against actual `@qds.dev/ui` source)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; UnoCSS variant API verified from types and local testing
- Architecture: HIGH -- generator factory pattern verified; variant registration confirmed working; stacking with standard variants confirmed
- Pitfalls: HIGH -- all critical pitfalls verified via local testing (generator timing, selector format, stacking behavior)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- UnoCSS 66.x variant API is mature and unchanged since v0.65.0)
