# Feature Research: Tailwind compile() Migration

**Domain:** Engine swap from UnoCSS to Tailwind v4 native `compile().build()` API
**Researched:** 2026-04-05
**Confidence:** MEDIUM-HIGH

---

## Context: What Changes With the Engine Swap

The v2.0 milestone replaces UnoCSS (`@unocss/core` + `preset-wind4`) with Tailwind CSS v4's own `compile().build()` API. The existing public API (`ConvertOptions`/`ConvertResult`) is preserved. This research covers the exact behavior of `compile().build()` and what features change, simplify, or need new implementation.

---

## Tailwind v4 `compile().build()` API: Verified Behavior

**Source:** Tailwind CSS v4.2.2 source code (`packages/tailwindcss/src/index.ts`)
**Confidence:** HIGH -- read directly from tagged release source

### Function Signatures

```typescript
// Main entry point
async function compile(
  css: string,
  opts?: CompileOptions
): Promise<{
  sources: { base: string; pattern: string; negated: boolean }[]
  root: Root
  features: Features
  build(candidates: string[]): string
  buildSourceMap(): DecodedSourceMap
}>

// Options
type CompileOptions = {
  base?: string
  from?: string
  polyfills?: Polyfills
  loadModule?: (id: string, base: string, resourceHint: 'plugin' | 'config') => Promise<{ path: string; base: string; module: Plugin | Config }>
  loadStylesheet?: (id: string, base: string) => Promise<{ path: string; base: string; content: string }>
}
```

### Key Behaviors

#### 1. build() Is Additive/Incremental Across Calls

The `build()` method maintains an internal `allValidCandidates: Set<string>` that accumulates across invocations. The source code explicitly states: *"This currently assumes that we only add new candidates and never remove any."*

Each call to `build(newCandidates)`:
- Adds new candidates to the persistent set (skipping known invalid ones)
- Checks if the set size changed
- If changed: recompiles ALL accumulated candidates and returns new CSS
- If unchanged: returns cached CSS string

**Implication for vanillify:** We can call `build()` once with all extracted class tokens. No need for per-class calls. A single `build(allTokens)` produces the complete CSS.

#### 2. Unmatched Candidates Are Silently Dropped

Tailwind's `build()` checks each candidate against `designSystem.invalidCandidates`. Invalid candidates are:
- Added to an internal `invalidCandidates` Set via `onInvalidCandidate()` callback
- **Silently skipped** -- no error, no warning, no return value indicating failure
- Excluded from all future compilation (cached as invalid)

**Critical difference from UnoCSS:** UnoCSS's `generate()` returns a `matched: Set<string>` that lets vanillify compute `unmatched = tokens.filter(t => !matched.has(t))`. Tailwind's `build()` returns ONLY a CSS string. There is no public API to retrieve which candidates matched or failed.

**Implication for vanillify:** Detecting unmatched classes requires a workaround. See "Unmatched Class Detection" feature below.

#### 3. CSS Output Format: @layer Wrappers + :root Theme Variables

The compiled CSS string from `build()` includes the full stylesheet -- not just utility rules. When compiling `@import "tailwindcss" source(none);` with `@theme` blocks, the output contains:

```css
@layer theme, base, components, utilities;

@layer theme {
  :root {
    --color-brand: #3ab7bf;
    --spacing-18: 4.5rem;
    /* ... all theme variables as CSS custom properties ... */
  }
}

@layer base {
  /* preflight/reset styles */
}

@layer utilities {
  .bg-brand {
    background-color: var(--color-brand);
  }
  .p-4 {
    padding: calc(var(--spacing) * 4);
  }
  .hover\:bg-brand-dark:hover {
    background-color: var(--color-brand-dark);
  }
}
```

**Key differences from UnoCSS output:**
- Uses real CSS `@layer` declarations (UnoCSS uses `/* layer: theme */` comments)
- Theme variables emitted as `:root` block inside `@layer theme` (UnoCSS inlines values or uses a separate theme layer comment)
- Utilities reference `var(--color-brand)` not raw hex values (UnoCSS inlines the computed value)
- Selectors use Tailwind's escaping: `.hover\:bg-brand-dark:hover` (UnoCSS uses similar but not identical escaping)
- Output includes preflight/base styles unless you exclude them
- Utilities sorted by variant order, property index, property count, then alphabetically

