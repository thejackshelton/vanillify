---
phase: 10-pipeline-wiring-and-rewriter-adaptation
plan: 01
subsystem: pipeline
tags: [tailwind, rewriter, css-nesting, compile-api, convert]

# Dependency graph
requires:
  - phase: 09-tailwind-adapter-module
    provides: twGenerateCSS() function with compile().build() integration
provides:
  - Tailwind-adapted rewriter with top-level selector replacement for nested CSS
  - Simplified convert() pipeline bypassing UnoCSS translation layers
  - Record-to-CSS converter for backward-compatible customVariants input
affects: [10-02-test-updates, 11-cleanup-and-api-verification]

# Tech tracking
tech-stack:
  added: []
  patterns: [top-level-selector-replacement, brace-depth-block-splitting, plain-declaration-merging]

key-files:
  created: []
  modified:
    - src/pipeline/rewriter.ts
    - src/index.ts

key-decisions:
  - "Direct engine swap (not abstraction layer) -- UnoCSS generator replaced by twGenerateCSS import, no interface indirection since Phase 11 deletes UnoCSS entirely"
  - "Preserve Tailwind nested CSS output as-is -- no flattening of &:hover, @media nesting; modern browsers support CSS nesting natively"
  - "Keep parseThemeCss/mapToThemeConfig re-exports in index.ts for backward compatibility -- Phase 11 CLN-01/CLN-02 handles deletion"

patterns-established:
  - "Top-level selector replacement: split CSS by brace depth, replace first selector, preserve inner content unchanged"
  - "Plain declaration merging: non-nested blocks merged into single .nodeN {}, nested blocks kept separate"

requirements-completed: [RWR-01, RWR-02, RWR-03, REG-02]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 10 Plan 01: Pipeline Wiring and Rewriter Adaptation Summary

**Tailwind engine wired into convert() pipeline with nested-CSS-aware rewriter using top-level selector replacement and plain declaration merging**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T19:29:28Z
- **Completed:** 2026-04-05T19:31:24Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Rewrote rewriter.ts from 448 lines of UnoCSS-specific logic to 240 lines of Tailwind-adapted code using top-level selector replacement
- Simplified convert() by removing resolveCustomVariants, parseThemeCss, and mapToThemeConfig usage -- raw CSS strings pass through directly to Tailwind
- Added variantsRecordToCss() helper preserving backward compatibility for Record<string,string> custom variant input

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite buildNodeCSS for Tailwind's nested CSS format** - `ac7804e` (feat)
2. **Task 2: Simplify convert() to bypass theme/variant translation layers** - `f5de95e` (feat)

## Files Created/Modified
- `src/pipeline/rewriter.ts` - Complete rewrite: twGenerateCSS integration, splitTopLevelBlocks/replaceTopLevelSelector/hasNestedContent for Tailwind nested CSS, plain declaration merging, leading indent stripping
- `src/index.ts` - Removed UnoCSS translation layer calls, added variantsRecordToCss(), passes raw CSS strings to rewrite()

## Decisions Made
- Direct engine swap rather than abstraction layer -- Phase 11 deletes UnoCSS so no need for dual-engine interface
- Preserve Tailwind's nested CSS output (CSS nesting, @media inside rules) rather than flattening -- this is the correct Tailwind v4 format
- Keep re-exports of parseThemeCss/mapToThemeConfig to avoid breaking external imports before Phase 11 cleanup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test files (rewriter.test.ts) have type errors due to old UnoCSS-style arguments (VariantObject[], themeConfig object) -- this is expected and handled by Plan 10-02

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Pipeline wiring complete -- convert() now runs through Tailwind engine
- Plan 10-02 needed to update all test files and regression snapshots for Tailwind's CSS output format
- Existing tests WILL fail until 10-02 updates assertions (expected behavior change from engine swap)

---
*Phase: 10-pipeline-wiring-and-rewriter-adaptation*
*Completed: 2026-04-05*
