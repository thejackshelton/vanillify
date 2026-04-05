---
phase: 01-core-pipeline
verified: 2026-04-05T04:15:00Z
status: gaps_found
score: 5/5 must-haves verified
gaps:
  - truth: "TypeScript compilation succeeds with strict mode"
    status: partial
    reason: "tsc --noEmit fails with isolatedDeclarations enabled -- getGenerator() in generator.ts lacks explicit return type annotation"
    artifacts:
      - path: "src/pipeline/generator.ts"
        issue: "Line 11: getGenerator() missing explicit return type annotation required by isolatedDeclarations (TS9007)"
    missing:
      - "Add explicit return type to getGenerator() function"
  - truth: "Code quality: matchesAnyPattern defaults to true"
    status: partial
    reason: "matchesAnyPattern() in rewriter.ts returns true as fallback (line 222), meaning all CSS rules pass through even if pattern matching fails. Works in practice due to per-node CSS isolation but is a correctness risk."
    artifacts:
      - path: "src/pipeline/rewriter.ts"
        issue: "Line 222: return true as default makes the function always match, defeating its purpose"
    missing:
      - "Change default return to false so only genuinely matched CSS rules are included"
human_verification:
  - test: "Run convert() on a complex real-world component and visually inspect the generated CSS is correct and complete"
    expected: "All Tailwind utilities produce the correct CSS properties; no duplicates; .nodeN selectors are assigned consistently"
    why_human: "Programmatic checks verify structure but not semantic correctness of CSS output"
  - test: "Verify that stacked variant CSS (dark:hover:text-white) produces correct nested conditions in the output"
    expected: "CSS should have both dark mode and :hover conditions applied to .nodeN"
    why_human: "The integration test asserts the token matched but does not verify the actual CSS structure of stacked variants"
---

# Phase 1: Core Pipeline Verification Report

**Phase Goal:** Users can call `convert(source)` and get accurate CSS + transformed JSX for any real-world Tailwind component
**Verified:** 2026-04-05T04:15:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `convert(source)` returns CSS string and transformed component for standard Tailwind utilities | VERIFIED | `src/index.ts` exports async `convert()` function; 8 integration tests in `test/integration/convert.test.ts` all pass (43/43 total tests) |
| 2 | Generated CSS uses `.node0`, `.node1` selectors matching transformed component class names | VERIFIED | Integration tests assert `.node0`, `.node1`, `.node2` in both CSS and component output; namer assigns `node{index}` deterministically |
| 3 | Pseudo-class variants produce CSS pseudo-selectors; responsive variants produce @media; stacked variants resolve | VERIFIED | Generator tests assert `:hover`, `:focus`, `:active`, `:disabled`, `@media`, `dark:hover:text-white` matched; integration tests assert `:hover`, `:focus`, `@media` in convert output |
| 4 | Dynamic class expressions detected and emit warning, never silently skipped | VERIFIED | Extractor marks `JSXExpressionContainer` as `isDynamic: true` with `dynamic-class` warning; integration test asserts warning count >= 1 for ternary expression |
| 5 | Arbitrary Tailwind values produce correct CSS output | VERIFIED | Generator test for `text-[#ff0000]`, `w-[calc(100%-1rem)]`; integration test for `text-[#ff0000]`, `w-[200px]`, `p-[1.5rem]` asserting `color` and `width` in CSS |

