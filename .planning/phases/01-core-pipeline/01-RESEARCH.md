# Phase 1: Core Pipeline - Research

**Researched:** 2026-04-04
**Domain:** JSX/TSX class extraction + UnoCSS CSS generation pipeline
**Confidence:** HIGH

## Summary

Phase 1 builds the foundational `convert()` function -- the entire pipeline from source text input to CSS + transformed component output. The phase covers project scaffolding (package.json, tsconfig, tsdown, vitest), the four-stage pipeline (parse, extract, generate, rewrite), and variant handling for pseudo-classes and responsive breakpoints. Since UnoCSS handles variants natively via preset-wind4, variant support is not a separate concern -- it comes free with a correct generator integration.

The single most critical finding from this research is that UnoCSS's `generate()` method accepts **both** a string (which it runs through its own extractors) **and** a `Set<string>` or `string[]` (which it uses directly as tokens). This means vanillify should extract class tokens with oxc-parser and pass them as a `Set<string>` to `generate()`, completely bypassing UnoCSS's built-in extraction. This eliminates Pitfall 7 from prior research -- the input contract question is resolved.

The secondary critical finding is that oxc-parser's `parseSync` returns an ESTree-compatible AST, and the companion `oxc-walker` package provides `walk(ast, { enter, leave })` for traversal. For JSX class extraction, we walk the AST looking for `JSXAttribute` nodes where the attribute name is `className` or `class`, then extract string literal values from those attributes. Dynamic expressions (ternaries, template literals, function calls) are detected and warned.

**Primary recommendation:** Use oxc-parser + oxc-walker for AST extraction, pass extracted tokens as `Set<string>` to `generator.generate()`, and use span-based rewriting to replace className values in the original source.

## Project Constraints (from CLAUDE.md)

- **Tech stack**: vite+ toolchain (tsdown, vitest, vite-plus), oxc-parser, UnoCSS -- no other parsers or CSS engines
- **Node.js**: Target modern Node.js (v20+)
- **Output format**: Vanilla CSS only (not CSS Modules, not SCSS, not PostCSS)
- **Class naming**: Indexed only (`.node0`, `.node1`) -- no semantic naming in v1
- **Avoid**: tsup (unmaintained), full `unocss` package (oversized), `@unocss/preset-wind` deprecated alias, regex-based class extraction, lookup-table converters
- **Generator pattern**: Singleton `createGenerator`, called once and reused
- **API pattern**: Pure async functions, no side effects, no file I/O in library code
- **Dual entry**: Library exports via `exports` field, CLI via `bin` field; CLI never leaks into library

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | `convert()` accepts JSX/TSX source string, returns CSS + transformed component | Pipeline architecture: parse -> extract -> generate -> rewrite; returns `ConvertResult { css, component }` |
| CORE-02 | oxc-parser extracts class/className attribute values from JSX/TSX AST | `parseSync` + `oxc-walker` walk function; target `JSXAttribute` nodes with name `className` or `class` |
| CORE-03 | UnoCSS `createGenerator` with `preset-wind4` generates CSS | Singleton generator pattern; pass extracted tokens as `Set<string>` to `generate()` |
| CORE-04 | Generated CSS uses indexed class names (`.node0`, `.node1`) per JSX element | Namer module assigns indices in DOM-order extraction sequence; CSS selectors use these names |
| CORE-05 | Output CSS is formatted and readable | UnoCSS generate() returns unminified CSS by default (minify option defaults to false) |
| CORE-06 | Transformed component replaces Tailwind class strings with generated class names | Span-based rewriting: record byte offsets from AST, replace in reverse order |
| CORE-07 | Dynamic class expressions detected and warned, not silently skipped | AST visitor classifies `JSXExpressionContainer` children; ternaries, logical AND, template literals, function calls trigger warnings |
| CORE-08 | Arbitrary Tailwind values produce correct CSS | UnoCSS handles arbitrary values natively via preset-mini inheritance; `text-[#ff0000]`, `w-[calc(100%-1rem)]` pass through |
| VARI-01 | Pseudo-class variants resolve to CSS pseudo-selectors | UnoCSS preset-wind4 handles `hover:`, `focus:`, `active:`, `disabled:` natively -- no custom code needed |
| VARI-02 | Responsive breakpoint variants resolve to @media rules | UnoCSS preset-wind4 generates `@media (width >= Npx)` for `sm:`, `md:`, `lg:`, `xl:`, `2xl:` |
| VARI-03 | Stacked/compound variants resolve correctly | UnoCSS handles variant stacking natively; `dark:hover:text-white` produces nested conditions |
</phase_requirements>

