---
phase: 04-toolchain-foundation
plan: 02
subsystem: infra
tags: [vite-plus, tsdown, vitest, build-tooling, config-consolidation]

requires:
  - phase: 04-toolchain-foundation/01
    provides: pnpm migration and tsdown baseline
provides:
  - Unified vite.config.ts replacing separate tsdown.config.ts and vitest.config.ts
  - vp pack and vp test commands as build/test entry points
  - All test imports using vite-plus/test instead of vitest
affects: [04-toolchain-foundation/03]

tech-stack:
  added: [vite-plus@0.1.15]
  patterns: [unified vite-plus defineConfig for pack+test]

key-files:
  created: [vite.config.ts]
  modified: [package.json, src/pipeline/namer.test.ts, src/pipeline/parser.test.ts, src/pipeline/extractor.test.ts, src/pipeline/rewriter.test.ts, src/pipeline/generator.test.ts, src/variants/parser.test.ts, src/variants/resolver.test.ts, test/integration/convert.test.ts]

key-decisions:
  - "vite-plus clean:true works in pack block -- no prebuild script needed"
  - "tsdown and vitest removed from devDependencies since vite-plus bundles them"

patterns-established:
  - "Unified config: all build+test config lives in vite.config.ts via vite-plus defineConfig"
  - "Test imports: use 'vite-plus/test' not 'vitest' for describe/it/expect/beforeEach"

requirements-completed: [TOOL-02, TOOL-03]

duration: 100s
completed: 2026-04-05
---

# Phase 4 Plan 02: vite-plus Migration Summary

**Unified vite.config.ts with vite-plus defineConfig replacing separate tsdown.config.ts and vitest.config.ts, all 8 test files rewritten to vite-plus/test imports**

## Performance

- **Duration:** 100s
- **Started:** 2026-04-05T14:32:34Z
- **Completed:** 2026-04-05T14:34:14Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created unified vite.config.ts with pack and test blocks matching previous tsdown/vitest configs
- Rewrote all 8 test files from 'vitest' to 'vite-plus/test' imports
- Removed tsdown.config.ts and vitest.config.ts
- Updated package.json scripts to vp pack/test commands
- Removed tsdown and vitest from devDependencies
- Verified vp pack produces identical dist/ output (index.mjs, index.cjs, cli.mjs, cli.cjs + all type declarations)
- All 75 tests pass via vp test, typecheck clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vite-plus, create unified vite.config.ts, rewrite test imports** - `a1b33c7` (chore)
2. **Task 2: Verify vp pack output parity and vp test passes** - verification only, no file changes

## Files Created/Modified
- `vite.config.ts` - Unified vite-plus config with pack and test blocks
- `package.json` - Updated scripts (vp pack/test), removed tsdown/vitest deps, added vite-plus
- `pnpm-lock.yaml` - Updated lockfile
- `tsdown.config.ts` - Deleted
- `vitest.config.ts` - Deleted
- `src/pipeline/namer.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/pipeline/parser.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/pipeline/extractor.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/pipeline/rewriter.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/pipeline/generator.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/variants/parser.test.ts` - Import rewrite vitest -> vite-plus/test
- `src/variants/resolver.test.ts` - Import rewrite vitest -> vite-plus/test
- `test/integration/convert.test.ts` - Import rewrite vitest -> vite-plus/test

## Decisions Made
- vite-plus `clean: true` works in the pack block -- no need for a prebuild rm -rf dist script
- tsdown and vitest fully removed from devDependencies since vite-plus bundles compatible versions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- vite-plus unified config is in place, ready for Plan 03 to add lint and fmt blocks
- vp pack and vp test are verified working

## Self-Check: PASSED

- vite.config.ts exists
- tsdown.config.ts deleted
- vitest.config.ts deleted
- SUMMARY.md exists
- Commit a1b33c7 verified in git log

---
*Phase: 04-toolchain-foundation*
*Completed: 2026-04-05*