#### 4. @theme Processing: Native, Zero Translation Needed

When `@theme` blocks are included in the CSS string passed to `compile()`, Tailwind:
- Parses all `--namespace-name: value` declarations
- Registers them as design tokens
- Generates corresponding utility classes when candidates match
- Emits `:root` CSS custom properties in `@layer theme`

This eliminates vanillify's entire `src/theme/` directory (parser.ts, mapper.ts, types.ts) which manually translates `@theme` CSS to UnoCSS theme config objects.

**`@theme inline` and `@theme static` modifiers** are also handled natively:
- `@theme inline`: Inlines variable values directly into utility declarations instead of using `var()` references
- `@theme static`: Ensures variables are always emitted in `:root` even if no utility uses them

#### 5. @custom-variant Processing: Native, Zero Translation Needed

Tailwind v4 natively processes `@custom-variant` directives in the CSS input:

```css
@custom-variant ui-checked (&[ui-checked]);

/* Block syntax for complex variants: */
@custom-variant any-hover {
  @media (any-hover: hover) {
    &:hover {
      @slot;
    }
  }
}
```

When a candidate like `ui-checked:bg-red-500` is passed to `build()`, Tailwind generates:

```css
.ui-checked\:bg-red-500[ui-checked] {
  background-color: var(--color-red-500);
}
```

This eliminates vanillify's entire `src/variants/` directory (parser.ts, resolver.ts, types.ts) which manually parses `@custom-variant` CSS and converts to UnoCSS `VariantObject` entries.

#### 6. source(none) Directive: Disables File Scanning

```css
@import "tailwindcss" source(none);
```

This completely disables automatic source file detection. Tailwind will NOT scan any files -- it relies entirely on candidates passed to `build()`. This is exactly what vanillify needs since class extraction is handled by oxc-parser.

**Critical requirement:** When using `@import "tailwindcss"`, the `loadStylesheet` callback MUST be provided. Without it, `compile()` throws: `"No loadStylesheet function provided to compile"`. The callback must resolve the `tailwindcss` import to the actual Tailwind CSS content.

#### 7. loadStylesheet Callback: Required for @import Resolution

```typescript
import { compile } from 'tailwindcss';
// Must load the Tailwind base stylesheet
import tailwindCss from 'tailwindcss/index.css?raw';  // or read from node_modules

const compiler = await compile(
  `@import "tailwindcss" source(none);\n${userThemeCss}\n${userVariantCss}`,
  {
    loadStylesheet: async (id, base) => {
      if (id === 'tailwindcss') {
        return {
          path: 'virtual:tailwindcss/index.css',
          base,
          content: tailwindCss,
        };
      }
      throw new Error(`Cannot load stylesheet: ${id}`);
    },
  }
);
```

**Alternative:** Use `@tailwindcss/node` package which provides a pre-configured `compile()` wrapper with filesystem-based `loadStylesheet` and `loadModule`. However, this adds a file system dependency that vanillify's library API avoids.

---

## Table Stakes (Must Have for Engine Swap)

Features that are non-negotiable for the v2.0 migration.

| Feature | Why Required | Complexity | Notes |
|---------|-------------|------------|-------|
| Single `build()` call for all candidates | Replace UnoCSS `generator.generate(tokens)` with `compiler.build(Array.from(tokens))` | LOW | Direct API swap. `build()` accepts `string[]`, UnoCSS accepted `Set<string>`. Trivial conversion. |
| Unmatched class detection | Current `ConvertResult.warnings` includes `unmatched-class` entries. Users rely on this. | MEDIUM | Tailwind provides NO API for this. Requires workaround (see detailed spec below). |
| @layer stripping from utility output | Vanillify outputs bare CSS rules, not `@layer` wrapped. Current code strips `@layer` wrappers from UnoCSS output. | LOW | Parse or regex-strip `@layer utilities { ... }` from build output. Same pattern as current `stripLayerWrappers()`. |
| Theme CSS extraction (`:root` variables) | `ConvertResult.themeCss` returns theme layer CSS separately | LOW | Extract `@layer theme { :root { ... } }` block from build output. Simpler than UnoCSS's `/* layer: theme */` comment parsing. |
| Preserve `ConvertOptions` shape | `customVariants`, `themeCss`, `outputFormat` options must still work | LOW | Both options become CSS strings prepended to the `compile()` input. No translation needed. |
| `compile()` instance caching | UnoCSS generator is cached by variant+theme key. Same pattern needed for Tailwind compiler. | LOW | Cache by hash of CSS input string (theme + variants + base). Same `_cache` Map pattern. |
| loadStylesheet callback | Required for `@import "tailwindcss"` resolution | LOW | Read `tailwindcss/index.css` from `node_modules` at startup. Cache the content string. |
| Preflight/base style exclusion | Vanillify outputs only utility CSS, not reset/preflight styles | LOW | Use `@import "tailwindcss/utilities" source(none);` instead of `@import "tailwindcss"` to exclude preflight, OR strip `@layer base` from output |

