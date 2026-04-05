---
phase: 02-custom-variant-resolution
plan: 02
subsystem: pipeline
tags: [unocss, custom-variant, generator-cache, pipeline-integration, tailwind-v4]

# Dependency graph
requires:
  - phase: 01-core-pipeline
    provides: convert() API, generator singleton, rewriter with selector replacement
  - phase: 02-custom-variant-resolution
    plan: 01
    provides: parseCustomVariantCSS, resolveCustomVariants, createVariantObject
provides:
  - customVariants option on convert() accepting CSS string or Record<string, string>
  - Generator cache keyed by sorted variant names (replaces singleton)
  - End-to-end custom variant resolution through convert() pipeline
  - Attribute selector suffix handling in rewriter (e.g., [ui-checked])
affects: [03-cli-packaging]

# Tech tracking
tech-stack:
  added: []
  patterns: [Generator cache by variant config identity, attribute selector suffix extraction in rewriter]

key-files:
  created: []
  modified:
    - src/types.ts
    - src/pipeline/generator.ts
    - src/pipeline/rewriter.ts
    - src/index.ts
    - src/pipeline/generator.test.ts
    - src/pipeline/rewriter.test.ts
    - test/integration/convert.test.ts

key-decisions:
  - "Generator cache keyed by sorted variant names replaces singleton pattern -- prevents unbounded growth while supporting multiple variant configs"
  - "extractPseudo extended to handle attribute selector suffixes ([attr]) in addition to pseudo-classes (:hover) -- needed for custom variant CSS selectors"

patterns-established:
  - "Generator caching: Map keyed by sorted variant names, __default__ for no-variant case"
  - "Custom variant threading: convert() -> resolveCustomVariants() -> rewrite() -> generateCSS() -> getGenerator()"

requirements-completed: [CVAR-01, CVAR-02, CVAR-03]

# Metrics
duration: 3min
completed: 2026-04-05
---

# Phase 2 Plan 02: Pipeline Integration for Custom Variant Resolution Summary

**Custom variant option wired end-to-end through convert() API with generator caching and 7 integration tests proving CVAR-01/02/03**

## Performance

- **Duration:** 3 min 15s
- **Started:** 2026-04-05T04:31:24Z
- **Completed:** 2026-04-05T04:34:39Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- convert() now accepts customVariants option in both CSS string and Record<string, string> formats
- Generator singleton replaced with cache keyed by sorted variant names, supporting multiple variant configs without recreation
- Rewriter's extractPseudo extended to handle attribute selector suffixes ([ui-checked]) produced by custom variant CSS
- 7 new integration tests prove all three CVAR requirements; 73 total tests pass with zero regressions

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Extend generator and rewriter to accept custom variants**
   - `717eb03` (test: failing tests for custom variant support - RED)
   - `d238844` (feat: wire custom variant support through pipeline - GREEN)
2. **Task 2: Integration tests proving CVAR-01, CVAR-02, CVAR-03**
   - `cba444b` (test: integration tests for all CVAR requirements)

## Files Created/Modified
- `src/types.ts` - Added customVariants field to ConvertOptions with JSDoc examples
- `src/pipeline/generator.ts` - Replaced singleton with Map cache, added customVariants parameter to getGenerator/generateCSS
- `src/pipeline/rewriter.ts` - Added customVariants parameter, extended extractPseudo for attribute selectors
- `src/index.ts` - Wired resolveCustomVariants() into convert() pipeline
- `src/pipeline/generator.test.ts` - 3 new tests: custom variant CSS generation, default no-match, caching
- `src/pipeline/rewriter.test.ts` - 1 new test: custom variants threaded through rewrite
- `test/integration/convert.test.ts` - 7 new tests: CVAR-01 (CSS string + Record), CVAR-02 (ancestor, multiple, stacked), CVAR-03 (regression)

## Decisions Made
- Generator cache keyed by sorted variant names replaces singleton -- prevents unbounded growth while supporting multiple variant configs (threat T-02-04)
- extractPseudo extended to handle attribute selector suffixes -- custom variant CSS uses [attr] selectors that were previously treated as plain rules and lost during declaration merging

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended extractPseudo to handle attribute selector suffixes**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** UnoCSS generates selectors like `.ui-checked\:bg-green-500[ui-checked]` for custom variants. The existing extractPseudo only detected pseudo-class suffixes (`:hover`) but not attribute selector suffixes (`[ui-checked]`), causing the `[ui-checked]` part to be stripped during declaration merging.
- **Fix:** Extended the character scan in extractPseudo to also detect unescaped `[` as a suffix start, preserving attribute selectors in the output.
- **Files modified:** src/pipeline/rewriter.ts
- **Verification:** All rewriter and integration tests pass with correct `[ui-checked]` in CSS output.
- **Committed in:** d238844 (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness -- without this fix, custom variant attribute selectors would be silently dropped from output CSS.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 2 complete: custom variant resolution fully wired into convert() API
- Phase 3 (CLI + Packaging) can proceed -- all programmatic API features are implemented
- All 73 tests pass with zero regressions

---
## Self-Check: PASSED

All 7 modified files verified present. All 3 task commits verified in git log.

---
*Phase: 02-custom-variant-resolution*
*Completed: 2026-04-05*
