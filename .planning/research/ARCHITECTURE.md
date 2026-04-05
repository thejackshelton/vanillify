# Architecture Patterns

**Domain:** Tailwind v4 `compile().build()` integration into vanillify's existing pipeline
**Researched:** 2026-04-05
**Confidence:** HIGH for API shape and integration strategy, MEDIUM for edge cases (layer stripping, per-node isolation)

## Current Architecture (UnoCSS-Based)

```
convert(source, filename, options)
  1. parse(filename, source)              -> AST              [pipeline/parser.ts]
  2. extract(program, source)             -> NodeEntry[]      [pipeline/extractor.ts]
  3. assignNames(entries)                 -> NameMap           [pipeline/namer.ts]
  4. resolveCustomVariants(options)       -> VariantObject[]   [variants/resolver.ts]
  5. parseThemeCss + mapToThemeConfig     -> themeConfig       [theme/parser.ts, theme/mapper.ts]
  6. rewrite(source, entries, nameMap, ...)                    [pipeline/rewriter.ts]
     6a. generateCSS(tokens, variants, themeConfig) per node  [pipeline/generator.ts]
     6b. buildNodeCSS() selector rewriting
     6c. source string replacement
```

Key components being replaced:
- `pipeline/generator.ts` (170 lines) -- UnoCSS `createGenerator` + `generate()` + layer stripping + cache
- `theme/parser.ts` + `theme/mapper.ts` + `theme/types.ts` -- custom @theme-to-UnoCSS translation
- `variants/parser.ts` + `variants/resolver.ts` + `variants/types.ts` -- custom @custom-variant-to-UnoCSS translation

---

## Tailwind v4 compile() API Shape

