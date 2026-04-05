# Project Research Summary

**Project:** vanillify
**Domain:** TypeScript library — Tailwind CSS to vanilla CSS converter
**Researched:** 2026-04-04
**Confidence:** MEDIUM-HIGH

## Executive Summary

Vanillify is a build-time static analysis library that converts Tailwind CSS utility classes in JSX/TSX source files into plain vanilla CSS, replacing class names with deterministic indexed selectors (`.node0`, `.node1`, etc.). Expert-grade tools in this domain use a two-component engine: a proper AST parser for class extraction (not regex), and a real CSS generation pipeline (not lookup tables). The recommended approach pairs `oxc-parser` for AST-level JSX traversal with UnoCSS's `createGenerator` API for accurate CSS output — the only combination that handles variants, arbitrary values, and responsive prefixes correctly. No existing npm package does both.

The key architectural bet is a four-stage compiler pipeline (parse → extract → generate → rewrite) where each stage is a pure, independently-testable function. The programmatic API (`convert(source, options) => { css, component }`) is the primary surface; the CLI is a thin wrapper around it. Custom variant resolution (`@custom-variant`) requires a translation layer that converts Tailwind's CSS directive syntax into UnoCSS's JavaScript variant format — this is not handled by UnoCSS natively and is the most complex feature in v1 scope.

The primary risk is that `@unocss/preset-wind4` is acknowledged by its maintainers as "not fully ready yet" for Tailwind v4 feature parity. Core utilities (flex, grid, spacing, colors, responsive prefixes, pseudo-class variants) work reliably, but `@theme` blocks, the `(--custom-property)` shorthand, and a handful of newer v4 utilities have gaps. The mitigation is to validate against Tailwind v4's own documentation examples in an early test matrix and document all known gaps rather than treating them as silent failures.

---

## Key Findings

### Recommended Stack

The stack centers on three runtime packages: `@unocss/core` + `@unocss/preset-wind4` for CSS generation, and `oxc-parser` for JSX/TSX parsing. UnoCSS provides the only public programmatic API for generating Tailwind-compatible CSS — Tailwind itself has no `generate()` API. oxc-parser is a Rust-powered, ESTree-compatible parser used in production by Rolldown; it handles JSX/TSX natively and is the fastest option available. For the CLI, `citty` + `consola` + `pathe` from the UnJS ecosystem provide lightweight, typed argument parsing and output with no dependency bloat.

The build and development toolchain is equally important to get right: `tsdown` (not `tsup`, which is unmaintained) for library bundling with dual ESM+CJS output, `vitest` v4 for testing, and `typescript` 5.5+ for `isolatedDeclarations` support. All packages must stay on `@unocss/*@^66.x` — the monorepo versions in lockstep.

**Core technologies:**
- `@unocss/core` + `@unocss/preset-wind4` ^66.6.7: CSS generation engine — only programmatic API that produces accurate Tailwind v4 CSS
- `oxc-parser` ^0.123.0: JSX/TSX AST parsing — fastest parser available, ESTree-compatible, handles all JSX dialects
- `tsdown` ^0.21.7: Library bundler — successor to tsup, ESM-first, built on Rolldown, Node 20.19+ required
- `vitest` ^4.1.2: Unit + integration testing — native Vite/Rolldown integration, zero config for node-only libraries
- `citty` ^0.1.x: CLI argument parsing — lightweight, typed, from the same VoidZero/UnJS ecosystem

**Avoid:** `tsup` (unmaintained), the full `unocss` metapackage (10x oversized), `@unocss/preset-wind` deprecated alias, regex-based class extraction, lookup-table converters

### Expected Features

All v1 scope features have verified implementation paths. The core differentiator set — AST extraction + UnoCSS generation + custom variant resolution — is what makes vanillify viable where existing tools fall short. No other published tool has all three.

**Must have (table stakes):**
- Standard utility class resolution (flex, grid, spacing, color, typography) — UnoCSS handles via preset-wind4
- Variant/pseudo-class conversion (`hover:`, `focus:`, `active:`, `disabled:`) — required for any real-world Tailwind code
- Responsive breakpoint conversion (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) — produces `@media` rules via UnoCSS preset variants
- JSX/TSX class attribute extraction — target users write React/Qwik/Solid components, HTML-only is a non-starter
- Programmatic API (`convert(source, options) => { css, component }`) — primary interface; CLI and integrations build on this
- CLI interface (`npx vanillify <files>`) — required for build pipeline integration
- Indexed class naming (`.node0`, `.node1`) — defined output format; must be consistent from day one
- Custom variant resolution (opt-in) — the primary motivating use case for the QDS integration; without it the tool doesn't solve the original problem

