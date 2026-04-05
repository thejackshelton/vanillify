# Roadmap: Vanillify

## Milestones

- v1.0 MVP - Phases 1-3 (shipped 2026-04-05)
- v1.1 Toolchain & Theme Support - Phases 4-7 (shipped)
- v2.0 Tailwind Compile Migration - Phases 8-11 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>v1.0 MVP (Phases 1-3) - SHIPPED 2026-04-05</summary>

- [x] **Phase 1: Core Pipeline** - Complete convert() function: AST extraction, UnoCSS CSS generation, indexed naming, source rewriting, and all standard variants (completed 2026-04-05)
- [x] **Phase 2: Custom Variant Resolution** - Opt-in @custom-variant parsing and translation layer for QDS and user-defined variants (completed 2026-04-05)
- [x] **Phase 3: CLI and Package** - CLI wrapper, glob support, dual ESM+CJS build, typed exports, and release packaging (completed 2026-04-05)

### Phase 1: Core Pipeline
**Goal**: Users can call `convert(source)` and get accurate CSS + transformed JSX for any real-world Tailwind component
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, VARI-01, VARI-02, VARI-03
**Success Criteria** (what must be TRUE):
  1. `convert(source)` returns a CSS string and a transformed component string for a JSX file using standard Tailwind utilities (flex, grid, spacing, color, typography)
  2. Generated CSS uses `.node0`, `.node1`, etc. selectors assigned per JSX element, matching the transformed component's class names
  3. Pseudo-class variants (hover:, focus:, active:, disabled:) produce correct CSS pseudo-selectors; responsive variants (sm:, md:, lg:) produce correct @media rules; stacked variants (dark:hover:) resolve correctly
  4. Dynamic class expressions (ternaries, template literals, clsx) are detected and emit a warning -- they are never silently skipped
  5. Arbitrary Tailwind values (text-[#ff0000], w-[calc(100%-1rem)]) produce correct CSS output
**Plans:** 4/4 plans complete

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding, type definitions, and parser module
- [x] 01-02-PLAN.md -- AST class extractor with dynamic expression detection
- [x] 01-03-PLAN.md -- UnoCSS generator singleton and indexed namer module
- [x] 01-04-PLAN.md -- Rewriter module, convert() API wiring, and integration tests

**UI hint**: no

### Phase 2: Custom Variant Resolution
**Goal**: Users can opt in to custom variant resolution by providing `@custom-variant` definitions, and those variants resolve to correct vanilla CSS output
**Depends on**: Phase 1
**Requirements**: CVAR-01, CVAR-02, CVAR-03
**Success Criteria** (what must be TRUE):
  1. User can pass `customVariants` option to `convert()` with `@custom-variant` CSS definitions and get correct descendant-selector CSS for those variants
  2. QDS variants (ui-checked, ui-disabled, ui-mixed) resolve to simplified descendant selectors in the output CSS
  3. Calling `convert()` without `customVariants` produces identical output to Phase 1 -- the feature is fully opt-in with zero effect on the default path
**Plans:** 2/2 plans complete

Plans:
- [x] 02-01-PLAN.md -- Variant parser, resolver, and types (TDD)
- [x] 02-02-PLAN.md -- Pipeline wiring and integration tests (TDD)

### Phase 3: CLI and Package
**Goal**: The library is published and usable via `npx vanillify` and `import { convert } from 'vanillify'`
**Depends on**: Phase 2
**Requirements**: CLI-01, CLI-02, PKG-01, PKG-02, PKG-03
**Success Criteria** (what must be TRUE):
  1. `npx vanillify src/**/*.tsx` processes all matched files and writes converted output to disk
  2. CLI delegates all conversion logic to the programmatic API -- no conversion code lives in `src/cli.ts`
  3. `import { convert } from 'vanillify'` works in both ESM and CJS environments with full TypeScript types
  4. Vitest fixture tests (Qwik checkbox example) pass and snapshot output is stable
**Plans:** 2/2 plans complete

Plans:
- [x] 03-01-PLAN.md -- CLI entry point, dependencies, tsdown dual-entry build
- [x] 03-02-PLAN.md -- Fixture-based snapshot tests with toMatchFileSnapshot

**UI hint**: no

</details>

<details>
<summary>v1.1 Toolchain & Theme Support (Phases 4-7) - SHIPPED</summary>

### Phase 4: Toolchain Foundation
**Goal**: The project builds, tests, lints, and formats through a single vite-plus config with pnpm as package manager
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-04, TOOL-05
**Success Criteria** (what must be TRUE):
  1. `pnpm install` resolves all dependencies from pnpm-lock.yaml, and package.json contains a `packageManager` field pointing to pnpm
  2. A single `vite.config.ts` with vite-plus `defineConfig` replaces the separate `tsdown.config.ts` and `vitest.config.ts` -- those files no longer exist
  3. `vp pack` produces identical dist/ output (same entry points, same exports, same file structure) as the previous `tsdown` build
  4. `vp test` discovers and passes all existing tests with zero behavior change
  5. `vp lint` and `vp fmt` run successfully with project rules configured
**Plans:** 3/3 plans complete

Plans:
- [x] 04-01-PLAN.md -- Migrate to pnpm and snapshot dist/ baseline
- [x] 04-02-PLAN.md -- Unified vite-plus config, test import rewrite, build parity verification
- [x] 04-03-PLAN.md -- Lint and fmt configuration with oxlint and oxfmt

### Phase 5: Code Quality
**Goal**: All static regex patterns in the codebase use magic-regexp for readability, and dynamic patterns are explicitly documented as intentionally raw
**Depends on**: Phase 4 (vite-plus config needed for magic-regexp transform plugin)
**Requirements**: QUAL-01, QUAL-02
**Success Criteria** (what must be TRUE):
  1. Every static regex pattern (variant parser, generator layer regex, CLI extension matching, and others) uses magic-regexp -- no raw `/pattern/` literals remain for static patterns
  2. Dynamic regex patterns in rewriter.ts have explicit code comments explaining why they remain as raw RegExp (runtime construction incompatible with magic-regexp)
  3. All existing tests pass with zero behavior change after the regex migration
**Plans:** 2/2 plans complete

Plans:
- [x] 05-01-PLAN.md -- Install magic-regexp, configure transform plugin, convert simple patterns
- [x] 05-02-PLAN.md -- Convert complex patterns (parser, generator, rewriter) and document dynamic patterns

### Phase 6: Theme Support
**Goal**: Users can provide a Tailwind v4 `@theme` CSS block and get correct CSS output for theme-defined utility classes
**Depends on**: Phase 4 (stable toolchain); Phase 5 is not a hard dependency but should complete first for code quality
**Requirements**: THEME-01, THEME-02, THEME-03, THEME-04, THEME-05, THEME-06, THEME-07, THEME-08, THEME-09, THEME-10
**Success Criteria** (what must be TRUE):
  1. `convert(source, { themeCss: '@theme { --color-brand: #ff0000; }' })` resolves `bg-brand` to correct CSS output with the theme color value
  2. Theme config extends preset-wind4 defaults -- providing `--color-brand` does not remove existing colors like red, blue, etc. from resolution
  3. Sequential calls with different `themeCss` values produce different CSS output (generator cache correctly invalidated by theme identity)
  4. `npx vanillify --theme theme.css src/**/*.tsx` reads the CSS file and passes theme to the conversion pipeline, producing theme-aware output
  5. Calling `convert()` without `themeCss` produces identical output to v1.0 -- the feature is fully opt-in with zero regression
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01-PLAN.md -- Theme types, @theme CSS parser, and namespace mapper (TDD)
- [x] 06-02-PLAN.md -- Generator theme config, pipeline wiring, and integration tests (TDD)
- [x] 06-03-PLAN.md -- CLI --theme flag and end-to-end verification

### Phase 7: CSS Modules Output
**Goal**: Users can choose CSS Modules as an output format via `convert()` option or `--format css-modules` CLI flag, producing `styles.nodeN` JSX expressions with import statements and `.module.css` file extensions
**Depends on**: Phase 6
**Requirements**: MOD-01, MOD-02, MOD-03, MOD-04, MOD-05, MOD-06, MOD-07, MOD-08
**Success Criteria** (what must be TRUE):
  1. `convert(source, filename, { outputFormat: 'css-modules' })` produces component output with `{styles.nodeN}` JSX expressions and `import styles from './filename.module.css'`
  2. CSS output content is identical between vanilla and css-modules formats (only JSX references and file extension change)
  3. `npx vanillify --format css-modules src/**/*.tsx` writes `.module.css` files instead of `.vanilla.css`
  4. Calling `convert()` without `outputFormat` produces identical output to current behavior (fully backward compatible)
  5. Dynamic class expressions remain unchanged regardless of output format
**Plans:** 2/2 plans complete

Plans:
- [x] 07-01-PLAN.md -- OutputFormat types, format-aware rewriter, convert() threading (TDD)
- [x] 07-02-PLAN.md -- CLI --format flag and CLAUDE.md constraint update

</details>

### v2.0 Tailwind Compile Migration (In Progress)

**Milestone Goal:** Replace UnoCSS engine with Tailwind v4's native `compile().build()` API, delete custom translation layers, and simplify the codebase while preserving the public API.

- [ ] **Phase 8: Regression Test Baseline** - Snapshot current convert() output for all fixtures before any engine changes
- [ ] **Phase 9: Tailwind Adapter Module** - Build compile().build() integration with loadStylesheet, caching, and CSS layer separation
- [x] **Phase 10: Pipeline Wiring and Rewriter Adaptation** - Wire adapter into pipeline, adapt rewriter to Tailwind CSS output, verify regression parity (completed 2026-04-05)
- [ ] **Phase 11: Cleanup and API Verification** - Delete theme/variant translation layers, remove UnoCSS deps, verify public API backward compatibility

## Phase Details

### Phase 8: Regression Test Baseline
**Goal**: Every existing conversion behavior is captured in snapshot tests so engine changes in subsequent phases have a safety net
**Depends on**: Phase 7 (v1.1 complete)
**Requirements**: REG-01
**Success Criteria** (what must be TRUE):
  1. Snapshot tests exist for every existing fixture covering standard utilities, variants, arbitrary values, theme input, and custom variants
  2. Running the snapshot tests against the current (UnoCSS) engine produces zero failures -- the baseline is clean
  3. Unmatched class warning behavior is captured in at least one snapshot test
**Plans:** 1 plan

Plans:
- [x] 08-01-PLAN.md -- Comprehensive regression snapshot tests for all conversion paths

### Phase 9: Tailwind Adapter Module
**Goal**: A new generator module produces correct CSS from Tailwind's compile().build() API, tested in isolation against known inputs
**Depends on**: Phase 8
**Requirements**: ENG-01, ENG-02, ENG-03, ENG-04, ENG-05
**Success Criteria** (what must be TRUE):
  1. A Tailwind adapter function accepts candidate class names and returns generated CSS using compile().build() -- not UnoCSS
  2. The adapter resolves `@import "tailwindcss"` via a loadStylesheet callback without touching the filesystem
  3. `source(none)` prevents Tailwind from scanning files -- only oxc-parser-extracted candidates are processed
  4. Repeated calls with identical CSS input reuse a cached compiler instance (verified by test spy or timing)
  5. CSS output cleanly separates utility rules from `:root` theme variables, preserving the `themeCss` field shape
**Plans:** 1 plan

Plans:
- [x] 09-01-PLAN.md -- Tailwind compile().build() adapter with virtual loadStylesheet, caching, layer separation, and unit tests (TDD)

### Phase 10: Pipeline Wiring and Rewriter Adaptation
**Goal**: End-to-end conversion works through the Tailwind engine with the rewriter producing correct output for Tailwind's CSS format
**Depends on**: Phase 9
**Requirements**: RWR-01, RWR-02, RWR-03, REG-02, REG-03
**Success Criteria** (what must be TRUE):
  1. `convert()` produces correct output end-to-end using the Tailwind engine for all existing fixture files
  2. Selector rewriting handles Tailwind-specific CSS patterns: nesting syntax, `width >= 640px` media queries, and escaped selectors for arbitrary values
  3. Per-node CSS isolation is correct -- each node's CSS block contains only rules for that node's classes, no cross-contamination
  4. Unmatched Tailwind classes produce warnings via CSS output inspection (replacing the UnoCSS `matched` set approach)
  5. All existing tests pass with updated assertions reflecting Tailwind's CSS output format differences
**Plans:** 2/2 plans complete

Plans:
- [x] 10-01-PLAN.md -- Rewriter adaptation for Tailwind nested CSS and convert() pipeline simplification
- [x] 10-02-PLAN.md -- Update all tests and regression snapshots for Tailwind output format

### Phase 11: Cleanup and API Verification
**Goal**: The codebase contains no UnoCSS code or dependencies, all Tailwind imports are isolated to one adapter file, and the public API is fully backward compatible
**Depends on**: Phase 10
**Requirements**: CLN-01, CLN-02, CLN-03, CLN-04, API-01, API-02, API-03, API-04
**Success Criteria** (what must be TRUE):
  1. `src/theme/` and `src/variants/` directories are deleted -- Tailwind handles both natively
  2. `@unocss/core` and `@unocss/preset-wind4` are removed from package.json; `tailwindcss@~4.2.2` is the only CSS engine dependency
  3. All Tailwind imports exist in exactly one file (`pipeline/generator.ts`) -- no other source file imports from `tailwindcss`
  4. `convert()` called without options produces identical behavior to v1.x -- the default path is fully backward compatible
  5. `convert()` with `customVariants` (CSS string) and `themeCss` (CSS string or `@theme {}` block) produces correct output via native Tailwind processing
**Plans:** 2 plans

Plans:
- [ ] 11-01-PLAN.md -- Delete dead UnoCSS code, remove dependencies, rename Tailwind adapter to canonical generator.ts
- [ ] 11-02-PLAN.md -- API backward compatibility test suite

## Progress

**Execution Order:**
Phases execute in numeric order: 8 -> 9 -> 10 -> 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Pipeline | v1.0 | 4/4 | Complete | 2026-04-05 |
| 2. Custom Variant Resolution | v1.0 | 2/2 | Complete | 2026-04-05 |
| 3. CLI and Package | v1.0 | 2/2 | Complete | 2026-04-05 |
| 4. Toolchain Foundation | v1.1 | 3/3 | Complete | 2026-04-05 |
| 5. Code Quality | v1.1 | 2/2 | Complete | 2026-04-05 |
| 6. Theme Support | v1.1 | 3/3 | Complete | 2026-04-05 |
| 7. CSS Modules Output | v1.1 | 2/2 | Complete | 2026-04-05 |
| 8. Regression Test Baseline | v2.0 | 1/1 | Complete | - |
| 9. Tailwind Adapter Module | v2.0 | 0/1 | Not started | - |
| 10. Pipeline Wiring and Rewriter Adaptation | v2.0 | 2/2 | Complete   | 2026-04-05 |
| 11. Cleanup and API Verification | v2.0 | 0/2 | Not started | - |
