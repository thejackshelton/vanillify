---
phase: 08-regression-test-baseline
plan: 01
subsystem: testing
tags: [vitest, snapshot, regression, toMatchFileSnapshot]

# Dependency graph
requires:
  - phase: 07-css-modules-output
    provides: CSS Modules output format and all prior conversion paths
provides:
  - Comprehensive regression snapshot baseline for all convert() code paths
  - 30 fixture files capturing exact CSS, component, theme, classMap, and warning output
affects: [09-tailwind-adapter-module, 10-pipeline-wiring, 11-cleanup-api-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [toMatchFileSnapshot regression baseline, JSON warning serialization]

key-files:
  created:
    - test/regression/baseline.test.ts
    - fixtures/regression/standard-utilities.css
    - fixtures/regression/checkbox-full.css
    - fixtures/regression/unmatched-warnings.json
    - fixtures/regression/dynamic-class-warnings.json
    - fixtures/regression/css-modules.css
    - fixtures/regression/css-modules.classMap.json
    - fixtures/regression/theme-input.themeCss
  modified: []

key-decisions:
  - "Single test file with 14 describe blocks covering all 13 research scenarios plus no-classes edge case"
  - "JSON.stringify for warning snapshots -- deterministic and diffable"
  - "Separate fixtures/regression/ directory for engine-migration isolation from existing fixtures/"

patterns-established:
  - "Regression snapshot pattern: toMatchFileSnapshot to fixtures/regression/ for full-output capture"
  - "Warning serialization: JSON.stringify(result.warnings, null, 2) for diffable snapshot comparison"

requirements-completed: [REG-01]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 8 Plan 01: Regression Test Baseline Summary

**14-scenario regression snapshot suite capturing exact convert() output for standard utilities, all variant types, arbitrary values, custom variants, theme input, CSS modules, warnings, and edge cases**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T17:29:35Z
- **Completed:** 2026-04-05T17:33:35Z
- **Tasks:** 2
- **Files modified:** 33

## Accomplishments
- Created comprehensive regression snapshot test file with 14 test scenarios and 15 test cases
- Generated 30 fixture files capturing exact CSS, component, themeCss, classMap, and warning output
- Verified deterministic baseline across consecutive test runs (zero flakiness)
- Full test suite (138 tests) passes with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Create regression snapshots and verify stability** - `46e4b86` (test)

**Plan metadata:** [pending] (docs: complete plan)

## Files Created/Modified
- `test/regression/baseline.test.ts` - 14 describe blocks covering all conversion paths with toMatchFileSnapshot
- `fixtures/regression/standard-utilities.css` - Baseline CSS for flex, items-center, gap, p, text, font
- `fixtures/regression/pseudo-variants.css` - Baseline CSS for hover, focus, active, disabled variants
- `fixtures/regression/responsive-variants.css` - Baseline CSS for sm, md, lg, xl media queries
- `fixtures/regression/stacked-variants.css` - Baseline CSS for dark:hover: compound variants
- `fixtures/regression/arbitrary-values.css` - Baseline CSS for text-[#ff0000], w-[200px], etc.
- `fixtures/regression/custom-variant-single.css` - Baseline CSS for single ui-checked custom variant
- `fixtures/regression/custom-variants-qds.css` - Baseline CSS for QDS pattern (ui-checked, ui-disabled, ui-mixed)
- `fixtures/regression/custom-variant-stacked-hover.css` - Baseline CSS for ui-checked:hover: stacking
- `fixtures/regression/theme-input.css` - Baseline CSS for bg-brand with @theme color
- `fixtures/regression/theme-input.themeCss` - Baseline :root theme CSS variables
- `fixtures/regression/css-modules.css` - Baseline CSS for CSS Modules output format
- `fixtures/regression/css-modules.classMap.json` - Baseline classMap JSON for CSS Modules
- `fixtures/regression/checkbox-full.css` - Baseline CSS for full Qwik checkbox fixture
- `fixtures/regression/unmatched-warnings.json` - Serialized unmatched-class warning objects
- `fixtures/regression/dynamic-class-warnings.json` - Serialized dynamic-class warning objects
- `fixtures/regression/no-classes.css` - Empty file (edge case: no classes in source)
- `fixtures/regression/*.component.tsx` - Corresponding rewritten component snapshots for each scenario

## Decisions Made
- Combined Tasks 1 and 2 into a single commit since Task 2 is purely verification of Task 1 output
- Used hardcoded inline source strings for all scenarios (not file-based fixtures) except the checkbox scenario which reads from the existing fixtures/checkbox.tsx
- JSON serialization for warnings provides exact-match diffing including location data

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Regression baseline is complete and stable -- ready for Phase 9 (Tailwind Adapter Module)
- Any engine change that alters CSS output, component rewriting, theme CSS, or warning behavior will fail a snapshot test
- To update snapshots after verified engine swap: `npx vp test test/regression/baseline.test.ts -- --update`

## Self-Check: PASSED

All 6 key artifacts verified present. Commit 46e4b86 verified in git log.

---
*Phase: 08-regression-test-baseline*
*Completed: 2026-04-05*
