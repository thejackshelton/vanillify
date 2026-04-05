# Deferred Items - Phase 9

## Pre-existing: vite-plus-test runner failures

All 11 existing test files fail with `TypeError: Cannot read properties of undefined (reading 'config')` in the vite-plus-test runner (`@voidzero-dev/vite-plus-test@0.1.15`). This is a pre-existing issue unrelated to Phase 9 changes -- confirmed by running tests before and after changes.

Affected files: all `*.test.ts` files except `src/pipeline/tw-generator.test.ts` (new, passes).
