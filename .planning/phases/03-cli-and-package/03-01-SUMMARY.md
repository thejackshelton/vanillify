---
phase: 03-cli-and-package
plan: 01
subsystem: cli
tags: [citty, consola, tinyglobby, tsdown, cli]

# Dependency graph
requires:
  - phase: 01-core-pipeline
    provides: convert() programmatic API
  - phase: 02-custom-variant-resolution
    provides: customVariants option support
provides:
  - CLI executable wrapping convert() via citty/consola
  - Dual ESM+CJS library build with type declarations
  - npm-ready package.json with exports, bin, files fields
affects: [03-cli-and-package]

# Tech tracking
tech-stack:
  added: [citty, consola, tinyglobby, pathe]
  patterns: [cli-as-thin-wrapper, tsdown-dual-entry]

key-files:
  created: [src/cli.ts, dist/cli.mjs, dist/index.mjs, dist/index.cjs]
  modified: [package.json, tsdown.config.ts]

key-decisions:
  - "Updated package.json export paths from .js/.d.ts to .mjs/.d.mts to match tsdown output with type:module"
  - "CLI uses tinyglobby for glob expansion instead of relying on shell expansion"

patterns-established:
  - "CLI thin wrapper: src/cli.ts imports only convert() from src/index.ts, handles file I/O and arg parsing"
  - "tsdown dual entry: entry array with both index.ts and cli.ts produces library + executable"

requirements-completed: [CLI-01, CLI-02, PKG-01, PKG-02]

# Metrics
duration: 2min
completed: 2026-04-05
---

# Phase 3 Plan 1: CLI and Package Build Summary

**Thin CLI wrapper with citty/consola/tinyglobby around convert() API, dual ESM+CJS build via tsdown**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-05T05:11:03Z
- **Completed:** 2026-04-05T05:13:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- CLI entry point (src/cli.ts) wrapping convert() with zero conversion logic
- Dual ESM+CJS library build with type declarations via tsdown
- End-to-end verified: CLI processes .tsx files to .vanilla.css and .vanilla.tsx output
- npm-ready package.json with correct exports, bin, and files fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CLI dependencies and update tsdown config** - `3fb2211` (chore)
2. **Task 2: Create CLI entry point and verify full build** - `c4f7ac6` (feat)

## Files Created/Modified
- `src/cli.ts` - CLI entry point: arg parsing, glob expansion, file I/O, delegates to convert()
- `package.json` - Added citty/consola/tinyglobby/pathe deps, files field, updated export paths
- `tsdown.config.ts` - Added src/cli.ts to entry array for dual-entry build

## Decisions Made
- Updated package.json export paths from `.js`/`.d.ts` to `.mjs`/`.d.mts` to match tsdown's actual output when `"type": "module"` is set. tsdown produces `.mjs`/`.cjs` extensions in ESM-type packages rather than `.js`/`.cjs`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed package.json export paths to match tsdown output**
- **Found during:** Task 2 (build verification)
- **Issue:** tsdown produces `.mjs`/`.d.mts` extensions (not `.js`/`.d.ts`) when `"type": "module"` is set in package.json. The existing exports/bin/module/types fields referenced non-existent `.js` files.
- **Fix:** Updated module, types, exports, and bin fields to use `.mjs`/`.d.mts` extensions matching actual build output
- **Files modified:** package.json
- **Verification:** Build succeeds, all dist artifacts present, CLI runs end-to-end
- **Committed in:** c4f7ac6 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary fix for build output to match package.json references. No scope creep.

## Issues Encountered
None beyond the export path deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- CLI executable works via `node dist/cli.mjs <glob>`
- Build produces dual ESM+CJS library with type declarations
- Ready for fixture-based snapshot testing (Plan 03-02)

## Self-Check: PASSED

All created files verified present. All commit hashes verified in git log.

---
*Phase: 03-cli-and-package*
*Completed: 2026-04-05*