Source: [tailwindcss package](https://github.com/tailwindlabs/tailwindcss), version 4.2.2. Confidence: HIGH (verified from source + multiple community examples).

### Core API

```typescript
import { compile } from 'tailwindcss';

// compile() is async -- parses CSS input, resolves @import, sets up design system
const compiler = await compile(cssInput, {
  base?: string,                    // Base path for resolving relative imports
  loadStylesheet?: (id: string, base: string) => Promise<{
    content: string;
    base: string;
  }>,
  loadModule?: (id: string, base: string, resourceHint: 'plugin' | 'config') => Promise<{
    module: Plugin | Config;
    base: string;
  }>,
});

// build() is synchronous -- generates CSS for a set of class candidates
const css: string = compiler.build(candidates: string[]);
```

### Return Shape from compile()

```typescript
{
  globs: { base: string; pattern: string }[];   // Source file patterns (unused by vanillify)
  build(candidates: string[]): string;           // The CSS generation method
}
```

### Key Properties

1. **`compile()` is expensive** -- parses CSS, resolves imports, builds the design system. Call once.
2. **`build()` is cheap** -- generates CSS from candidates against the pre-compiled design system. Call many times.
3. **`build()` is incremental** -- internally caches previous candidates. Calling with new candidates returns CSS for ALL candidates seen so far, not just the new ones.
4. **Theme + variants are CSS-native** -- `@theme` blocks and `@custom-variant` directives in the CSS input are processed by `compile()` directly. No translation layer needed.

---

## Recommended Architecture (Tailwind-Based)

### New Pipeline Flow

```
convert(source, filename, options)
  1. parse(filename, source)              -> AST              [pipeline/parser.ts]     UNCHANGED
  2. extract(program, source)             -> NodeEntry[]      [pipeline/extractor.ts]  UNCHANGED
  3. assignNames(entries)                 -> NameMap           [pipeline/namer.ts]      UNCHANGED
  4. (DELETED: resolveCustomVariants -- Tailwind handles @custom-variant natively)
  5. (DELETED: parseThemeCss/mapToThemeConfig -- Tailwind handles @theme natively)
  6. rewrite(source, entries, nameMap, ...)                    [pipeline/rewriter.ts]   MODIFIED
     6a. generateCSS(tokens, compiler) per node               [pipeline/generator.ts]  REWRITTEN
     6b. buildNodeCSS() selector rewriting                    SIMPLIFIED (see below)
     6c. source string replacement                            UNCHANGED
```

### The Adapter Module: `pipeline/generator.ts` (Rewritten)

This is the single file that bridges Tailwind's API to vanillify's pipeline. The entire UnoCSS integration (~170 lines) reduces to ~50-60 lines.

```typescript
// pipeline/generator.ts -- Thin Tailwind v4 adapter

import { compile } from 'tailwindcss';

// --- Compiler cache ---
// Key: hash of the CSS input (theme + variants + base Tailwind)
// Value: compiled Tailwind compiler instance
const _cache = new Map<string, Awaited<ReturnType<typeof compile>>>();

/**
 * Get or create a Tailwind compiler instance.
 * The CSS input string IS the configuration -- it contains @theme, @custom-variant, etc.
 *
 * @param cssInput - Full CSS string including @import "tailwindcss" and any @theme/@custom-variant blocks
 */
export async function getCompiler(
  cssInput: string,
): Promise<Awaited<ReturnType<typeof compile>>> {
  const key = simpleHash(cssInput);
  let compiler = _cache.get(key);
  if (!compiler) {
    compiler = await compile(cssInput, {
      loadStylesheet,  // resolves tailwindcss sub-imports
    });
    _cache.set(key, compiler);
  }
  return compiler;
}

/**
 * Generate CSS for a set of Tailwind class tokens.
 * Uses a FRESH compiler.build() per node to get isolated CSS.
 *
 * IMPORTANT: build() is incremental -- it remembers previous candidates.
 * For per-node isolation, we need a fresh compiler per node OR we need
 * to call build() once with all candidates and then split the output.
 * See "Per-Node Isolation Strategy" section below.
 */
export async function generateCSS(
  tokens: Set<string>,
  compiler: Awaited<ReturnType<typeof compile>>,
): Promise<GenerateCSSResult> {
  const css = compiler.build([...tokens]);
  // ... unmatched detection, layer stripping, return
}
```

### Per-Node Isolation Strategy

This is the critical architectural decision. The current pipeline calls `generateCSS()` per node to get isolated CSS blocks, then rewrites selectors to `.nodeN`.

**Problem:** Tailwind's `build()` is incremental -- it accumulates candidates across calls. Calling `build(['flex'])` then `build(['grid'])` returns CSS for BOTH flex AND grid on the second call.

**Solution: Compile once, build per-node with fresh compilers**

Option A (Recommended): **Compile once, clone for each node**
- Call `compile()` once with the full CSS input (expensive, cached)
- For each node, call `compile()` again with the same CSS input -- but since `compile()` is cached by our adapter, subsequent calls for the same CSS input return the cached compiler
- WRONG: the cached compiler accumulates state in `build()`

Option B (Recommended): **Compile per-node**
- This is wasteful. compile() is expensive.

**Option C (Actual recommendation): Build ALL candidates at once, then attribute CSS rules to nodes**

This is the approach that matches Tailwind's design:

1. Collect ALL unique tokens across ALL nodes
2. Call `compiler.build(allTokens)` once
3. Parse the output CSS to attribute each rule back to its source token(s)
4. Group rules by node based on which tokens belong to which node

This is more efficient than per-node compilation but requires CSS rule attribution logic.

**Option D (Simplest, recommended for v2.0): Re-compile per node**

Since `compile()` is cached and `build()` is fast:
- Cache the compiled design system (the expensive part)
- For per-node isolation, create a fresh compiler per node from the same CSS input
- The `loadStylesheet` resolution is the expensive part of `compile()` -- if we cache the resolved CSS content, re-compilation is fast

After further analysis: **Option D is the pragmatic choice.** Here is why:

- Tailwind's `compile()` does CSS parsing + design system setup. For a library processing a single file at a time, calling it N times (once per node) with cached stylesheet resolution is acceptable.
- The alternative (Option C) requires building a CSS rule-to-token attribution system, which is complex and fragile.
- If performance becomes an issue, Option C can be implemented later as an optimization.

**Final recommendation: One compiler per convert() call, build per-node with separate compilers.**

Actually, the cleanest approach:

```typescript
// For each node:
//   1. Create a fresh compiler (cached CSS input, fast)
//   2. Call build() with just that node's tokens
//   3. Get isolated CSS output

// But compile() is async and involves CSS parsing...
// Re-compiling per node is ~5-10ms each. For 20 nodes, that is 100-200ms.
// This is acceptable for a build-time tool, not a hot-path.
```

### Revised Per-Node Strategy: Single compile, diff-based build

After deeper analysis, the best approach:

```typescript
// 1. compile() once (cached)
const compiler = await getCompiler(cssInput);

// 2. For per-node isolation, use build() incrementally and diff:
let previousCss = '';
for (const node of nodes) {
  const allTokensSoFar = [...previousTokens, ...node.tokens];
  const fullCss = compiler.build(allTokensSoFar);
  const nodeCss = diffCss(fullCss, previousCss);  // New CSS = this node's contribution
  previousCss = fullCss;
}
```

**Problem with diff approach:** CSS rules can interact. Adding a new candidate might not produce a simple append -- it could change ordering or merge with existing rules.

### FINAL Per-Node Strategy: Fresh compiler per convert() call, re-compile is unavoidable

The cleanest, most correct approach:

```typescript
// In rewrite():
for (const entry of entries) {
  // Create a fresh compiler for this node's tokens only
  const nodeCompiler = await compile(cssInput, { loadStylesheet });
  const css = nodeCompiler.build([...entry.classNames]);
  // css contains ONLY rules for this node's classes
}
```

**Mitigation for compile() cost:**
- The `loadStylesheet` callback can cache resolved content (the I/O part)
- CSS parsing is fast (~1-2ms for typical @import "tailwindcss" + theme blocks)
- For a build tool processing files sequentially, this is acceptable
- If profiling shows it is too slow, batch all candidates into one build() call and implement CSS rule splitting (Option C) as an optimization

---

## Component Boundaries After Migration

### Files DELETED (6 files)

| File | Reason |
|------|--------|
| `src/theme/parser.ts` | Tailwind handles @theme natively |
| `src/theme/mapper.ts` | Tailwind handles @theme natively |
| `src/theme/types.ts` | No longer needed |
| `src/variants/parser.ts` | Tailwind handles @custom-variant natively |
| `src/variants/resolver.ts` | Tailwind handles @custom-variant natively |
| `src/variants/types.ts` | No longer needed |

### Files DELETED (tests, 4 files)

| File | Reason |
|------|--------|
| `src/theme/parser.test.ts` | Module deleted |
| `src/theme/mapper.test.ts` | Module deleted |
| `src/variants/parser.test.ts` | Module deleted |
| `src/variants/resolver.test.ts` | Module deleted |

### Files REWRITTEN (1 file)

| File | Lines Before | Lines After (est.) | What Changes |
|------|-------------|-------------------|--------------|
| `src/pipeline/generator.ts` | 180 | 50-60 | UnoCSS createGenerator -> Tailwind compile/build. Cache keyed by CSS input hash instead of variant+theme identity. Layer stripping logic changes (Tailwind output format differs from UnoCSS). |

### Files MODIFIED (4 files)

| File | What Changes |
|------|--------------|
| `src/pipeline/rewriter.ts` | Remove `VariantObject` import. Change `generateCSS()` call signature (no more variants/themeConfig params, pass compiler instead). Selector rewriting logic may simplify since Tailwind output uses standard CSS selectors. |
| `src/index.ts` | Remove theme/variant resolution steps 4-5. Build CSS input string from options. Pass compiler to rewrite(). Remove theme/variant re-exports. |
| `src/types.ts` | Remove `CustomVariantsOption` import. Simplify `ConvertOptions`: replace `customVariants` + `themeCss` with single `css` or keep both but they go into the CSS input string. Remove theme-specific warning types. |
| `src/cli.ts` | Adjust how --theme and --variants flags feed into the CSS input string. |

### Files UNCHANGED (4 files)

| File | Why |
|------|-----|
| `src/pipeline/parser.ts` | AST parsing is engine-independent |
| `src/pipeline/extractor.ts` | Class extraction is engine-independent |
| `src/pipeline/namer.ts` | Naming is engine-independent |
| `src/cli.ts` (mostly) | Flag handling stays similar, just wiring changes |

---

## The loadStylesheet Callback

When vanillify calls `compile('@import "tailwindcss";')`, Tailwind needs to resolve the `@import`. In a Node.js environment without filesystem access to the tailwindcss package's CSS files, we provide a `loadStylesheet` callback.

### Implementation

```typescript
// Bundled CSS content from tailwindcss package
import indexCss from 'tailwindcss/index.css?raw';
import preflightCss from 'tailwindcss/preflight.css?raw';
import themeCss from 'tailwindcss/theme.css?raw';
import utilitiesCss from 'tailwindcss/utilities.css?raw';

const STYLESHEETS: Record<string, string> = {
  'tailwindcss': indexCss,
  'tailwindcss/index.css': indexCss,
  'tailwindcss/preflight.css': preflightCss,
  './preflight.css': preflightCss,
  'tailwindcss/theme.css': themeCss,
  './theme.css': themeCss,
  'tailwindcss/utilities.css': utilitiesCss,
  './utilities.css': utilitiesCss,
};

async function loadStylesheet(
  id: string,
  base: string,
): Promise<{ content: string; base: string }> {
  const content = STYLESHEETS[id];
  if (content !== undefined) {
    return { content, base };
  }
  throw new Error(`vanillify: Cannot resolve stylesheet "${id}" from "${base}"`);
}
```

**Important:** The `?raw` imports require build-tool support (Vite/tsdown). Since vanillify is bundled with tsdown, this works. The raw CSS strings are inlined at build time.

**Alternative for Node.js runtime resolution:** Use `@tailwindcss/node` which provides filesystem-based `loadStylesheet` and `loadModule`. However, this adds a dependency and filesystem coupling. The `?raw` bundling approach is cleaner for a library.

### Theme CSS Input Construction

The CSS input to `compile()` is where theme and variant configuration live:

```typescript
function buildCssInput(options?: ConvertOptions): string {
  let css = '@import "tailwindcss";\n';

  // User's theme CSS (contains @theme blocks)
  if (options?.themeCss) {
    css += options.themeCss + '\n';
  }

  // User's custom variants CSS (contains @custom-variant directives)
  if (options?.customVariants && typeof options.customVariants === 'string') {
    css += options.customVariants + '\n';
  }

  return css;
}
```

This is the key simplification: instead of parsing @theme into UnoCSS config objects and @custom-variant into VariantObjects, we pass the raw CSS directly to Tailwind. Tailwind processes it natively.

---

## Caching Strategy

### What to Cache

| What | Key | Why |
|------|-----|-----|
| Compiled Tailwind instance | Hash of full CSS input string | `compile()` is expensive (~10-50ms). Same CSS input = same design system. |
| Stylesheet content | Import ID | Raw CSS from tailwindcss package is static. |

### What NOT to Cache

| What | Why Not |
|------|---------|
| `build()` results | Tailwind caches internally. build() is fast (~1ms). |
| Per-node compilers | If using fresh-compiler-per-node approach, these are short-lived |

### Cache Invalidation

The cache key is a hash of the CSS input string. Different theme/variant configs produce different CSS inputs, which produce different cache keys. This is simpler than the current approach (variant name sorting + theme object hashing).

```typescript
// Current (UnoCSS): complex multi-part key
const key = `${variantKey}|${themeKey}`;

// New (Tailwind): single hash of CSS input
const key = simpleHash(cssInput);
```

---

## Selector Rewriting Changes

### Current Approach (UnoCSS)

UnoCSS generates CSS with utility class selectors (`.flex`, `.hover\:bg-blue-700:hover`). The rewriter replaces these with `.nodeN` selectors using regex pattern matching against known class names.

This is the most complex part of the codebase (~280 lines in rewriter.ts) because UnoCSS escapes selectors differently than standard CSS.

### New Approach (Tailwind)

Tailwind v4 generates standard CSS output. The selector format is predictable:

```css
/* Tailwind build() output for candidates ['flex', 'hover:bg-blue-700'] */
.flex {
  display: flex;
}
.hover\:bg-blue-700:hover {
  background-color: var(--color-blue-700);
}
```

The rewriting logic stays similar in structure but should be simpler because:

1. Tailwind's output format is more predictable than UnoCSS's layer-based output
2. No `/* layer: default */` / `/* layer: theme */` markers to parse
3. Tailwind uses standard CSS escaping (backslash before special chars)

The `stripLayerWrappers()` and `extractThemeLayer()` functions in the current generator.ts become unnecessary -- Tailwind does not wrap output in `@layer` blocks when using the programmatic API (it outputs flat CSS).

### Key Simplification

The `buildNodeCSS()` function in rewriter.ts can be simplified:

```
Current: extractDefaultLayer() -> build selector patterns -> match against UnoCSS-escaped selectors -> merge plain declarations
New:     parse Tailwind output -> replace .utility selectors with .nodeN -> merge plain declarations
```

The core logic (selector replacement, pseudo-class extraction, @media block handling) remains, but the UnoCSS-specific escaping and layer extraction is removed.

---

## Data Flow Diagram (After Migration)

```
User provides:
  source: "export default () => <div className='flex p-4 hover:bg-blue-700'>..."
  options: {
    themeCss: "@theme { --color-brand: oklch(...); }",
    customVariants: "@custom-variant ui-checked (&[ui-checked]);"
  }

Step 1: Build CSS input
  cssInput = '@import "tailwindcss";\n@theme { --color-brand: oklch(...); }\n@custom-variant ui-checked (&[ui-checked]);'

Step 2: Get compiler (cached by cssInput hash)
  compiler = await compile(cssInput, { loadStylesheet })

Step 3: Parse + Extract + Name (unchanged pipeline)
  nodes = [{ nodeIndex: 0, classNames: ['flex', 'p-4', 'hover:bg-blue-700'], ... }]

Step 4: For each node, generate CSS
  nodeCompiler = await compile(cssInput, { loadStylesheet })  // or reuse if isolation solved
  css = nodeCompiler.build(['flex', 'p-4', 'hover:bg-blue-700'])
  // Returns: .flex { display: flex; } .p-4 { padding: 1rem; } .hover\:bg-blue-700:hover { ... }

Step 5: Rewrite selectors
  .flex { display: flex; }  ->  .node0 { display: flex; padding: 1rem; }
  .p-4 { ... }                 .node0:hover { background-color: ... }
  .hover\:bg-blue-700:hover { ... }

Step 6: Replace className in source
  <div className='flex p-4 hover:bg-blue-700'>  ->  <div className="node0">
```

---

## Public API Changes

### ConvertOptions (Simplified)

```typescript
// Current
interface ConvertOptions {
  customVariants?: string | Record<string, string>;  // Parsed by variants/parser + resolver
  themeCss?: string;                                  // Parsed by theme/parser + mapper
  outputFormat?: OutputFormat;
}

// New (v2.0)
interface ConvertOptions {
  customVariants?: string;    // Raw CSS with @custom-variant directives -- passed to compile() directly
  themeCss?: string;          // Raw CSS with @theme blocks -- passed to compile() directly
  outputFormat?: OutputFormat;
}
```

The `Record<string, string>` form of `customVariants` is dropped. Users provide CSS strings, which Tailwind processes natively. This is a BREAKING CHANGE (hence v2.0).

### ConvertResult (Simplified)

```typescript
// Current
interface ConvertResult {
  component: string;
  css: string;
  themeCss: string;    // :root variable definitions extracted from UnoCSS theme layer
  warnings: Warning[];
  classMap?: Record<string, string>;
}

// New (v2.0)
interface ConvertResult {
  component: string;
  css: string;
  themeCss: string;    // Can be empty string or contain :root vars from Tailwind's theme output
  warnings: Warning[];
  classMap?: Record<string, string>;
}
```

The shape stays the same. The `themeCss` field behavior may change slightly -- Tailwind generates theme variables as part of the main CSS output, not as a separate layer. The adapter needs to extract `:root` variable blocks from the build output if `themeCss` is to remain separate.

### Warning Types (Reduced)

```typescript
// Current
type: "dynamic-class" | "unmatched-class" | "theme-parse-error" | "unknown-theme-namespace" | "unsupported-theme-reset"

// New
type: "dynamic-class" | "unmatched-class"
// Theme warnings are gone -- Tailwind handles theme natively, no translation errors possible
```

---

## Suggested Build Order

Dependencies flow downward:

```
Phase 1: Regression test baseline
    |     (capture current convert() output for fixtures before changing anything)
    |
Phase 2: Add tailwindcss dependency, create adapter module
    |     (new pipeline/generator.ts alongside old one, feature-flagged)
    |
Phase 3: Wire adapter into pipeline
    |     (modify rewriter.ts, index.ts to use new generator)
    |
Phase 4: Delete old code
    |     (remove theme/, variants/, old generator logic)
    |
Phase 5: Simplify rewriter.ts selector logic
    |     (remove UnoCSS-specific layer/escaping handling)
    |
Phase 6: Update types, public API, CLI
          (breaking changes to ConvertOptions, warning types)
```

**Rationale:**
- Phase 1 first because you need a safety net before changing the engine
- Phase 2 creates the new adapter without breaking anything (old code still works)
- Phase 3 is the swap point -- once wired in, run regression tests to verify output parity
- Phase 4 only after regression tests pass -- safe deletion
- Phase 5 is cleanup that reduces complexity but is not functionally necessary
- Phase 6 is the API surface change that makes it a v2.0

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using @tailwindcss/node for loadStylesheet
**What:** Importing `@tailwindcss/node` to get filesystem-based stylesheet loading.
**Why bad:** Adds a heavy dependency with filesystem coupling (`enhanced-resolve`, `fs.readFile`). Vanillify is a library that should work without filesystem access (the `convert()` function is pure async with no I/O).
**Instead:** Bundle tailwindcss CSS files as raw strings via `?raw` imports at build time. Provide a minimal `loadStylesheet` that maps import IDs to bundled content.

### Anti-Pattern 2: Trying to make build() produce per-node CSS via candidate batching
**What:** Calling `compiler.build()` with carefully ordered candidate batches and diffing output to attribute CSS to nodes.
**Why bad:** Tailwind's build() is incremental and may reorder/merge output. Diffing is fragile and breaks on edge cases (shared candidates across nodes, @media grouping).
**Instead:** Accept the cost of compile() per node for isolation. Cache aggressively. Optimize later if profiling shows a bottleneck.

### Anti-Pattern 3: Keeping the variant/theme translation layers "just in case"
**What:** Keeping `src/theme/` and `src/variants/` around for backward compatibility.
**Why bad:** Dead code increases maintenance burden and confuses contributors. The v2.0 milestone explicitly targets deletion.
**Instead:** Delete completely. The v2.0 version number signals a breaking change. Users pass raw CSS to `customVariants` and `themeCss` options -- Tailwind processes it.

### Anti-Pattern 4: Extracting themeCss by parsing Tailwind build output
**What:** Regex-parsing the CSS output from build() to find `:root` variable declarations and split them into a separate `themeCss` field.
**Why bad:** Fragile. Tailwind's output format is not a stable API.
**Instead:** If `themeCss` separation is needed, compile the theme CSS input separately (a second compile() call with just the theme portion) and extract variables from that output. Or simplify the API: return all CSS in the `css` field and deprecate `themeCss` as a separate field in v2.0.

### Anti-Pattern 5: loadModule callback for plugins
**What:** Implementing the `loadModule` callback to support Tailwind JS plugins.
**Why bad:** Vanillify's scope is CSS-to-CSS conversion. Supporting JS plugins opens a large surface area (plugin API, config resolution, module loading).
**Instead:** Only implement `loadStylesheet`. If a user's setup requires JS plugins, that is out of scope for v2.0.

---

## Scalability Considerations

| Concern | Current (UnoCSS) | After Migration (Tailwind) |
|---------|-------------------|---------------------------|
| Compile time per file | ~50ms (createGenerator cached, generate per node) | ~50-100ms (compile per node if not cached) |
| Memory per generator | ~2MB (UnoCSS generator + preset-wind4) | ~3-5MB (Tailwind design system, estimated) |
| Cache efficiency | Good (variant+theme keyed) | Good (CSS input hash keyed) |
| 100-node file | ~100 generate() calls (fast, ~1ms each) | ~100 compile() + build() calls (slower, ~5ms each) |
| Optimization path | N/A (UnoCSS generate is already fast) | Batch all candidates into one build(), implement CSS rule splitting |

**Performance note:** If compile-per-node proves too slow for large files (>50 nodes), the optimization path is clear: compile once, build once with all candidates, then split the CSS output by rule. This is a well-defined future optimization, not a blocker for v2.0.

---

## Sources

- [Tailwind CSS v4 compile() API](https://github.com/tailwindlabs/tailwindcss) -- `compile()` and `build()` signatures from source (packages/tailwindcss/src/index.ts), version 4.2.2. HIGH confidence.
- [Programmatic usage discussion](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- Community examples of compile() + loadStylesheet + build(). HIGH confidence.
- [Runtime compilation discussion](https://github.com/tailwindlabs/tailwindcss/discussions/10752) -- Complete loadStylesheet implementation with bundled CSS. HIGH confidence.
- [@tailwindcss/node compile.ts](https://github.com/tailwindlabs/tailwindcss/tree/main/packages/%40tailwindcss-node/src) -- Filesystem-based loadStylesheet/loadModule reference. MEDIUM confidence (internal package, may change).
- [Tailwind v4 @theme documentation](https://tailwindcss.com/docs/theme) -- CSS-first theme configuration. HIGH confidence.
- [Tailwind v4 @custom-variant](https://tailwindcss.com/docs/adding-custom-styles) -- Custom variant directive syntax. HIGH confidence.

---
*Architecture research for: vanillify v2.0 -- Tailwind compile() migration*
*Researched: 2026-04-05*