**Score:** 5/5 roadmap success criteria verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` | Project manifest with runtime/dev deps | VERIFIED | Contains @unocss/core, @unocss/preset-wind4, oxc-parser, oxc-walker, tsdown, vitest |
| `tsconfig.json` | Strict TypeScript with isolatedDeclarations | VERIFIED | strict: true, isolatedDeclarations: true, bundler moduleResolution |
| `tsdown.config.ts` | Build configuration | VERIFIED | Dual ESM+CJS, dts: true |
| `vitest.config.ts` | Test runner configuration | VERIFIED | environment: node |
| `src/types.ts` | Shared type definitions | VERIFIED | Exports ConvertOptions, ConvertResult, Warning, NodeEntry (30 lines) |
| `src/pipeline/parser.ts` | oxc-parser wrapper | VERIFIED | Imports parseSync from oxc-parser, structured error handling (46 lines) |
| `src/pipeline/extractor.ts` | AST class extraction | VERIFIED | Uses oxc-walker walk(), handles static/dynamic, extractStaticFragments (123 lines) |
| `src/pipeline/generator.ts` | UnoCSS CSS generation | VERIFIED | createGenerator singleton with preset-wind4, @layer stripping, unmatched detection (82 lines) |
| `src/pipeline/namer.ts` | Indexed naming | VERIFIED | assignNames + selectorFor, skips dynamic entries (39 lines) |
| `src/pipeline/rewriter.ts` | Span-based rewriting + CSS assembly | VERIFIED | Per-node CSS generation, reverse span replacement, pseudo/media handling (375 lines) |
| `src/index.ts` | Public convert() API | VERIFIED | Wires parse -> extract -> assignNames -> rewrite pipeline (43 lines) |
| `test/integration/convert.test.ts` | End-to-end integration tests | VERIFIED | 8 test cases covering basic, variants, arbitrary, dynamic, class attr, fixture, empty |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/index.ts` | `src/pipeline/parser.ts` | `import { parse }` | WIRED | Line 1 |
| `src/index.ts` | `src/pipeline/extractor.ts` | `import { extract }` | WIRED | Line 2 |
| `src/index.ts` | `src/pipeline/namer.ts` | `import { assignNames }` | WIRED | Line 3 |
| `src/index.ts` | `src/pipeline/rewriter.ts` | `import { rewrite }` | WIRED | Line 4 |
| `src/pipeline/parser.ts` | `oxc-parser` | `import { parseSync }` | WIRED | Line 1 |
| `src/pipeline/extractor.ts` | `oxc-walker` | `import { walk }` | WIRED | Line 1 |
| `src/pipeline/extractor.ts` | `src/types.ts` | `import type { NodeEntry, Warning }` | WIRED | Line 2 |
| `src/pipeline/generator.ts` | `@unocss/core` | `import { createGenerator }` | WIRED | Line 1 |
| `src/pipeline/generator.ts` | `@unocss/preset-wind4` | `import presetWind4` | WIRED | Line 2 |
| `src/pipeline/rewriter.ts` | `src/pipeline/generator.ts` | `import { generateCSS }` | WIRED | Line 3 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/index.ts` (convert) | `result` from `rewrite()` | Pipeline: parse -> extract -> assignNames -> rewrite -> generateCSS | Yes -- UnoCSS generator.generate() produces actual CSS | FLOWING |
| `src/pipeline/generator.ts` | `result.css` | UnoCSS createGenerator().generate(tokens) | Yes -- real CSS from UnoCSS engine | FLOWING |
| `src/pipeline/extractor.ts` | `entries` | AST walk of oxc-parser output | Yes -- real AST traversal | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite passes | `npx vitest run` | 43/43 tests pass across 6 files (192ms) | PASS |
| TypeScript type check | `npx tsc --noEmit` | TS9007 error on generator.ts:11 (missing return type for isolatedDeclarations) | FAIL |
| convert() module exports expected function | Verified via import in integration tests | Tests import and call `convert()` successfully | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CORE-01 | 01-01, 01-04 | Library exposes convert() accepting JSX/TSX source | SATISFIED | src/index.ts exports `convert(source, filename)` returning `{ component, css, warnings }` |
| CORE-02 | 01-01, 01-02 | oxc-parser extracts class/className from AST | SATISFIED | extractor.ts uses oxc-walker to visit JSXAttribute nodes |
| CORE-03 | 01-03 | UnoCSS createGenerator with preset-wind4 generates CSS | SATISFIED | generator.ts creates singleton generator with preset-wind4 |
| CORE-04 | 01-03 | Indexed class names (.node0, .node1) per element | SATISFIED | namer.ts assigns `node{index}`, rewriter uses in CSS selectors |
| CORE-05 | 01-03 | Output CSS is readable (not minified) | SATISFIED | Generator test asserts CSS contains newlines |
| CORE-06 | 01-04 | Transformed component replaces Tailwind classes with generated names | SATISFIED | Rewriter replaces spans with "nodeN" strings; integration tests verify |
| CORE-07 | 01-02 | Dynamic expressions detected and warned | SATISFIED | Extractor sets isDynamic=true, emits dynamic-class warning |
| CORE-08 | 01-03 | Arbitrary values handled (text-[#ff0000], w-[calc(...)]) | SATISFIED | Generator test and integration test verify arbitrary values produce CSS |
| VARI-01 | 01-03 | Pseudo-class variants resolve to CSS pseudo-selectors | SATISFIED | Generator test: :hover, :focus, :active, :disabled in CSS output |
| VARI-02 | 01-03 | Responsive variants resolve to @media rules | SATISFIED | Generator test: @media rules for sm:, md:, lg:, xl:, 2xl: |
| VARI-03 | 01-03 | Stacked variants resolve correctly | SATISFIED | Generator test: dark:hover:text-white matched by UnoCSS |

**Orphaned requirements:** None. All 11 requirement IDs from REQUIREMENTS.md mapped to Phase 1 are covered by plan frontmatters.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/pipeline/generator.ts` | 11 | Missing explicit return type on `getGenerator()` -- breaks `tsc --noEmit` with `isolatedDeclarations` | Warning | Build/type-checking broken; runtime unaffected |
| `src/pipeline/rewriter.ts` | 222 | `matchesAnyPattern()` returns `true` as default fallback | Warning | All CSS rules pass through regardless of pattern match; works due to per-node isolation but defeats purpose of the function |
| `src/types.ts` | 1 | `ConvertOptions` is empty interface with comment "Phase 2 will add customVariants" | Info | Expected -- Phase 2 placeholder |

