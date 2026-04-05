# Project Research Summary

**Project:** Vanillify v2.0 -- Tailwind compile() Engine Swap
**Domain:** CSS generation engine migration (UnoCSS to native Tailwind v4)
**Researched:** 2026-04-05
**Confidence:** MEDIUM-HIGH

## Executive Summary

Vanillify v2.0 replaces UnoCSS (`@unocss/core` + `preset-wind4`) with Tailwind CSS v4's native `compile().build()` API as the CSS generation engine. This is a high-confidence migration: the bare `tailwindcss@4.2.2` package exports a `compile()` function that accepts a CSS string and returns a compiler with a `build(candidates: string[])` method, producing exact Tailwind CSS output. The key architectural simplification is that `@theme` and `@custom-variant` are processed natively by Tailwind -- vanillify's entire `src/theme/` and `src/variants/` directories (6 source files, 4 test files) can be deleted outright. The generator module rewrites from ~180 lines to ~50-60 lines. The parser, extractor, and namer are completely unchanged.

The recommended approach is to use the bare `tailwindcss` package (not `@tailwindcss/node`) with a custom `loadStylesheet` callback that resolves Tailwind's internal CSS files. The `source(none)` directive disables filesystem scanning, making the API pure-functional for vanillify's use case. Selective imports (`tailwindcss/theme.css` + `tailwindcss/utilities.css`) exclude preflight/reset styles from output. The migration preserves the existing `ConvertOptions`/`ConvertResult` public API shape with one breaking change: the `Record<string, string>` form of `customVariants` is dropped (CSS string only).

The primary risk is Tailwind's `build()` additive/stateful behavior -- it accumulates candidates across calls and cannot produce isolated per-node CSS from a single compiler instance. The recommended mitigation is a fresh `compile()` call per node with cached stylesheet resolution (acceptable for a build-time tool), with a clear optimization path to single-pass generation with post-hoc CSS splitting if performance becomes an issue. A secondary risk is that `compile()` is not officially a public API -- Tailwind maintainers have called it "internal/undocumented" -- so vanillify must pin the version tightly (~4.2.2) and isolate all Tailwind imports to a single adapter file.

## Key Findings

### Recommended Stack

The engine swap is surgical: add `tailwindcss@~4.2.2`, remove `@unocss/core` and `@unocss/preset-wind4`. Everything else (oxc-parser, oxc-walker, citty, consola, tsdown, vitest, pathe, tinyglobby) stays unchanged. Evaluate removing `magic-regexp` after migration if no remaining uses exist outside deleted theme/variant code.

**Core change:**
- `tailwindcss@~4.2.2`: CSS generation via `compile().build()` -- zero dependencies, self-contained with Lightning CSS bundled, replaces both `@unocss/core` and `@unocss/preset-wind4`

**Critical version note:** Pin to `~4.2.2` (patch range), not `^4.x`. The `compile()` API lacks stability guarantees and could change in minor versions.

### Expected Features

