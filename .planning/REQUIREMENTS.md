# Requirements: Vanillify

**Defined:** 2026-04-05
**Core Value:** Accurate, reliable conversion of Tailwind classes to vanilla CSS via UnoCSS's createGenerator

## v1.0 Requirements (Shipped)

All v1.0 requirements completed. See MILESTONES.md for details.

- ✓ **CORE-01** through **CORE-08**: Core pipeline (convert API, AST extraction, CSS generation, indexed naming, rewriting, dynamic class warnings, arbitrary values)
- ✓ **VARI-01** through **VARI-03**: Variant resolution (pseudo-class, responsive, stacked)
- ✓ **CVAR-01** through **CVAR-03**: Custom variant resolution (@custom-variant opt-in)
- ✓ **CLI-01**, **CLI-02**: CLI wrapper
- ✓ **PKG-01** through **PKG-03**: Build and package (dual ESM+CJS, typed exports, fixture tests)

## v1.1 Requirements

Requirements for Toolchain & Theme Support milestone.

### Toolchain

- [ ] **TOOL-01**: Project uses pnpm as package manager with pnpm-lock.yaml and `packageManager` field in package.json
- [ ] **TOOL-02**: Single vite.config.ts with `defineConfig` from vite-plus replaces tsdown.config.ts and vitest.config.ts (pack + test blocks)
- [ ] **TOOL-03**: Package scripts use `vp pack` and `vp test` instead of direct tsdown/vitest commands
- [ ] **TOOL-04**: vite-plus lint block configured with project lint rules (replaces standalone eslint setup)
- [ ] **TOOL-05**: vite-plus fmt block configured with project formatting rules

### Code Quality

- [ ] **QUAL-01**: All static regex patterns replaced with magic-regexp (variant parser, generator layer regex, CLI extension matching)
- [ ] **QUAL-02**: Dynamic regex patterns in rewriter.ts documented as intentionally raw (runtime construction incompatible with magic-regexp)

### Theme Support

- [ ] **THEME-01**: `convert()` accepts optional `themeCss: string` containing `@theme { ... }` CSS block
- [ ] **THEME-02**: Parser extracts CSS variable declarations from `@theme` blocks, handling comments, duplicates (last wins), and malformed declarations (warn + skip)
- [ ] **THEME-03**: Namespace mapper translates `--namespace-name: value` to UnoCSS theme config keys with a tested conformance matrix for preset-wind4@66.6.7
- [ ] **THEME-04**: Theme config extends preset-wind4 defaults (not replaces) — user's `--color-brand` adds to existing colors, doesn't remove red/blue/etc.
- [ ] **THEME-05**: Generator cache key includes theme identity so different theme configs produce different generators
- [ ] **THEME-06**: ConvertResult includes theme CSS (`:root` variable definitions) alongside utility CSS
- [ ] **THEME-07**: Unknown namespaces are warned but passed through as custom theme keys (not silently dropped)
- [ ] **THEME-08**: CLI accepts `--theme <file>` flag, reads CSS file, passes contents to library as `themeCss`
- [ ] **THEME-09**: Per-namespace conformance table documented with status: direct preset mapping, vanillify-added, or unsupported
- [ ] **THEME-10**: Calling `convert()` without `themeCss` produces identical output to v1.0 — fully opt-in

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Enhancements

- **ENH-01**: Semantic class naming via pluggable nameGenerator callback
- **ENH-02**: Local AI model integration for semantic class naming
- **ENH-03**: HTML file support (non-JSX inputs)
- **ENH-04**: Watch mode for development workflows
- **ENH-05**: CSS Modules output format option

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `@theme { --*: initial }` (theme reset) | Requires full default theme knowledge to reconstruct |
| `@theme inline { ... }` | No UnoCSS equivalent concept |
| `@keyframes` inside `@theme` | UnoCSS handles animations via different mechanism |
| Auto-discovery of `@theme` from project CSS | Breaks stateless API design; CLI handles file reading |
| `var()` references inside `@theme` values | Requires resolution context not available statically |
| Runtime/JIT conversion | Fundamentally different product — vanillify is static/build-time |
| Semantic class naming | Deferred to v2 (ENH-01, ENH-02) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | — | Pending |
| TOOL-02 | — | Pending |
| TOOL-03 | — | Pending |
| TOOL-04 | — | Pending |
| TOOL-05 | — | Pending |
| QUAL-01 | — | Pending |
| QUAL-02 | — | Pending |
| THEME-01 | — | Pending |
| THEME-02 | — | Pending |
| THEME-03 | — | Pending |
| THEME-04 | — | Pending |
| THEME-05 | — | Pending |
| THEME-06 | — | Pending |
| THEME-07 | — | Pending |
| THEME-08 | — | Pending |
| THEME-09 | — | Pending |
| THEME-10 | — | Pending |

**Coverage:**
- v1.1 requirements: 17 total
- Mapped to phases: 0
- Unmapped: 17 ⚠️

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 after milestone v1.1 definition*