### Human Verification Required

### 1. Complex Component CSS Correctness

**Test:** Run `convert()` on a real-world component with mixed utilities (flex, spacing, colors, typography, hover states) and inspect the generated CSS for semantic correctness.
**Expected:** Each `.nodeN` selector contains exactly the CSS properties implied by its original Tailwind classes. No missing properties, no duplicated properties, no cross-contamination between nodes.
**Why human:** Tests verify structural properties (contains "display", contains ".node0") but not that the complete CSS semantics are correct.

### 2. Stacked Variant CSS Structure

**Test:** Run `convert()` on a component with `dark:hover:text-white` and inspect the CSS output structure.
**Expected:** The CSS should produce a nested condition combining dark mode (either `.dark` parent or `prefers-color-scheme`) with `:hover` pseudo-class targeting `.nodeN`.
**Why human:** The generator test only asserts the token was matched and `:hover` is present, not the complete CSS nesting structure.

### Gaps Summary

Two minor gaps were identified, neither of which blocks the core pipeline goal:

1. **TypeScript type-check failure:** `tsc --noEmit` fails because `getGenerator()` in `src/pipeline/generator.ts` lacks an explicit return type annotation, which is required by the `isolatedDeclarations` setting in tsconfig.json. This is a one-line fix (add the return type) but is technically a deviation from the plan's verification criteria which states "tsc --noEmit exits 0."

2. **matchesAnyPattern default return true:** The `matchesAnyPattern()` function in `src/pipeline/rewriter.ts` always returns `true` as a fallback (line 222), making the pattern matching effectively a no-op. Since CSS is generated per-node in isolation, this doesn't cause incorrect output in the current architecture, but it's a latent correctness bug that could surface if the architecture changes.

Both gaps are minor and do not prevent the phase goal from being achieved. The core pipeline functions correctly: `convert()` accepts JSX/TSX source and returns accurate CSS with transformed components. All 43 tests pass.

---

_Verified: 2026-04-05T04:15:00Z_
_Verifier: Claude (gsd-verifier)_