**Must have (table stakes for engine swap):**
- `compile().build()` integration replacing UnoCSS `createGenerator().generate()`
- `loadStylesheet` callback for `@import "tailwindcss"` resolution
- CSS layer separation (extract utility + theme layers, discard base/preflight)
- Compiler instance caching (keyed by CSS input string hash)
- Unmatched class detection via CSS output inspection (replaces UnoCSS's `matched` Set)
- Selector rewriting compatibility with Tailwind's output format

**Should have (competitive advantages, many are free):**
- 100% Tailwind CSS fidelity (the primary motivation -- UnoCSS preset-wind4 was "not fully ready")
- Native `@theme` support including `@theme inline` and `@theme static` modifiers
- Native `@custom-variant` support including block syntax with `@slot`
- Future Tailwind features for free (just bump the dependency)

**Defer:**
- Source map support via `buildSourceMap()`
- JS plugin support via `loadModule` callback
- Preflight inclusion option

### Architecture Approach

The pipeline stays structurally identical: parse -> extract -> name -> rewrite (with CSS generation inside rewrite). The generator module is the only file rewritten. Theme/variant translation layers are deleted entirely since Tailwind processes `@theme` and `@custom-variant` CSS directives natively. The CSS input string to `compile()` becomes the single configuration surface -- user theme and variant CSS is concatenated with Tailwind imports, eliminating all JS-object-to-CSS translation.

**Files deleted:** 10 (6 source + 4 tests in `src/theme/` and `src/variants/`)
**Files rewritten:** 1 (`src/pipeline/generator.ts`)
**Files modified:** 3-4 (`src/pipeline/rewriter.ts`, `src/index.ts`, `src/types.ts`, `src/cli.ts`)
**Files unchanged:** 4 (`src/pipeline/parser.ts`, `src/pipeline/extractor.ts`, `src/pipeline/namer.ts`)

**Per-node isolation strategy:** Fresh `compile()` per node with cached `loadStylesheet` results. This is the simplest correct approach. If profiling shows it is too slow (>50 nodes), optimize to single-pass `build()` with post-hoc CSS rule splitting.

### Critical Pitfalls

1. **build() is additive and stateful** -- Cannot reuse a compiler instance for per-node CSS isolation. Each `build()` call returns cumulative CSS for ALL candidates ever passed. Mitigate with fresh compiler per node or single-pass with post-hoc splitting.

2. **CSS output includes preflight and theme by default** -- `@import "tailwindcss"` produces the full stylesheet (reset, theme variables, utilities). Use selective imports (`tailwindcss/theme.css` + `tailwindcss/utilities.css`) to exclude preflight.

3. **loadStylesheet callback is required** -- `compile()` throws without it. Must resolve Tailwind's internal CSS files (index.css, theme.css, preflight.css, utilities.css) including recursive imports between them. Bundle as `?raw` imports at build time.

4. **Selector format differences break the rewriter** -- The rewriter (448 lines) was hand-tuned to UnoCSS's output format. Tailwind uses different media query syntax (`width >= 640px` vs `min-width: 640px`), CSS nesting, and potentially different escaping. Snapshot Tailwind output for 30+ utilities before adapting the rewriter.

5. **compile() is not a public API** -- Tailwind maintainers explicitly called it "internal/undocumented." Pin version tightly, isolate all imports to one adapter file, and run integration tests against real `compile()` output (no mocking).

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Regression Test Baseline
**Rationale:** Must capture current convert() output before changing the engine. Without a baseline, there is no safety net for verifying output parity.
**Delivers:** Snapshot tests for existing fixtures covering standard utilities, variants, arbitrary values, theme, and custom variants.
**Addresses:** Foundation for all subsequent phases.
**Avoids:** Silent regressions during engine swap.

### Phase 2: Tailwind Adapter Module
**Rationale:** The generator adapter is the single integration point. It must work correctly before anything else is modified. Creating it alongside the old generator (feature-flagged or separate function) allows incremental testing.
**Delivers:** New `pipeline/generator.ts` with `compile().build()` integration, `loadStylesheet` callback, compiler caching, CSS layer separation.
**Addresses:** Table stakes features (compile integration, loadStylesheet, caching, layer separation).
**Avoids:** Pitfalls 1 (additive build), 2 (preflight in output), 3 (loadStylesheet), 5 (API instability via thin adapter), 7 (instantiation cost via caching), 12 (empty utilities).

### Phase 3: Pipeline Wiring and Rewriter Adaptation
**Rationale:** Wire the new adapter into the pipeline and adapt the rewriter to Tailwind's CSS output format. This is where snapshot tests from Phase 1 catch regressions.
**Delivers:** Working end-to-end conversion using Tailwind engine. Selector rewriting compatible with Tailwind output. Unmatched class detection.
**Addresses:** Selector rewriting compatibility, unmatched detection, variant/pseudo handling.
**Avoids:** Pitfall 4 (selector format differences), Pitfall 6 (unmatched detection).

### Phase 4: Delete Old Code and Simplify API
**Rationale:** Only after regression tests pass with the new engine. Safe deletion of theme/variant translation layers and UnoCSS dependencies.
**Delivers:** Deleted `src/theme/`, `src/variants/`, removed UnoCSS packages. Simplified `ConvertOptions` (CSS strings only). Reduced warning types. Updated CLI wiring.
**Addresses:** Native @theme support, native @custom-variant support, code simplification.
**Avoids:** Pitfall 8 (theme/variant CSS must be in compile input -- verified by tests before deletion).

### Phase 5: Packaging and Output Polish
**Rationale:** Final phase handles distribution concerns and output format edge cases.
**Delivers:** Peer dependency declaration for `tailwindcss>=4.0.0`, version conflict detection, documentation of modern CSS output (range media queries), preflight duplication prevention across multi-component conversions.
**Addresses:** Version conflict (Pitfall 10), media query syntax (Pitfall 11), preflight duplication (Pitfall 9).

### Phase Ordering Rationale

- Phase 1 before 2 because the regression baseline is the safety net for the entire migration.
- Phase 2 before 3 because the rewriter needs actual Tailwind CSS output to adapt against.
- Phase 3 before 4 because old code deletion is only safe after the new engine passes all tests.
- Phase 5 last because packaging/polish concerns do not block core functionality.
- The dependency chain is strictly linear: each phase depends on the previous.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** The per-node isolation strategy (fresh compile per node vs single-pass splitting) needs benchmarking with real fixtures to determine if compile-per-node performance is acceptable. Also needs verification that `?raw` CSS imports work correctly through tsdown's build pipeline.
- **Phase 3:** Rewriter adaptation requires snapshotting Tailwind's exact CSS output for 30+ utility patterns. The current rewriter is 448 lines of hand-tuned regex -- high risk of subtle mismatches.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Standard snapshot testing with vitest. Well-documented, no unknowns.
- **Phase 4:** Pure deletion and simplification. No new patterns needed.
- **Phase 5:** Standard npm packaging patterns. Peer dependencies are well-documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | `tailwindcss@4.2.2` verified locally on 2026-04-05. `compile().build()` signatures confirmed from source and type definitions. Zero-dep package confirmed via npm view. |
| Features | HIGH | All table-stakes features verified from Tailwind source code. `@theme`, `@custom-variant`, `source(none)`, responsive/state/dark variants all confirmed working. |
| Architecture | MEDIUM-HIGH | Pipeline flow is clear. Per-node isolation strategy is the main uncertainty -- fresh-compile-per-node is correct but may have performance implications for large files. |
| Pitfalls | MEDIUM | Additive build() behavior confirmed from source comments. API instability risk is real (maintainer quotes). Rewriter adaptation risk is high but bounded (regex changes, not architectural). |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Per-node isolation performance:** Need real benchmarks. How long does `compile()` take with cached stylesheet content? Is 20 compile calls per file acceptable? Measure during Phase 2 and decide if single-pass optimization is needed for v2.0 or can wait for v2.1.
- **Rewriter edge cases:** Tailwind's selector escaping for arbitrary values (`bg-[#ff0000]`, `grid-cols-[1fr_2fr]`) and stacked variants (`dark:hover:focus:text-red-500`) needs snapshot verification. The rewriter may need significant regex updates.
- **`?raw` CSS imports through tsdown:** The architecture recommends bundling Tailwind CSS files as raw strings. Verify this works with tsdown's build pipeline and does not bloat the published package.
- **`compile()` API stability:** No public stability guarantee. Monitor Tailwind releases. The thin adapter pattern mitigates this but cannot eliminate the risk entirely.

## Sources

### Primary (HIGH confidence)
- [tailwindcss@4.2.2 type definitions](https://www.npmjs.com/package/tailwindcss) -- compile() signature, CompileOptions, build() return type
- [Tailwind CSS v4.2.2 source code](https://github.com/tailwindlabs/tailwindcss) -- compile(), build() internals, additive candidate behavior
- [Tailwind CSS Functions and Directives docs](https://tailwindcss.com/docs/functions-and-directives) -- source(none), @theme, @custom-variant syntax
- [Tailwind CSS Theme docs](https://tailwindcss.com/docs/theme) -- @theme inline, @theme static, namespace mappings
- [Tailwind CSS Detecting Classes docs](https://tailwindcss.com/docs/detecting-classes-in-source-files) -- source(none) behavior
- Local verification tests (2026-04-05) -- compile/build with source(none), @theme, @custom-variant all confirmed working

### Secondary (MEDIUM confidence)
- [GitHub Discussion #16581](https://github.com/tailwindlabs/tailwindcss/discussions/16581) -- Maintainer stated compile() is "internal/undocumented/not public"
- [GitHub Discussion #15881](https://github.com/tailwindlabs/tailwindcss/discussions/15881) -- Community compile() usage patterns
- [GitHub Discussion #18356](https://github.com/tailwindlabs/tailwindcss/discussions/18356) -- API instability after v4.1
- [@tailwindcss/node source](https://github.com/tailwindlabs/tailwindcss/tree/main/packages/%40tailwindcss-node) -- loadStylesheet reference implementation

### Tertiary (LOW confidence)
- [GitHub Issue #19853](https://github.com/tailwindlabs/tailwindcss/issues/19853) -- Preflight duplication in production (confirms risk but fix status unknown)
- [Nuxt UI Issue #2455](https://github.com/nuxt/ui/issues/2455) -- v3/v4 version conflict evidence

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