**Should have (competitive):**
- AST-based extraction (vs. regex) — the core technical differentiator; no existing converter does this
- Stacked variant handling (`dark:hover:text-white`) — important for production code; UnoCSS handles natively
- Glob pattern support in CLI — `vanillify 'src/**/*.tsx'` for batch processing
- Tailwind v3 compatibility mode via `preset-wind3` — low additional effort
- Verbose/debug output flag — high value for diagnosing missing class coverage

**Defer (v2+):**
- `@theme` block conversion — complex, intertwined with UnoCSS resolver internals, high risk of bugs
- Semantic class naming via local AI — fundamentally different product surface
- Vite plugin — useful but needs stable library API first
- HTML file support — requires a different parser path; almost a separate product
- Watch mode — a build-step tool has no meaningful change to watch; let existing watchers handle it

### Architecture Approach

The canonical architecture for vanillify is a four-stage linear compiler pipeline: Parser (oxc-parser wraps source text into AST + span positions) → Extractor (AST visitor walks JSXAttribute nodes, collects className strings with source offsets and node index) → Generator (UnoCSS `createGenerator` singleton maps token sets to CSS strings) → Rewriter (span-based text patching replaces className values in-place, assembles final CSS). The pipeline is pure-function, side-effect-free in the library; all I/O is the CLI's responsibility. Supporting services — Variant Resolver (maps `@custom-variant` definitions to UnoCSS variant config) and Index Namer (deterministic per-file `.nodeN` assignment) — run between extraction and generation.

**Major components:**
1. `src/pipeline/parser.ts` — wraps `oxc-parser.parseSync`; source text in, AST + spans out
2. `src/pipeline/extractor.ts` — JSX Visitor walk; produces `NodeEntry[]` with class names and byte-offset spans
3. `src/pipeline/generator.ts` — UnoCSS `createGenerator` singleton; async init once, `generate()` per node entry
4. `src/pipeline/namer.ts` — assigns `.node0`, `.node1` etc. per file in DOM extraction order
5. `src/pipeline/rewriter.ts` — span-based source patching (reverse order to prevent offset drift) + CSS assembly
6. `src/variants/resolver.ts` — translates `@custom-variant` CSS directive syntax to UnoCSS JavaScript variant format
7. `src/index.ts` — sole public API surface; exports `convert()` and types
8. `src/cli.ts` — file I/O, glob expansion, argument parsing; imports only from `src/index.ts`

**Key patterns:**
- Span-based rewriting (not AST reprinting) — preserves formatting, comments, whitespace; only className values change
- Singleton UnoCSS generator with lazy init — `createGenerator` is expensive; instantiate once per process
- Per-file processing with shared generator — node index resets per file; generator is safe to share (stateless generation)
- Dual entry point — programmatic API via `exports` and CLI via `bin`; CLI code never leaks into library

### Critical Pitfalls

1. **UnoCSS preset-wind4 is not feature-complete against Tailwind v4** — Build a class-coverage test matrix in Phase 1 using Tailwind v4 docs as ground truth. Document all gaps; ship a `--strict` flag that errors on unmatched classes rather than silently dropping them. Affected: `(--custom-property)` shorthand, `pointer-coarse:` variant, `wrap-anywhere` utility, `@theme` blocks.

2. **`generate()` input contract: pass source code, not a class list** — `generator.generate(input)` expects source code (the extractor scans it for tokens). Passing bare `"flex bg-red-500"` strings may silently return empty CSS depending on extractor configuration. Validate the exact input contract in an early spike before building the full pipeline on top of it.

3. **`@custom-variant` requires a translation layer — not a UnoCSS feature** — Tailwind v4's `@custom-variant` is a CSS directive; UnoCSS uses JavaScript-based variant configuration. Passing raw `@custom-variant` CSS to `createGenerator` silently does nothing. Custom variant support requires its own parser that translates directive syntax to UnoCSS `variants` config entries.

4. **Dynamic class names are structurally unresolvable — never fail silently** — `className={condition ? 'a' : 'b'}`, `cn()`, template literals with variables: these cannot be statically extracted. The extractor must categorize nodes as `static` vs `dynamic`, extract statically-determinable fragments where possible, and emit warnings for runtime-variable parts. Silent omission is unacceptable.

5. **Generator cache isolation for programmatic API use** — The UnoCSS generator maintains an internal cache. In CLI mode (process exits per run) this is safe. In library use (long-lived process, repeated `convert()` calls), cache state can leak across calls. Design the API isolation contract before publishing — either fresh generator per call, or memoize by config identity.

---

## Implications for Roadmap

Based on the component dependency graph in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, the natural build order is: core pipeline first (foundation everything else requires), variant handling next (required for real-world code), custom variant resolution (the primary v1 motivating use case), then the CLI and polish.