## Differentiators (Competitive Advantages from Engine Swap)

Features that improve vanillify's value proposition specifically because of the Tailwind native engine.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| 100% Tailwind CSS fidelity | UnoCSS preset-wind4 has known gaps (marked "not fully ready" by maintainers). Native Tailwind = zero fidelity issues. Every utility, every variant, every arbitrary value works exactly as Tailwind intended. | LOW (it's inherent) | The primary motivation for the engine swap. |
| Native `@theme` support (all namespaces) | UnoCSS required manual namespace mapping that was incomplete. Tailwind handles ALL namespaces natively: `--animate-*`, `--perspective-*`, `--ease-*`, `--blur-*`, `--inset-shadow-*`, etc. | ZERO (delete code) | Deletes `src/theme/parser.ts`, `src/theme/mapper.ts`, `src/theme/types.ts`. |
| Native `@custom-variant` support (all forms) | UnoCSS could not handle `@custom-variant` at all. Vanillify had a custom translation layer. Tailwind handles shorthand syntax, block syntax with `@slot`, and nested media queries natively. | ZERO (delete code) | Deletes `src/variants/parser.ts`, `src/variants/resolver.ts`, `src/variants/types.ts`. |
| `@theme inline` support | Inlines variable values into utility declarations. UnoCSS had no equivalent. Now free. | ZERO | Automatically works when user includes `@theme inline { ... }` in their theme CSS. |
| `@theme static` support | Forces variable emission even for unused tokens. Useful for design system docs. | ZERO | Automatically works. |
| Future Tailwind features for free | Any new Tailwind v4.x utility, variant, or directive works in vanillify without code changes -- just bump the dependency. | ZERO (ongoing) | With UnoCSS, every new Tailwind feature required preset-wind4 to add support. |

## Anti-Features (Do NOT Build)

| Anti-Feature | Why Tempting | Why Problematic | What to Do Instead |
|--------------|-------------|-----------------|-------------------|
| Expose `DesignSystem` to users | Power users might want raw access to Tailwind's design system | `__unstable__loadDesignSystem` is explicitly unstable. Leaking it couples vanillify's public API to Tailwind internals. | Keep `ConvertOptions`/`ConvertResult` as the only public surface. |
| Support `loadModule` for JS plugins | Users might want Tailwind JS plugins in vanillify | Adds filesystem dependency, makes API impure, opens plugin compatibility surface area. Vanillify is a converter, not a Tailwind build tool. | Document: "vanillify supports CSS-based configuration only (`@theme`, `@custom-variant`, `@utility`). For JS plugins, run Tailwind directly." |
| Include preflight in output | Some users might want Tailwind's base reset | Vanillify converts component classes to vanilla CSS. Mixing in browser resets conflates concerns. | Output utilities only. Users can add Tailwind's preflight separately if needed. |
| Per-candidate CSS generation | Generate CSS for each class individually for fine-grained mapping | `build()` compiles all candidates together because utilities can share `@keyframes`, `@property` declarations, and variable definitions. Splitting per-candidate would duplicate shared rules. | Generate all CSS in one `build()` call. Use CSS output parsing to attribute rules to node indices. |
| Source map support via `buildSourceMap()` | Nice for debugging | Vanillify's output maps node indices to generated CSS, not source positions. The source map tracks Tailwind's CSS compilation, not vanillify's JSX-to-CSS transformation. | Defer. Source maps are meaningful only if vanillify tracks original JSX positions, which is a larger feature. |