## Standard Stack

### Core (Phase 1 Runtime)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@unocss/core` | 66.6.7 | CSS generation engine | Only programmatic API for generating Tailwind-compatible CSS; `createGenerator` + `generate()` [VERIFIED: npm registry] |
| `@unocss/preset-wind4` | 66.6.7 | Tailwind v4 utility rules | Official UnoCSS preset for Tailwind v4 semantics; handles utilities, variants, responsive, arbitrary values [VERIFIED: npm registry] |
| `oxc-parser` | 0.123.0 | JSX/TSX AST parsing | Fastest JS/TS parser; ESTree-compatible AST via `parseSync`; JSX/TSX natively supported [VERIFIED: npm registry] |
| `oxc-walker` | latest | AST traversal | Strongly-typed ESTree walker built on oxc-parser; provides `walk(ast, { enter, leave })` [VERIFIED: github.com/oxc-project/oxc-walker] |

### Development (Phase 1 Setup)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `tsdown` | 0.21.7 | Library bundler | Dual ESM+CJS output, `dts: true` for declarations [VERIFIED: npm registry] |
| `vitest` | 4.1.2 | Unit + integration testing | `environment: 'node'`, snapshot-based fixture testing [VERIFIED: npm registry] |
| `typescript` | 6.0.2 | Type checking | 5.5+ required for isolatedDeclarations [VERIFIED: npm registry] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `oxc-walker` | oxc-parser `Visitor` class | Visitor is built-in but oxc-walker provides `enter`/`leave` callbacks plus `this.skip()` control. Walker is more ergonomic for complex traversal. Either works. |
| `Set<string>` input to `generate()` | Pass full source string to `generate()` | String input runs UnoCSS's own extractors which may find tokens in comments/strings. Set input gives us exact control over which tokens generate CSS. Use Set. |

**Installation:**
```bash
# Core runtime
npm install @unocss/core @unocss/preset-wind4 oxc-parser oxc-walker

# Dev dependencies
npm install -D tsdown vitest typescript
```

**Version verification:** All versions confirmed against npm registry on 2026-04-04. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
```
src/
  index.ts              # Public API: export convert(), types
  pipeline/
    parser.ts           # oxc-parser wrapper: source -> AST + spans
    extractor.ts        # AST -> NodeEntry[] with class tokens + spans
    generator.ts        # UnoCSS createGenerator singleton + generate()
    namer.ts            # Indexed class name assignment (.node0, .node1)
    rewriter.ts         # Span-based source rewrite + CSS assembly
  types.ts              # ConvertOptions, ConvertResult, NodeEntry

test/
  fixtures/             # .tsx input files for snapshot testing
    basic.tsx
    variants.tsx
    dynamic-classes.tsx
    arbitrary-values.tsx
  pipeline/             # Unit tests per pipeline stage
  integration/          # End-to-end convert() tests
```

### Pattern 1: Pass Extracted Tokens as Set to generate()

**What:** Extract class tokens from JSX with oxc-parser, collect into a Set, pass directly to `generator.generate(tokenSet)`. This bypasses UnoCSS's built-in source extractors entirely.

**When to use:** Always. This is the correct integration pattern for vanillify.

**Why:** UnoCSS's `generate()` accepts `string | Set<string> | string[]`. When given a string, it runs its own extractors which may find false-positive tokens in comments, variable names, or string literals. When given a Set, it uses those tokens directly -- giving vanillify full control over what generates CSS. [VERIFIED: unocss/unocss source code, generator.ts]

**Example:**
```typescript
// Source: UnoCSS core generator.ts (verified from GitHub source)
// When input is a string: runs through applyExtractors() to find tokens
// When input is a Set<string> or string[]: uses tokens directly

import { createGenerator } from '@unocss/core'
import presetWind4 from '@unocss/preset-wind4'

const generator = await createGenerator({ presets: [presetWind4()] })

// CORRECT: pass extracted tokens as Set
const tokens = new Set(['flex', 'bg-red-500', 'hover:text-white', 'md:p-4'])
const { css, matched } = await generator.generate(tokens)
// css contains the generated CSS rules
// matched contains the Set of tokens that actually produced CSS
```