### Phase 1: Project Foundation and Core Pipeline Spike

**Rationale:** Types, project structure, and the UnoCSS integration contract must be validated before anything else is built on top of them. Pitfall 7 (`generate()` input contract) must be resolved here — not discovered later. The ARCHITECTURE.md component dependency graph shows `types.ts` → `parser.ts` → `extractor.ts` as the required build sequence.
**Delivers:** Working `convert()` function for a simple JSX file with no variants; class-coverage test matrix for standard Tailwind v4 utilities; validated `generate()` input format
**Addresses:** Standard utility coverage (flex, grid, spacing, color, typography, sizing); programmatic API skeleton; indexed class naming
**Avoids:** Pitfall 1 (preset-wind4 gaps discovered post-ship), Pitfall 7 (wrong `generate()` input format)

### Phase 2: Complete Extraction and Rewriting

**Rationale:** Once the UnoCSS integration is proven, oxc-parser extraction and span-based rewriting can be built with confidence in what the generator expects. The extractor's handling of dynamic class expressions (Pitfall 2) must be addressed here — it directly shapes the API's honesty contract.
**Delivers:** Full AST-based class extraction with `static`/`dynamic` classification; span-based source rewriting that replaces className values in-place; working end-to-end `convert()` for realistic component files
**Addresses:** AST-based class extraction differentiator; correct indexed class output; handling of JSX expression containers
**Avoids:** Pitfall 2 (silent omission of dynamic class names), Anti-Pattern 1 (regex extraction), Anti-Pattern 2 (AST reprinting)

### Phase 3: Variant Handling

**Rationale:** Standard utilities without variants are useless for real-world Tailwind code. Variants are table-stakes per FEATURES.md. UnoCSS handles most of this for free via preset-wind4, but stacked variants and the specifics of arbitrary variants need explicit test coverage.
**Delivers:** Correct CSS for `hover:`, `focus:`, `active:`, `disabled:`; responsive breakpoints via `@media` rules; stacked variants (`dark:md:hover:`); arbitrary variants (`[&>*]:`)
**Addresses:** Variant/pseudo-class conversion (table stakes); responsive breakpoint conversion (table stakes); stacked variant handling (v1.x)
**Avoids:** Pitfall 4 (stacked variant selector correctness), Pitfall 5 (arbitrary value CSS escaping)

### Phase 4: Custom Variant Resolution

**Rationale:** Custom variant support is the primary motivating use case for the QDS integration and the single most complex feature in v1. It requires its own translation layer and cannot be bundled with standard variant handling because the `@custom-variant` → UnoCSS variant config translation is a separate, independently-testable concern.
**Delivers:** `customVariants` option in `ConvertOptions`; `@custom-variant` directive parser; working end-to-end custom variant CSS generation for QDS `ui-checked`, `ui-disabled` patterns
**Addresses:** Custom variant resolution (P1 feature); variant definition parsing
**Avoids:** Pitfall 3 (`@custom-variant` silently fails if passed to UnoCSS directly), Anti-Pattern 5 (bundling variant logic into generator)

### Phase 5: CLI, Polish, and Release Packaging

**Rationale:** The CLI is a thin wrapper and should come last — it adds no new conversion logic, only file I/O and argument parsing. Release packaging (tsdown dual output, package.json `exports` map, `bin` field) completes the deliverable.
**Delivers:** `npx vanillify <files>` CLI; glob support; verbose/debug flag; dual ESM+CJS build output; accurate package.json `exports` map; `--strict` mode flag
**Addresses:** CLI interface (table stakes); glob pattern support (v1.x); verbose output (v1.x)
**Avoids:** Anti-Pattern 4 (CLI I/O leaking into library), generator cache isolation issue (Pitfall 8)

### Phase Ordering Rationale

- Phases 1-2 are sequenced by the component dependency graph: types before parser, parser before extractor, extractor before rewriter
- Phase 3 before Phase 4: standard variant handling proves the generation pipeline for variants before adding the custom translation layer on top
- Phase 5 last: CLI is intentionally a wrapper; publishing before the core API is stable creates user expectations that are hard to walk back
- The UnoCSS integration spike in Phase 1 is non-negotiable — Pitfall 7 and Pitfall 1 both require early validation before the pipeline architecture is locked

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Custom Variant Resolution):** The `@custom-variant` → UnoCSS variant format translation is underdocumented. The QDS `ui-checked` variant uses nested compound selectors (`[ui-qds-scope][ui-checked] > &`) — how the lossy simplification to a descendant selector should work needs design work, not just implementation.
- **Phase 1 (UnoCSS Integration Spike):** The exact `generate()` input format that reliably produces CSS for all utility categories is an open question (Pitfall 7). May need hands-on experimentation.