---

## Detailed Feature Specifications

### 1. Unmatched Class Detection (MEDIUM complexity)

**Problem:** Tailwind's `build()` silently drops invalid candidates. UnoCSS returned `matched: Set<string>`, letting vanillify compute `unmatched = tokens.filter(t => !matched.has(t))`. Tailwind provides no equivalent.

**Approach: CSS output inspection**

For each token passed to `build()`, check if the generated CSS contains a rule with that token as (part of) a selector. This is the most reliable approach because it works regardless of Tailwind internals.

```typescript
function detectUnmatched(tokens: Set<string>, css: string): string[] {
  const unmatched: string[] = [];
  for (const token of tokens) {
    // Tailwind escapes special chars in selectors: hover:bg-red-500 -> hover\:bg-red-500
    // A matched token will appear as .escaped-token in the CSS output
    const escaped = escapeForCssSelector(token);
    if (!css.includes(`.${escaped}`)) {
      unmatched.push(token);
    }
  }
  return unmatched;
}
```

**Why not use separate `build()` calls per candidate?**
- `build()` is additive -- candidates accumulate. You cannot reset between calls without creating a new `compile()` instance.
- Creating a new compiler per candidate is prohibitively expensive (full CSS parse + AST build).
- Shared declarations (`@keyframes`, `@property`) would be duplicated.

**Why not use `__unstable__loadDesignSystem` to access `invalidCandidates`?**
- The API is explicitly unstable (prefixed with `__unstable__`).
- It requires separate compilation from `compile()`, duplicating work.
- Coupling to internals breaks when Tailwind changes.

**Confidence:** MEDIUM -- CSS-inspection approach is robust but depends on Tailwind's selector escaping being consistent. Need to verify edge cases (arbitrary values like `bg-[#ff0000]`, variant stacking like `hover:focus:text-red-500`).

### 2. CSS Output Parsing and Layer Separation (LOW complexity)

**Problem:** Tailwind's `build()` returns the ENTIRE compiled stylesheet, including `@layer theme`, `@layer base`, and `@layer utilities`. Vanillify needs to separate these.

**What vanillify needs from the output:**

| Output | Source in Tailwind Output | Maps to `ConvertResult` |
|--------|--------------------------|------------------------|
| Utility CSS (bare rules, no @layer wrapper) | `@layer utilities { ... }` block | `css` field |
| Theme CSS (:root variables) | `@layer theme { :root { ... } }` block | `themeCss` field |
| Base/preflight | `@layer base { ... }` block | Discarded |

**Approach:** Parse the CSS output to extract layer blocks. Options:
1. **Regex extraction** (simplest): Match `@layer utilities {` and extract inner content, same as current `stripLayerWrappers()`. Already proven in the codebase.
2. **Exclude base at compile time**: Use `@import "tailwindcss/utilities" source(none);` plus `@import "tailwindcss/theme";` to get only utility + theme layers. Avoids needing to strip base.

**Recommendation:** Option 2 -- use granular imports to avoid base/preflight entirely:

```typescript
const inputCss = [
  '@import "tailwindcss/theme";',
  '@import "tailwindcss/utilities" source(none);',
  userThemeCss,    // @theme { ... } blocks
  userVariantCss,  // @custom-variant directives
].filter(Boolean).join('\n');
```

This gives cleaner output. The `loadStylesheet` callback needs to resolve `tailwindcss/theme` and `tailwindcss/utilities` paths.

**Confidence:** MEDIUM -- Granular imports are documented in Tailwind v4 but need verification that they work correctly with `compile()` programmatic API (not just the CLI).

### 3. Compiler Instance Caching (LOW complexity)

**Problem:** `compile()` is async and parses CSS + builds a design system. It should not be called per-conversion.

**Current pattern (UnoCSS):**
```typescript
const _cache = new Map<string, Generator>();
// keyed by hash of variant names + theme config
```

**New pattern (Tailwind):**
```typescript
const _cache = new Map<string, Awaited<ReturnType<typeof compile>>>();
// keyed by hash of the full CSS input string (includes @theme, @custom-variant, @import)
```

