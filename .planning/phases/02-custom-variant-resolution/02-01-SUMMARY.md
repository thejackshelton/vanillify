---
phase: 02-custom-variant-resolution
plan: 01
subsystem: variants
tags: [unocss, custom-variant, variant-object, css-parsing, tailwind-v4]

# Dependency graph
requires:
  - phase: 01-core-pipeline
    provides: UnoCSS createGenerator pattern, preset-wind4 integration
provides:
  - parseCustomVariantCSS function for @custom-variant CSS directive parsing
  - resolveCustomVariants function producing UnoCSS VariantObject[] from CSS string or Record input
  - createVariantObject function for individual variant-to-VariantObject translation
  - ParsedVariant and CustomVariantsOption types
affects: [02-custom-variant-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns: [TDD red-green for parser/resolver modules, VariantObject match/selector pattern for UnoCSS variant registration]

key-files:
  created:
    - src/variants/types.ts
    - src/variants/parser.ts
    - src/variants/parser.test.ts
    - src/variants/resolver.ts
    - src/variants/resolver.test.ts
  modified: []

key-decisions:
  - "Regex-based parser sufficient for @custom-variant shorthand syntax -- no need for full CSS parser"
  - "Input size limit of 10000 chars for DoS protection on regex execution"
  - "Variant name validation restricted to [\\w-]+ to prevent CSS injection"

patterns-established:
  - "VariantObject creation: prefix-stripping match + &-replacement selector function"
  - "Dual input format: CSS string parsed automatically, Record used directly"

requirements-completed: [CVAR-01]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 2 Plan 01: Custom Variant Parser and Resolver Summary

**@custom-variant CSS parser and UnoCSS VariantObject resolver supporting both self-referencing (&[attr]) and ancestor-descendant ([attr] &) selector patterns**

## Performance

- **Duration:** 2 min 27s
- **Started:** 2026-04-05T04:27:10Z
- **Completed:** 2026-04-05T04:29:37Z
- **Tasks:** 2
- **Files created:** 5

## Accomplishments
- parseCustomVariantCSS correctly extracts variant name and selector template from @custom-variant shorthand CSS directives
- resolveCustomVariants accepts both string (CSS) and Record<string, string> input formats, producing UnoCSS VariantObject[]
- createVariantObject produces VariantObject with correct match function (prefix stripping) and selector transformation (& replacement)
- Input validation: 10000-char limit for DoS protection, [\w-]+ variant name validation for CSS injection prevention
- 19 tests pass across parser and resolver modules

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Types and @custom-variant CSS parser**
   - `b748b9f` (test: failing parser tests - RED)
   - `23402da` (feat: implement parser - GREEN)
2. **Task 2: Variant resolver -- translates to UnoCSS VariantObject[]**
   - `61568d6` (test: failing resolver tests - RED)
   - `67186c3` (feat: implement resolver - GREEN)

## Files Created/Modified
- `src/variants/types.ts` - ParsedVariant interface and CustomVariantsOption type
- `src/variants/parser.ts` - @custom-variant CSS shorthand parser with input validation
- `src/variants/parser.test.ts` - 8 tests covering parsing, edge cases, DoS protection
- `src/variants/resolver.ts` - VariantObject creation and dual-format resolution
- `src/variants/resolver.test.ts` - 11 tests covering match/selector behavior and both input formats

## Decisions Made
- Regex-based parser is sufficient for the well-defined @custom-variant shorthand syntax -- no full CSS parser needed
- 10000-character input limit prevents regex DoS (threat T-02-01)
- Variant names restricted to [\w-]+ pattern to prevent CSS special character injection (threat T-02-02)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Parser and resolver modules ready for integration into generator (Plan 02-02)
- Plan 02-02 will extend getGenerator() to accept custom variants and wire through convert() API
- All exported functions match the interfaces specified in Plan 02-02's dependencies

---
*Phase: 02-custom-variant-resolution*
*Completed: 2026-04-05*
