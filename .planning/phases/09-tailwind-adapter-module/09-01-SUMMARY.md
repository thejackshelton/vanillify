---
phase: 09-tailwind-adapter-module
plan: 01
subsystem: pipeline
tags: [tailwindcss, compile, build, css-generation, caching, virtual-stylesheet]

# Dependency graph
requires:
  - phase: 08-regression-test-baseline
    provides: snapshot tests as safety net for engine changes
provides:
  - Tailwind compile().build() adapter module (twGenerateCSS)
  - Virtual loadStylesheet callback for zero-filesystem CSS resolution
  - Compiler instance caching by CSS input hash
  - CSS layer extraction (theme vs utilities separation)
  - Unmatched class detection from CSS output parsing
affects: [10-pipeline-wiring, 11-cleanup]

# Tech tracking
tech-stack:
  added: [tailwindcss@4.2.2]
  patterns: [virtual-stylesheet-resolution, compile-build-adapter, djb2-cache-key, layer-extraction-regex]

key-files:
  created:
    - src/pipeline/tw-generator.ts
    - src/pipeline/tw-generator.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Tailwind build() is cumulative on cached compilers -- adapter returns early for empty token sets and scopes matched/unmatched to current candidates only"
  - "Virtual loadStylesheet reads tailwindcss/index.css once at module load via createRequire -- no filesystem I/O during compile()"
  - "Exported _cache Map for test inspection of caching behavior"

patterns-established:
  - "Virtual stylesheet: pre-read CSS at module load, serve from memory in loadStylesheet callback"
  - "Compiler caching: djb2 hash of CSS input string as cache key, Map<string, TwCompiler>"
  - "Layer extraction: regex-based split of @layer theme and @layer utilities from build() output"
  - "Unmatched detection: parse CSS selectors from utility output, compare against input candidates"

requirements-completed: [ENG-01, ENG-02, ENG-03, ENG-04, ENG-05]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 9 Plan 1: Tailwind Adapter Module Summary

**Tailwind compile().build() adapter with virtual loadStylesheet, djb2-keyed compiler caching, and regex-based CSS layer separation -- 12 unit tests covering all 5 ENG requirements**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-05T17:48:13Z
- **Completed:** 2026-04-05T17:51:48Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created tw-generator.ts adapter wrapping Tailwind's compile().build() API with zero-filesystem virtual stylesheet resolution
- Implemented compiler instance caching keyed by djb2 hash of CSS input (theme + custom variants)
- Built CSS layer extraction separating @layer theme (`:root` variables) from @layer utilities (rules)
- Added unmatched class detection by parsing CSS output selectors and comparing against input candidates
- 12 unit tests pass covering all ENG-01 through ENG-05 requirements plus edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1+2: Install tailwindcss, create adapter, write tests** - `3b8ac3c` (feat)

**Plan metadata:** (pending)

_Note: Tasks 1 and 2 committed together as TDD unit (adapter + tests are one deliverable)_

## Files Created/Modified
- `src/pipeline/tw-generator.ts` - Tailwind compile().build() adapter with virtual loadStylesheet, caching, layer extraction, unmatched detection
- `src/pipeline/tw-generator.test.ts` - 12 unit tests for ENG-01 through ENG-05 plus edge cases
- `package.json` - Added tailwindcss@~4.2.2 dependency
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made
- **Cumulative build() handling:** Tailwind's build() accumulates candidates across calls on a cached compiler. The adapter handles this by (1) returning early for empty token sets, (2) scoping matched/unmatched detection to current candidates only via CSS output parsing. Tests reset the cache between groups that need isolation.
- **Module-level readFileSync:** Acceptable because vanillify is a build-time tool and tailwindcss is a guaranteed dependency. The read happens once at import, not during conversion.
- **Exported _cache for testing:** The internal cache Map is exported with underscore prefix to allow test inspection of caching behavior (cache size assertions).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Tailwind build() cumulative behavior**
- **Found during:** Task 2 (unit tests)
- **Issue:** build() accumulates candidates across calls on the same compiler instance, causing empty-set calls to return previous output and selector count assertions to fail
- **Fix:** Added early return for empty token sets in twGenerateCSS(), added beforeEach(resetTwGenerator) to test groups needing isolation
- **Files modified:** src/pipeline/tw-generator.ts, src/pipeline/tw-generator.test.ts
- **Verification:** All 12 tests pass
- **Committed in:** 3b8ac3c

**2. [Rule 3 - Blocking] isolatedDeclarations type annotation**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `export const _cache = new Map<string, Awaited<ReturnType<typeof compile>>>()` fails with --isolatedDeclarations requiring explicit type annotation
- **Fix:** Added `type TwCompiler = Awaited<ReturnType<typeof compile>>` alias and annotated `_cache: Map<string, TwCompiler>`
- **Files modified:** src/pipeline/tw-generator.ts
- **Verification:** `tsc --noEmit --project tsconfig.json` passes clean
- **Committed in:** 3b8ac3c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing test runner failures: All 11 existing test files fail with `TypeError: Cannot read properties of undefined (reading 'config')` in vite-plus-test@0.1.15. This is unrelated to Phase 9 changes (confirmed by testing before/after). Logged to deferred-items.md.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- tw-generator.ts is tested in isolation, ready for Phase 10 pipeline wiring
- The adapter's TwGenerateCSSResult interface matches GenerateCSSResult shape for drop-in replacement
- Cumulative build() behavior documented -- Phase 10 pipeline should pass all node candidates in a single call per file
- Pre-existing test runner issue needs investigation before Phase 10 regression verification

---
*Phase: 09-tailwind-adapter-module*
*Completed: 2026-04-05*
