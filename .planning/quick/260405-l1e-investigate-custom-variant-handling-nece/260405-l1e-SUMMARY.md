# Quick Task 260405-l1e: Remove customVariants option, unify CSS input

**Date:** 2026-04-05
**Status:** Complete

## What Changed

Simplified the public API by removing `customVariants` as a separate config option and renaming `themeCss` to `css`. Both were just CSS strings passed to Tailwind's `compile()` — having them separate was a leftover from the UnoCSS era.

### API Before
```typescript
convert(source, file, {
  customVariants: '@custom-variant ui-checked (&[ui-checked]);',
  themeCss: '@theme { --color-brand: #ff0000; }',
})
```

### API After
```typescript
convert(source, file, {
  css: `
    @theme { --color-brand: #ff0000; }
    @custom-variant ui-checked (&[ui-checked]);
  `,
})
```

## Files Changed

### Production Code
- **src/types.ts** — Removed `CustomVariantsOption` type, replaced `customVariants`/`themeCss` with unified `css` option, removed dead warning types (`unknown-theme-namespace`, `unsupported-theme-reset`)
- **src/index.ts** — Removed `variantsRecordToCss()`, removed old UnoCSS imports, simplified to pass `options?.css` through to rewrite
- **src/pipeline/generator.ts** — Merged `customVariantsCss`/`themeCss` params into single `css` param
- **src/pipeline/rewriter.ts** — Merged `customVariantsCss`/`themeCss` params into single `css` param
- **src/cli.ts** — Replaced `--customVariants`/`--theme` flags with single `--css`/`-c` flag

### Tests
- **src/pipeline/generator.test.ts** — Updated `twGenerateCSS()` calls for single css param
- **src/pipeline/api-compat.test.ts** — Replaced `customVariants`/`themeCss` tests with `css` option tests
- **src/pipeline/rewriter.test.ts** — Removed UnoCSS imports, updated helper and all tests for new API
- **test/integration/convert.test.ts** — Updated all convert() calls to use `css` option
- **test/regression/baseline.test.ts** — Updated all fixture tests to use `css` option

## Test Results

104 tests passing across 8 test files.