Phases with standard patterns (skip research-phase):
- **Phase 2 (Extraction + Rewriting):** oxc-parser's `parseSync` and `Visitor` API are well-documented. Span-based rewriting is a known pattern from jscodeshift codemods.
- **Phase 5 (CLI + Packaging):** citty CLI setup and tsdown dual-output configuration are standard in this ecosystem with clear docs.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All packages have official docs. tsdown/vitest ecosystem is well-established. oxc-parser is production-proven in Rolldown. The only MEDIUM item is preset-wind4 completeness. |
| Features | MEDIUM | Table stakes features are well-evidenced. Custom variant behavior is inferred from QDS requirements + UnoCSS internals rather than direct documentation. |
| Architecture | HIGH | Compiler pipeline patterns are textbook. Span-based rewriting is proven by jscodeshift. UnoCSS `createGenerator` singleton pattern confirmed by source inspection. Specific return types from `generate()` are MEDIUM — sourced from DeepWiki/indirect references. |
| Pitfalls | MEDIUM | Core pitfalls are well-evidenced from UnoCSS issues, reference implementation analysis, and Tailwind docs. Generator cache behavior (Pitfall 8) is inferred from UnoCSS architecture description rather than confirmed by direct testing. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **preset-wind4 class coverage boundary:** Exactly which Tailwind v4 utility classes are missing from preset-wind4 is not fully enumerated. Resolution: build the test matrix in Phase 1 against Tailwind's own docs; treat any empty CSS output as a gap to document.
- **`generate()` input format contract:** Whether passing a minimal HTML wrapper (`<div class="...">`) vs. the full JSX source produces meaningfully different output is untested. Resolution: spike this in Phase 1 before building the extraction pipeline on top of an assumption.
- **Custom variant translation fidelity:** The exact semantics of simplifying QDS's compound `@custom-variant` selectors to vanilla descendant selectors needs design decisions (what is acceptable to lose). Resolution: spec this with QDS team before Phase 4 implementation.
- **oxlint + `@antfu/eslint-config` coexistence:** Both are recommended but the exact config for running them alongside each other without conflicts needs setup experimentation. Resolution: low priority, address in project setup during Phase 1.

---

## Sources

### Primary (HIGH confidence)
- [UnoCSS Core API — unocss.dev/tools/core](https://unocss.dev/tools/core) — `createGenerator`, `generate()` API
- [UnoCSS preset-wind4 — unocss.dev/presets/wind4](https://unocss.dev/presets/wind4) — Tailwind v4 preset docs and known gaps
- [oxc-parser npm — npmjs.com/package/oxc-parser](https://www.npmjs.com/package/oxc-parser) — `parseSync` API, version 0.123.0
- [Oxc Parser guide — oxc.rs/docs/guide/usage/parser.html](https://oxc.rs/docs/guide/usage/parser.html) — Visitor class, ESTree compatibility
- [tsdown Introduction — tsdown.dev/guide/](https://tsdown.dev/guide/) — version 0.21.7, Node 20.19+ requirement
- [Vitest 4.0 announcement — vitest.dev/blog/vitest-4](https://vitest.dev/blog/vitest-4) — version 4.1.2

### Secondary (MEDIUM confidence)
- [UnoCSS Tailwind v4 Support Issue #4411](https://github.com/unocss/unocss/issues/4411) — "not fully ready yet" maintainer quote; known gaps
- [UnoCSS Tailwind v4 Discussion #4288](https://github.com/unocss/unocss/discussions/4288) — scope of preset-wind4
- [UnoCSS DeepWiki](https://deepwiki.com/unocss/unocss) — pipeline stages, `UnoGenerator` internals
- [UnoCSS architecture deep-dive (jser.dev)](https://jser.dev/2023-09-17-how-unocss-works-with-vite/) — `generate()` return value internals (2023; cross-checked against DeepWiki)
- [Reference implementation: tailwind-v4-to-css-converter](https://github.com/olusegun-kunai/tailwind-v4-to-css-converter) — proved UnoCSS approach; exposed regex extraction limitation

### Tertiary (LOW confidence)
- [tailwind-vanilla (GitHub)](https://github.com/mattloyed/tailwind-vanilla) — competitor feature reference only; lookup-table approach
- [Tailwind @custom-variant — DeepWiki](https://deepwiki.com/tlq5l/tailwindcss-v4-skill/2.4-the-@variant-and-@custom-variant-directives) — directive syntax reference; translation to UnoCSS is inferred

---
*Research completed: 2026-04-04*
*Ready for roadmap: yes*