### Pattern 2: Span-Based Rewriting

**What:** Record byte-offset spans from the AST for each className attribute value. After CSS generation, replace those spans in the original source in reverse order (last first) to avoid offset drift.

**When to use:** Always for source transformation -- preserves formatting, comments, whitespace.

**Example:**
```typescript
// Replacements must be applied in reverse source order
const sorted = replacements.sort((a, b) => b.span.start - a.span.start)
let result = source
for (const { span, newValue } of sorted) {
  result = result.slice(0, span.start) + newValue + result.slice(span.end)
}
```

### Pattern 3: Singleton Generator with Lazy Init

**What:** `createGenerator` is async and expensive. Create once, reuse for all files in a batch.

**Example:**
```typescript
let _generator: Awaited<ReturnType<typeof createGenerator>> | null = null

export async function getGenerator() {
  if (!_generator) {
    _generator = await createGenerator({
      presets: [presetWind4()],
    })
  }
  return _generator
}
```

### Pattern 4: AST Extraction with oxc-walker

**What:** Use `oxc-walker`'s `walk()` function to traverse the AST and find `JSXAttribute` nodes with `className` or `class` names.

**Example:**
```typescript
// Source: oxc-walker README (verified from GitHub)
import { parseSync } from 'oxc-parser'
import { walk } from 'oxc-walker'

const { program } = parseSync('component.tsx', source)

interface NodeEntry {
  nodeIndex: number
  classNames: string[]
  span: { start: number; end: number }
  isDynamic: boolean
}

const entries: NodeEntry[] = []
let nodeIndex = 0

walk(program, {
  enter(node, parent) {
    if (node.type === 'JSXAttribute' &&
        node.name.type === 'JSXIdentifier' &&
        (node.name.name === 'className' || node.name.name === 'class')) {

      if (node.value?.type === 'StringLiteral') {
        // Static class string: className="flex bg-red-500"
        const classes = node.value.value.split(/\s+/).filter(Boolean)
        entries.push({
          nodeIndex: nodeIndex++,
          classNames: classes,
          span: { start: node.value.start, end: node.value.end },
          isDynamic: false,
        })
      } else if (node.value?.type === 'JSXExpressionContainer') {
        // Dynamic expression: className={condition ? 'a' : 'b'}
        // Mark as dynamic, attempt partial extraction
        entries.push({
          nodeIndex: nodeIndex++,
          classNames: extractStaticFragments(node.value.expression),
          span: { start: node.value.start, end: node.value.end },
          isDynamic: true,
        })
      }
    }
  }
})
```

### Anti-Patterns to Avoid

