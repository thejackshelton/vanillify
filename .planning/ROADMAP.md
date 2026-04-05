# Roadmap: Vanillify

## Overview

Vanillify is built in three phases that follow the natural dependency graph of the library. Phase 1 delivers the complete conversion pipeline — AST extraction, UnoCSS CSS generation, indexed class naming, source rewriting, and all standard variant handling. Phase 2 adds the custom variant resolution layer (the primary QDS motivating use case) on top of the proven pipeline. Phase 3 wraps everything into a CLI, packages the library for publication, and validates the end-to-end deliverable. Each phase produces something fully testable before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Core Pipeline** - Complete convert() function: AST extraction, UnoCSS CSS generation, indexed naming, source rewriting, and all standard variants
- [ ] **Phase 2: Custom Variant Resolution** - Opt-in @custom-variant parsing and translation layer for QDS and user-defined variants
- [ ] **Phase 3: CLI and Package** - CLI wrapper, glob support, dual ESM+CJS build, typed exports, and release packaging

## Phase Details

### Phase 1: Core Pipeline
**Goal**: Users can call `convert(source)` and get accurate CSS + transformed JSX for any real-world Tailwind component
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08, VARI-01, VARI-02, VARI-03
**Success Criteria** (what must be TRUE):
  1. `convert(source)` returns a CSS string and a transformed component string for a JSX file using standard Tailwind utilities (flex, grid, spacing, color, typography)
  2. Generated CSS uses `.node0`, `.node1`, etc. selectors assigned per JSX element, matching the transformed component's class names
  3. Pseudo-class variants (hover:, focus:, active:, disabled:) produce correct CSS pseudo-selectors; responsive variants (sm:, md:, lg:) produce correct @media rules; stacked variants (dark:hover:) resolve correctly
  4. Dynamic class expressions (ternaries, template literals, clsx) are detected and emit a warning — they are never silently skipped
  5. Arbitrary Tailwind values (text-[#ff0000], w-[calc(100%-1rem)]) produce correct CSS output
**Plans:** 4 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding, type definitions, and parser module
- [x] 01-02-PLAN.md — AST class extractor with dynamic expression detection
- [ ] 01-03-PLAN.md — UnoCSS generator singleton and indexed namer module
- [ ] 01-04-PLAN.md — Rewriter module, convert() API wiring, and integration tests

**UI hint**: no

### Phase 2: Custom Variant Resolution
**Goal**: Users can opt in to custom variant resolution by providing `@custom-variant` definitions, and those variants resolve to correct vanilla CSS output
**Depends on**: Phase 1
**Requirements**: CVAR-01, CVAR-02, CVAR-03
**Success Criteria** (what must be TRUE):
  1. User can pass `customVariants` option to `convert()` with `@custom-variant` CSS definitions and get correct descendant-selector CSS for those variants
  2. QDS variants (ui-checked, ui-disabled, ui-mixed) resolve to simplified descendant selectors in the output CSS
  3. Calling `convert()` without `customVariants` produces identical output to Phase 1 — the feature is fully opt-in with zero effect on the default path
**Plans**: TBD

### Phase 3: CLI and Package
**Goal**: The library is published and usable via `npx vanillify` and `import { convert } from 'vanillify'`
**Depends on**: Phase 2
**Requirements**: CLI-01, CLI-02, PKG-01, PKG-02, PKG-03
**Success Criteria** (what must be TRUE):
  1. `npx vanillify src/**/*.tsx` processes all matched files and writes converted output to disk
  2. CLI delegates all conversion logic to the programmatic API — no conversion code lives in `src/cli.ts`
  3. `import { convert } from 'vanillify'` works in both ESM and CJS environments with full TypeScript types
  4. Vitest fixture tests (Qwik checkbox example) pass and snapshot output is stable
**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Pipeline | 0/4 | Planning complete | - |
| 2. Custom Variant Resolution | 0/TBD | Not started | - |
| 3. CLI and Package | 0/TBD | Not started | - |
