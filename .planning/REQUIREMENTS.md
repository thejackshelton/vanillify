# Requirements: Vanillify

**Defined:** 2026-04-05
**Core Value:** Accurate, reliable conversion of Tailwind classes to vanilla CSS — powered by Tailwind's native compile().build() API

## v1.0 Requirements (Shipped)

All v1.0 requirements completed. See MILESTONES.md for details.

- ✓ **CORE-01** through **CORE-08**: Core pipeline (convert API, AST extraction, CSS generation, indexed naming, rewriting, dynamic class warnings, arbitrary values)
- ✓ **VARI-01** through **VARI-03**: Variant resolution (pseudo-class, responsive, stacked)
- ✓ **CVAR-01** through **CVAR-03**: Custom variant resolution (@custom-variant opt-in)
- ✓ **CLI-01**, **CLI-02**: CLI wrapper
- ✓ **PKG-01** through **PKG-03**: Build and package (dual ESM+CJS, typed exports, fixture tests)

## v1.1 Requirements (Shipped)

- ✓ **TOOL-01** through **TOOL-05**: Toolchain (pnpm, vite-plus, lint, fmt)
- ✓ **QUAL-01**, **QUAL-02**: Code quality (magic-regexp, dynamic regex docs)
- ✓ **THEME-01** through **THEME-10**: Theme support (@theme blocks, namespace mapping, CLI --theme flag)
- ✓ **MOD-01** through **MOD-08**: CSS Modules output (--format css-modules, styles.nodeN, .module.css)

## v2.0 Requirements

Requirements for the Tailwind compile() engine migration.

### Engine

- [x] **ENG-01**: `convert()` produces CSS using Tailwind v4's `compile().build()` API instead of UnoCSS's `createGenerator().generate()`
- [x] **ENG-02**: Tailwind compiler resolves `@import "tailwindcss"` via a `loadStylesheet` callback without filesystem dependency
- [x] **ENG-03**: `source(none)` directive disables Tailwind's automatic file scanning — candidates come from oxc-parser only
- [x] **ENG-04**: Compiler instances are cached by CSS input hash to avoid redundant `compile()` calls
- [x] **ENG-05**: CSS output separates utility CSS from theme variable CSS (`:root` block), preserving the `themeCss` field in `ConvertResult`

### Regression

- [x] **REG-01**: Snapshot tests capture current `convert()` output for all existing fixtures before any engine changes
- [x] **REG-02**: Unmatched Tailwind classes produce `unmatched-class` warnings via CSS output inspection (replacing UnoCSS's `matched` set)
- [x] **REG-03**: All existing tests pass after engine swap with updated assertions for Tailwind's CSS output format

### Rewriter

- [x] **RWR-01**: Selector rewriting works correctly with Tailwind's native CSS output (nesting, media query range syntax, escaping)
- [x] **RWR-02**: Per-node CSS isolation produces correct output — each node's CSS contains only rules for that node's classes
- [x] **RWR-03**: `@layer` wrappers in Tailwind output are handled correctly (stripped or preserved as appropriate)

### Cleanup

- [ ] **CLN-01**: `src/theme/` directory (parser.ts, mapper.ts, types.ts) is deleted — Tailwind handles `@theme` natively
- [ ] **CLN-02**: `src/variants/` directory (parser.ts, resolver.ts, types.ts) is deleted — Tailwind handles `@custom-variant` natively
- [ ] **CLN-03**: `@unocss/core` and `@unocss/preset-wind4` are removed from dependencies; `tailwindcss@~4.2.2` is added
- [ ] **CLN-04**: All Tailwind imports are isolated to a single adapter file (`pipeline/generator.ts`)

### API Compatibility

- [ ] **API-01**: `ConvertOptions` and `ConvertResult` types preserve their existing shape — engine swap is internal
- [ ] **API-02**: `customVariants` accepts CSS string input and produces correct output via native Tailwind processing
- [ ] **API-03**: `themeCss` accepts CSS string input (bare declarations or `@theme {}` blocks) and produces correct output
- [ ] **API-04**: Calling `convert()` without options produces identical behavior to v1.x (fully backward compatible default path)

## Future Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Optimization

- **OPT-01**: Single-pass `build()` with post-hoc CSS rule splitting for large files (>50 nodes)
- **OPT-02**: Source map support via Tailwind's `buildSourceMap()`

### Extensibility

- **EXT-01**: JS plugin support via `loadModule` callback
- **EXT-02**: Preflight/reset inclusion option

### Enhancements

- **ENH-01**: Semantic class naming via pluggable nameGenerator callback
- **ENH-02**: Local AI model integration for semantic class naming
- **ENH-03**: HTML file support (non-JSX inputs)
- **ENH-04**: Watch mode for development workflows

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Source maps | Defer to v2.1 — not needed for core conversion |
| JS plugin support via `loadModule` | No current use case |
| Preflight/reset inclusion | Vanillify outputs utilities only |
| Semantic class naming | Future — local AI model integration (ENH-01, ENH-02) |
| `customVariants` as `Record<string, string>` | Dropped — CSS string is the only input format with native Tailwind |
| Runtime/JIT conversion | Fundamentally different product — vanillify is static/build-time |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENG-01 | Phase 9 | Complete |
| ENG-02 | Phase 9 | Complete |
| ENG-03 | Phase 9 | Complete |
| ENG-04 | Phase 9 | Complete |
| ENG-05 | Phase 9 | Complete |
| REG-01 | Phase 8 | Complete |
| REG-02 | Phase 10 | Complete |
| REG-03 | Phase 10 | Complete |
| RWR-01 | Phase 10 | Complete |
| RWR-02 | Phase 10 | Complete |
| RWR-03 | Phase 10 | Complete |
| CLN-01 | Phase 11 | Pending |
| CLN-02 | Phase 11 | Pending |
| CLN-03 | Phase 11 | Pending |
| CLN-04 | Phase 11 | Pending |
| API-01 | Phase 11 | Pending |
| API-02 | Phase 11 | Pending |
| API-03 | Phase 11 | Pending |
| API-04 | Phase 11 | Pending |

**Coverage:**
- v2.0 requirements: 19 total
- Mapped to phases: 19
- Unmapped: 0

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after v2.0 roadmap creation*
