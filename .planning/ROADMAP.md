# Roadmap: Vanillify

## Milestones

- v1.0 MVP - Phases 1-3 (shipped 2026-04-05)
- v1.1 Toolchain & Theme Support - Phases 4-6 (in progress)

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

### v1.1 Toolchain & Theme Support (In Progress)

**Milestone Goal:** Modernize the build toolchain to vite-plus, adopt magic-regexp for all pattern matching, and add Tailwind v4 `@theme` block support.

- [ ] **Phase 4: Toolchain Foundation** - Migrate to pnpm and unify build/test/lint/fmt config under vite-plus
- [ ] **Phase 5: Code Quality** - Replace static regex patterns with magic-regexp for readability and type safety
- [ ] **Phase 6: Theme Support** - Parse Tailwind v4 @theme blocks, map to UnoCSS theme config, expose via API and CLI

## Phase Details

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
**Plans:** 3 plans

Plans:
- [ ] 04-01-PLAN.md -- Migrate to pnpm and snapshot dist/ baseline
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
**Plans:** 2 plans

Plans:
- [ ] 05-01-PLAN.md -- Install magic-regexp, configure transform plugin, convert simple patterns
- [ ] 05-02-PLAN.md -- Convert complex patterns (parser, generator, rewriter) and document dynamic patterns

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
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 4 -> 5 -> 6

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Core Pipeline | v1.0 | 4/4 | Complete | 2026-04-05 |
| 2. Custom Variant Resolution | v1.0 | 2/2 | Complete | 2026-04-05 |
| 3. CLI and Package | v1.0 | 2/2 | Complete | 2026-04-05 |
| 4. Toolchain Foundation | v1.1 | 0/3 | Not started | - |
| 5. Code Quality | v1.1 | 0/2 | Not started | - |
| 6. Theme Support | v1.1 | 0/? | Not started | - |