The cache key is simpler: hash the entire CSS input string. The CSS input deterministically defines the compiler configuration (theme, variants, imports). No need to separately hash variant names and theme config.

**Confidence:** HIGH -- same pattern as current code, simpler key derivation.

### 4. Selector Rewriting Compatibility (MEDIUM complexity)

**Problem:** Vanillify's rewriter replaces Tailwind class selectors in generated CSS with indexed names (`.node0`, `.node1`). The rewriter needs to find selectors like `.bg-brand`, `.hover\:bg-red-500` in the CSS output and replace them.

**Tailwind's selector format:**
- Standard: `.bg-red-500` (same as UnoCSS)
- Variants: `.hover\:bg-red-500:hover` (the variant prefix is part of the class name, the pseudo-class is appended)
- Stacked variants: `.dark\:hover\:bg-red-500:hover` within `@media (prefers-color-scheme: dark) { ... }`
- Arbitrary values: `.bg-\[\#ff0000\]` (brackets and hash escaped)
- Custom variants: `.ui-checked\:bg-red-500[ui-checked]` (custom variant selector appended)

**Differences from UnoCSS:**
- UnoCSS prefixes classes with variant info differently in some cases
- Tailwind uses real CSS `@layer`, UnoCSS uses comments
- Arbitrary value escaping may differ slightly

**Impact on rewriter:** The `buildSelectorPattern()` and `buildSelectorReplacement()` functions in `pipeline/rewriter.ts` need testing against Tailwind's output format. The escaping rules are CSS-standard so they should be compatible, but edge cases (arbitrary values with special chars) need regression tests.

**Confidence:** MEDIUM -- Standard CSS escaping should work, but the rewriter has complex regex that was tuned for UnoCSS's specific output.

### 5. CSS Variable References in Utilities (LOW complexity, but notable)

**Behavioral difference:** Tailwind v4 utilities reference theme values via `var()`:

```css
/* Tailwind v4 output */
.bg-brand {
  background-color: var(--color-brand);
}

/* UnoCSS output (current) */
.bg-brand {
  background-color: #3ab7bf;
}
```

**Implication:** The generated vanilla CSS will use CSS variable references. This means:
- The `:root` theme variables block is REQUIRED for the utilities to work
- `ConvertResult.themeCss` becomes functionally necessary (not just nice-to-have)
- Users who don't include the theme CSS in their page will get broken styles

**This is actually correct Tailwind v4 behavior.** Tailwind v4 utilities are designed to reference CSS variables. The `@theme inline` modifier is available for users who want inlined values instead.

**Confidence:** HIGH -- this is verified behavior from Tailwind docs and source code.

### 6. ConvertOptions Simplification (LOW complexity)

**Current `customVariants` option accepts:**
- CSS string with `@custom-variant` directives
- Record object mapping variant names to selector templates

**New behavior:** Only the CSS string form is needed. The Record form was necessary because UnoCSS required `VariantObject` entries (name + match function). Tailwind accepts raw CSS directly.

**Recommendation:** Keep both forms for backward compatibility. If a Record is provided, generate the `@custom-variant` CSS string from it:

```typescript
function variantsToCSS(variants: Record<string, string>): string {
  return Object.entries(variants)
    .map(([name, selector]) => `@custom-variant ${name} (${selector});`)
    .join('\n');
}
```

This is simpler than the current `resolveVariants()` which converts to UnoCSS `VariantObject` entries.

**Confidence:** HIGH -- straightforward string generation.

---

## Feature Dependencies

```
[compile() integration]
    requires -> [loadStylesheet callback]
    requires -> [CSS output parsing / layer separation]
    requires -> [compiler caching]
    enables  -> [unmatched class detection]
    enables  -> [selector rewriting compatibility]

[loadStylesheet callback]
    requires -> tailwindcss package as dependency
    requires -> reading tailwindcss/index.css (or theme + utilities separately)

[delete src/theme/]
    requires -> [compile() integration] working with @theme CSS
    blocked-by -> regression tests passing

[delete src/variants/]
    requires -> [compile() integration] working with @custom-variant CSS
    blocked-by -> regression tests passing

[unmatched class detection]
    requires -> [compile() integration] (needs CSS output to inspect)
    independent of -> [layer separation] (can inspect full CSS)

[selector rewriting]
    requires -> [compile() integration] (CSS output format determines regex patterns)
    may-require -> regex adjustments for Tailwind's escaping
```