- **Regex-based class extraction:** Fails on JSX expressions, template literals, multi-line attributes. Use oxc-parser AST traversal. [CITED: CLAUDE.md]
- **AST reprinting for source transformation:** Destroys formatting and comments. Use span-based patching. [CITED: ARCHITECTURE.md]
- **Creating a new generator per file:** `createGenerator` is expensive. Use singleton pattern. [CITED: ARCHITECTURE.md]
- **Passing full source string to generate():** UnoCSS extractors may find false-positive tokens in non-className contexts. Pass extracted tokens as `Set<string>`. [VERIFIED: unocss/unocss source code]
- **Mixing CLI I/O into pipeline modules:** `convert()` must be a pure function returning data. No console.log, process.exit, or fs operations in library code. [CITED: CLAUDE.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS generation from Tailwind classes | Lookup table or regex-to-CSS mapper | `@unocss/core` + `preset-wind4` `generate()` | Tailwind has 1000+ utilities with variants, arbitrary values, responsive -- no lookup table stays accurate |
| JSX/TSX parsing | Regex pattern matching for className | `oxc-parser` `parseSync` + `oxc-walker` | JSX expressions, template literals, conditional classNames all break regex |
| CSS escaping for selectors | Manual character escaping function | UnoCSS handles selector escaping internally | Special characters in arbitrary values (`#`, `(`, `)`, `/`) require CSS-spec-compliant escaping |
| Variant-to-CSS mapping | `hover:` -> `:hover` string replacement | UnoCSS resolves all standard variants natively | Stacked variants, responsive, dark mode, pseudo-elements all have nuanced CSS output |
| AST traversal | Manual recursive walker | `oxc-walker` `walk()` function | Handles all node types, provides enter/leave, skip/replace control |

**Key insight:** The entire CSS generation layer -- including variant resolution, arbitrary value handling, selector escaping, and media query generation -- is handled by UnoCSS. Vanillify's job is to extract the right tokens and wire them correctly. Do not replicate any CSS generation logic.

## Common Pitfalls

### Pitfall 1: generate() Input Contract -- RESOLVED

**What goes wrong:** Prior research flagged uncertainty about whether `generate()` accepts class lists or source code.

**Resolution:** `generate()` accepts both. When given a `string`, it runs UnoCSS extractors. When given a `Set<string>` or `string[]`, it uses tokens directly. Vanillify MUST use `Set<string>` input to maintain control over extraction. [VERIFIED: unocss/unocss generator.ts source code]

**How to avoid:** Always pass `new Set(extractedClassNames)` to `generate()`, never the raw source string.

### Pitfall 2: Dynamic Class Expressions Must Warn, Not Silently Skip

**What goes wrong:** JSX like `className={isActive ? 'bg-blue-500' : 'bg-gray-500'}` contains class names that cannot be statically determined at build time. Silent omission produces incomplete CSS.

**Why it happens:** Ternaries, `clsx()`, `cn()`, template literals with variables are structurally unresolvable statically.

**How to avoid:** The extractor MUST classify each className as `static` or `dynamic`. For dynamic expressions: (1) extract statically-determinable string literal fragments where possible (both ternary branches if they're string literals), (2) emit a warning listing the dynamic expression and its location, (3) include extracted fragments in the token set for CSS generation.

**Warning signs:** Tests pass for simple static classNames but no test covers `className={x ? 'a' : 'b'}`.

### Pitfall 3: UnoCSS preset-wind4 Gaps for Tailwind v4

**What goes wrong:** preset-wind4 covers most utilities but is acknowledged as "not fully ready" by maintainers. Missing: `(--custom-property)` shorthand, some newer utilities.

**How to avoid:** Use the `matched` field from `generate()` return value to detect unmatched tokens. Any token passed to `generate()` that does not appear in `matched` produced no CSS -- this is a coverage gap. Emit a warning for unmatched tokens.

**Warning signs:** `generate()` returns `css` that is missing expected rules. Check `matched.size < tokens.size`.

### Pitfall 4: Node Index Assignment Must Be Deterministic

**What goes wrong:** If node indices are assigned non-deterministically (e.g., by async processing order), the same input produces different output on different runs.

**How to avoid:** Assign node indices in DOM order (top-to-bottom, left-to-right AST traversal order). The `walk()` function visits nodes in source order by default. Use a simple counter incremented in the `enter` callback.

### Pitfall 5: Span Offsets Must Account for Quotes

**What goes wrong:** `className="flex bg-red-500"` -- the AST span for the `StringLiteral` value may or may not include the surrounding quotes depending on the parser. If it includes quotes, the replacement must also include quotes. If it excludes quotes, replacement must not.

**How to avoid:** Test with oxc-parser to determine exact span boundaries for string literal values in JSX attributes. Write a unit test that verifies `source.slice(span.start, span.end)` matches the expected raw text.

### Pitfall 6: CSS Output May Include @layer Wrappers

**What goes wrong:** UnoCSS wraps generated CSS in `@layer` blocks by default. Vanilla CSS output should not include UnoCSS-specific layer wrappers.

**How to avoid:** Use `getLayer('default')` from the `GenerateResult` to extract CSS for the default layer without the `@layer` wrapper, or post-process to strip layer wrappers. [VERIFIED: unocss/unocss types.ts -- GenerateResult has `getLayer(name)` method]

## Code Examples

### Complete convert() Pipeline

```typescript
// src/index.ts
import { parse } from './pipeline/parser'
import { extract } from './pipeline/extractor'
import { getGenerator } from './pipeline/generator'
import { assignNames } from './pipeline/namer'
import { rewrite } from './pipeline/rewriter'
import type { ConvertOptions, ConvertResult } from './types'

export async function convert(
  source: string,
  filename: string,
  options?: ConvertOptions
): Promise<ConvertResult> {
  // 1. Parse source to AST
  const ast = parse(filename, source)

  // 2. Extract class entries from AST
  const entries = extract(ast, source)

  // 3. Assign indexed class names
  const nameMap = assignNames(entries)

  // 4. Collect all static tokens for CSS generation
  const allTokens = new Set<string>()
  for (const entry of entries) {
    if (!entry.isDynamic) {
      for (const cls of entry.classNames) {
        allTokens.add(cls)
      }
    }
  }

  // 5. Generate CSS from tokens
  const generator = await getGenerator()
  const result = await generator.generate(allTokens)

  // 6. Build per-node CSS blocks with indexed selectors
  // 7. Rewrite source, replacing className values
  return rewrite(source, entries, nameMap, result)
}

export type { ConvertOptions, ConvertResult } from './types'
```

### Key Type Definitions

```typescript
// src/types.ts
export interface ConvertOptions {
  // Phase 2 will add customVariants here
}

export interface ConvertResult {
  /** Transformed component source with indexed class names */
  component: string
  /** Generated vanilla CSS */
  css: string
  /** Warnings for dynamic/unmatched classes */
  warnings: Warning[]
}

export interface Warning {
  type: 'dynamic-class' | 'unmatched-class'
  message: string
  location: { line: number; column: number }
}

export interface NodeEntry {
  /** 0-based index in DOM extraction order */
  nodeIndex: number
  /** Extracted Tailwind class tokens */
  classNames: string[]
  /** Byte offset span in original source */
  span: { start: number; end: number }
  /** Whether this className is a dynamic expression */
  isDynamic: boolean
}
```

### GenerateResult Usage

```typescript
// Source: UnoCSS types.ts (verified from GitHub)
// GenerateResult fields:
// - css: string          (full CSS with @layer wrappers)
// - matched: Set<string> (tokens that produced CSS)
// - getLayer(name?: string): string | undefined  (CSS for specific layer)
// - layers: string[]     (available layer names)

const result = await generator.generate(tokens)

// Check for unmatched tokens (coverage gaps)
const unmatched = [...tokens].filter(t => !result.matched.has(t))
if (unmatched.length > 0) {
  warnings.push({
    type: 'unmatched-class',
    message: `Unmatched Tailwind classes: ${unmatched.join(', ')}`,
    location: { line: 0, column: 0 }
  })
}

// Get CSS without @layer wrapper
const css = result.getLayer('default') ?? result.css
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `createGenerator` was sync | `createGenerator` is async (returns Promise) | UnoCSS v0.65.0 (2025) | Must `await` generator creation |
| `@unocss/preset-wind` | `@unocss/preset-wind3` (explicit) or `preset-wind4` (v4) | UnoCSS 66.x | Old name soft-deprecated with warnings |
| `tsup` for library bundling | `tsdown` (Rolldown-based) | 2025 | tsup unmaintained; tsdown is successor |
| oxc-parser only (no walker) | oxc-parser + oxc-walker | 2025 | Walker provides ergonomic enter/leave traversal |
| Vitest 3 | Vitest 4 | Oct 2025 | Current major; no breaking changes for library testing |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | oxc-walker walk() visits JSXAttribute nodes and exposes `.name`, `.value` properties in ESTree format | Architecture Patterns - Pattern 4 | If JSX node shape differs, extractor code pattern needs adjustment -- LOW risk since oxc-parser is ESTree-compatible |
| A2 | `GenerateResult.getLayer('default')` returns CSS without `@layer` wrapper | Pitfall 6 | If it still includes wrapper, need regex strip -- LOW risk, easy fallback |
| A3 | `StringLiteral` span from oxc-parser excludes surrounding quotes in JSX attribute values | Pitfall 5 | If spans include quotes, replacement logic needs quote handling -- LOW risk, unit test catches this immediately |
| A4 | oxc-walker is the right companion for oxc-parser (vs. using Visitor directly) | Standard Stack | Both work; if oxc-walker has issues, fall back to built-in Visitor class -- ZERO risk |

**If this table is empty:** N/A -- 4 assumptions listed above.

## Open Questions

1. **Per-node CSS assembly strategy**
   - What we know: UnoCSS generates CSS for a flat set of tokens. It does not know about per-element grouping.
   - What's unclear: How to map generated CSS rules back to specific node entries to build per-node CSS blocks with `.nodeN` selectors.
   - Recommendation: Generate CSS for each node's token set individually (`generate(nodeTokens)`) rather than once for all tokens. This produces per-node CSS blocks naturally. Performance cost is acceptable for Phase 1; optimize later if needed.

2. **CSS property merging within a node**
   - What we know: A single JSX element like `<div className="flex items-center p-4 hover:bg-blue-500">` has multiple utilities that should all live under `.nodeN`.
   - What's unclear: Whether to generate one CSS rule block per utility or merge them into a single `.nodeN { ... }` block.
   - Recommendation: Generate per-token CSS, then post-process to merge properties under a single `.nodeN` selector. Variant/responsive rules get their own blocks with `.nodeN` inside the appropriate wrapper.

3. **`oxc-walker` npm package version stability**
   - What we know: The package exists on npm and is from the oxc-project org.
   - What's unclear: Whether it tracks oxc-parser versions or has its own versioning.
   - Recommendation: Pin the version after install; verify compatibility with oxc-parser 0.123.0 in initial setup.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Yes | v24.14.1 | -- |
| npm | Package management | Yes | 11.11.0 | -- |
| TypeScript | Type checking | Yes (global) | 6.0.2 | Install as devDep |

**Missing dependencies with no fallback:** None -- this is a greenfield Node.js project with no external service dependencies.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A -- build-time library, no users |
| V3 Session Management | No | N/A |
| V4 Access Control | No | N/A |
| V5 Input Validation | Yes | Validate source string is parseable; handle oxc-parser errors gracefully without exposing internals |
| V6 Cryptography | No | N/A |

### Known Threat Patterns for Build-Time Library

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious source input causing parser crash | Denial of Service | Wrap `parseSync` in try/catch; return structured error |
| Path traversal via filename parameter | Information Disclosure | filename is used only for parser language detection, not file I/O; library does no file operations |

## Sources

### Primary (HIGH confidence)
- [UnoCSS Core API -- unocss.dev/tools/core](https://unocss.dev/tools/core) -- createGenerator, generate() API
- [UnoCSS generator.ts source](https://github.com/unocss/unocss/blob/main/packages-engine/core/src/generator.ts) -- generate() accepts string | Set<string> | string[] -- CRITICAL finding
- [UnoCSS types.ts source](https://github.com/unocss/unocss/blob/main/packages-engine/core/src/types.ts) -- GenerateResult, GenerateOptions types
- [oxc-parser Mintlify docs](https://www.mintlify.com/oxc-project/oxc/api/parser) -- parseSync signature, Visitor class, ParserOptions
- [oxc-walker GitHub](https://github.com/oxc-project/oxc-walker) -- walk() API, enter/leave callbacks, parseAndWalk shorthand
- [npm registry](https://npmjs.com) -- @unocss/core@66.6.7, @unocss/preset-wind4@66.6.7, oxc-parser@0.123.0, tsdown@0.21.7, vitest@4.1.2, typescript@6.0.2 -- all versions verified

### Secondary (MEDIUM confidence)
- [UnoCSS preset-wind4 docs](https://unocss.dev/presets/wind4) -- Tailwind v4 coverage, known gaps
- [UnoCSS Tailwind v4 Support Issue #4411](https://github.com/unocss/unocss/issues/4411) -- "not fully ready" maintainer quote
- [UnoCSS DeepWiki](https://deepwiki.com/unocss/unocss) -- generator internals, pipeline architecture

### Tertiary (LOW confidence)
- [Reference implementation: tailwind-v4-to-css-converter](https://github.com/olusegun-kunai/tailwind-v4-to-css-converter) -- proved UnoCSS approach; regex extraction limitation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry; APIs confirmed from source code
- Architecture: HIGH -- pipeline pattern well-established; generate() input contract verified from source
- Pitfalls: HIGH -- critical pitfall (generate input contract) resolved; remaining pitfalls are known patterns with clear mitigations

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable -- UnoCSS 66.x is current major; oxc-parser 0.123.x is stable)