---

## MVP Recommendation for Engine Swap

**Phase 1: Foundation (must ship first)**
1. Add `tailwindcss` as dependency, implement `loadStylesheet` callback
2. Replace `getGenerator()` / `generateCSS()` with Tailwind `compile().build()` wrapper
3. Implement CSS output layer separation (extract utility + theme layers)
4. Implement unmatched class detection via CSS inspection
5. Verify selector rewriting works with Tailwind output

**Phase 2: Cleanup (after foundation works)**
1. Delete `src/theme/` directory (parser, mapper, types)
2. Delete `src/variants/` directory (parser, resolver, types)
3. Simplify `ConvertOptions` processing (both forms -> CSS string)
4. Remove `@unocss/core`, `@unocss/preset-wind4`, `magic-regexp` dependencies

**Phase 3: Verification**
1. Run all existing tests -- they should pass with zero changes to test expectations
2. Add new tests for Tailwind-specific features (`@theme inline`, `@theme static`, block `@custom-variant`)
3. Verify arbitrary value handling, stacked variants, responsive variants

**Defer:**
- Source map support
- JS plugin support
- Preflight inclusion option

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Risk | Priority |
|---------|-----------|-------------------|------|----------|
| compile().build() integration | CRITICAL | MEDIUM | MEDIUM | P0 |
| loadStylesheet callback | CRITICAL (blocker) | LOW | LOW | P0 |
| CSS layer separation | CRITICAL | LOW | LOW | P0 |
| Compiler caching | HIGH | LOW | LOW | P0 |
| Unmatched class detection | HIGH | MEDIUM | MEDIUM | P0 |
| Selector rewriting compat | HIGH | MEDIUM | MEDIUM | P0 |
| Delete src/theme/ | MEDIUM (simplification) | LOW | LOW | P1 |
| Delete src/variants/ | MEDIUM (simplification) | LOW | LOW | P1 |
| ConvertOptions simplification | LOW | LOW | LOW | P1 |
| Remove UnoCSS deps | LOW (cleanup) | LOW | LOW | P1 |
| @theme inline/static tests | MEDIUM | LOW | LOW | P2 |
| Source map support | LOW | HIGH | HIGH | P3 |

---

## Sources

- [Tailwind CSS v4.2.2 source: index.ts](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.2.2/packages/tailwindcss/src/index.ts) -- compile(), build(), CompileOptions verified (HIGH confidence)
- [Tailwind CSS v4.2.2 source: compile.ts](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.2.2/packages/tailwindcss/src/compile.ts) -- compileCandidates internal behavior (HIGH confidence)
- [Tailwind CSS v4.2.2 source: @tailwindcss/node](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.2.2/packages/%40tailwindcss-node/src/compile.ts) -- loadStylesheet wrapper (HIGH confidence)
- [Tailwind CSS Functions and Directives docs](https://tailwindcss.com/docs/functions-and-directives) -- @theme, @custom-variant, @source, source(none) syntax (HIGH confidence)
- [Tailwind CSS Theme Variables docs](https://tailwindcss.com/docs/theme) -- @theme output format, inline/static modifiers, namespace mappings (HIGH confidence)
- [Tailwind CSS Adding Custom Styles docs](https://tailwindcss.com/docs/adding-custom-styles) -- @custom-variant block syntax, @slot directive, compiled output examples (HIGH confidence)
- [Tailwind CSS Detecting Classes docs](https://tailwindcss.com/docs/detecting-classes-in-source-files) -- source(none) behavior (HIGH confidence)
- [GitHub Discussion #16581](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- Programmatic usage examples (MEDIUM confidence)
- [GitHub Discussion #15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881) -- Compile API discussion, maintainer guidance (MEDIUM confidence)
- [Tailwind CSS v4.0 announcement](https://tailwindcss.com/blog/tailwindcss-v4) -- Architecture overview, cascade layers, performance (HIGH confidence)

---

*Feature research for: Vanillify v2.0 -- Tailwind Compile Migration*
*Researched: 2026-04-05*
