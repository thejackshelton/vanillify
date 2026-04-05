# Phase 3: CLI and Package - Research

**Researched:** 2026-04-04
**Domain:** CLI tooling, npm package configuration, fixture-based testing
**Confidence:** HIGH

## Summary

Phase 3 wraps the existing programmatic API (`convert()`) with a CLI entry point and finalizes the package for dual ESM+CJS publishing. The core conversion pipeline is complete (Phases 1-2 delivered all CORE, VARI, and CVAR requirements). This phase is purely delivery: a thin CLI shell using `citty` + `consola` for argument parsing and output, `tinyglobby` for file matching, tsdown multi-entry build producing both `src/index.ts` (library) and `src/cli.ts` (executable), and fixture-based snapshot tests using vitest's `toMatchFileSnapshot` against the Qwik checkbox example already in `fixtures/checkbox.tsx`.

The package.json already has correct `exports`, `bin`, `main`, `module`, and `types` fields configured. tsdown config needs a second entry point (`src/cli.ts`) added. The CLI dependencies (`citty`, `consola`, `tinyglobby`, `pathe`) need to be installed as runtime dependencies since they ship with the CLI.

**Primary recommendation:** Add `src/cli.ts` as a second tsdown entry point with shebang, implement CLI using citty's `defineCommand`/`runMain` pattern importing only from `src/index.ts`, and add fixture snapshot tests using `toMatchFileSnapshot` for stable output verification.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLI-01 | CLI accepts file paths/globs as input and writes converted files to disk | citty positional args + tinyglobby for glob expansion; fs.writeFile for output |
| CLI-02 | CLI wraps the programmatic API (no separate conversion logic) | CLI imports `convert` from `../index.ts`; all conversion delegated |
| PKG-01 | Library built with tsdown, dual ESM+CJS output | tsdown already configured for dual output; add `src/cli.ts` entry |
| PKG-02 | Library exports typed API via package.json exports field | package.json `exports` field already correctly configured |
| PKG-03 | Tests run via vitest with fixture-based snapshots (Qwik checkbox example) | vitest `toMatchFileSnapshot` against `fixtures/checkbox.tsx`; snapshot files in `fixtures/` |
</phase_requirements>

## Standard Stack

### Core (New for Phase 3)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `citty` | 0.2.2 | CLI argument parsing | From UnJS ecosystem, typed, zero-dep, used by tsdown itself [VERIFIED: npm registry] |
| `consola` | 3.4.2 | Terminal output / logging | Structured logging from UnJS, pairs with citty [VERIFIED: npm registry] |
| `tinyglobby` | 0.2.15 | Glob file matching | 179KB vs globby's 637KB; 25M+ weekly downloads; drop-in fast-glob replacement [VERIFIED: npm registry] |
| `pathe` | 2.0.3 | Cross-platform path utilities | Drop-in replacement for `node:path`, handles Windows edge cases [VERIFIED: npm registry] |

### Already Installed (No Changes)

| Library | Version | Purpose |
|---------|---------|---------|
| `@unocss/core` | ^66.6.7 | CSS generation engine |
| `@unocss/preset-wind4` | ^66.6.7 | Tailwind v4 preset |
| `oxc-parser` | ^0.123.0 | AST parsing |
| `oxc-walker` | ^0.7.0 | AST traversal |
| `tsdown` | ^0.21.7 | Build tool (dev) |
| `vitest` | ^4.1.2 | Test framework (dev) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tinyglobby` | `node:fs/promises` glob | Native glob requires Node 22.17+; project targets Node 20+ [VERIFIED: Node.js docs] |
| `tinyglobby` | `fast-glob` | fast-glob works but 3x larger (513KB vs 179KB); tinyglobby is the modern replacement [VERIFIED: npm registry] |
| `citty` | `commander` | commander works but heavier, not typed by default, different ecosystem |

**Installation:**
```bash
npm install citty consola tinyglobby pathe
```

## Architecture Patterns

### Updated Project Structure
```
src/
  index.ts          # Public API (already exists) -- DO NOT MODIFY
  types.ts          # Types (already exists)
  cli.ts            # NEW: CLI entry point (thin wrapper)
  pipeline/         # Core pipeline (already exists)
  variants/         # Custom variant resolution (already exists)
fixtures/
  checkbox.tsx      # Qwik checkbox input fixture (already exists)
  checkbox.css      # NEW: Expected CSS output snapshot
  checkbox.component.tsx  # NEW: Expected component output snapshot
test/
  convert.test.ts   # NEW: Fixture-based integration tests
```

### Pattern 1: CLI as Thin Wrapper
**What:** `src/cli.ts` imports `convert` from `./index.ts` and handles only file I/O, glob expansion, and argument parsing. Zero conversion logic lives in the CLI.
**When to use:** Always -- this is a hard requirement (CLI-02).
**Example:**
```typescript
// Source: citty README + project architecture
#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'
import { resolve, dirname, basename, join } from 'pathe'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { convert } from './index'

const main = defineCommand({
  meta: {
    name: 'vanillify',
    version: '0.0.1',
    description: 'Convert Tailwind CSS to vanilla CSS',
  },
  args: {
    patterns: {
      type: 'positional',
      description: 'File paths or glob patterns (e.g., src/**/*.tsx)',
      required: true,
    },
    outDir: {
      type: 'string',
      alias: 'o',
      description: 'Output directory (default: same directory as input)',
    },
  },
  async run({ args }) {
    const files = await glob(args.patterns as unknown as string[])
    if (files.length === 0) {
      consola.warn('No files matched the given patterns')
      return
    }
    for (const file of files) {
      const source = await readFile(file, 'utf-8')
      const result = await convert(source, file)
      // Write outputs...
      for (const warning of result.warnings) {
        consola.warn(`${file}: ${warning.message}`)
      }
    }
    consola.success(`Processed ${files.length} file(s)`)
  },
})

runMain(main)
```

### Pattern 2: tsdown Multi-Entry with Shebang
**What:** tsdown builds both library and CLI from separate entry points. The shebang (`#!/usr/bin/env node`) in `src/cli.ts` is preserved through compilation.
**When to use:** Required for `npx vanillify` to work.
**Example:**
```typescript
// tsdown.config.ts
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
```
[VERIFIED: tsdown docs at tsdown.dev/options/entry] -- tsdown supports array entry points. The shebang line in the source file is preserved in the output. [CITED: github.com/rolldown/tsdown/discussions/589]

**Note on DTS for CLI:** The CLI entry point will also get `.d.ts` files generated, which is harmless. No need to exclude it -- the `exports` field in package.json controls what consumers see.

### Pattern 3: Fixture-Based Snapshot Testing with toMatchFileSnapshot
**What:** Integration tests run `convert()` on real fixture files and compare output against committed snapshot files using vitest's `toMatchFileSnapshot`.
**When to use:** For PKG-03 -- stable, readable snapshot output that catches regressions.
**Example:**
```typescript
// test/convert.test.ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { convert } from '../src/index'

describe('convert - fixtures', () => {
  it('Qwik checkbox produces stable CSS output', async () => {
    const source = await readFile('fixtures/checkbox.tsx', 'utf-8')
    const result = await convert(source, 'checkbox.tsx', {
      customVariants: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    })
    await expect(result.css).toMatchFileSnapshot('fixtures/checkbox.css')
    await expect(result.component).toMatchFileSnapshot('fixtures/checkbox.component.tsx')
  })
})
```
[CITED: vitest.dev/guide/snapshot.html] -- `toMatchFileSnapshot` compares against an explicit file path. First run creates the snapshot file; subsequent runs compare. Must use `await`.

### Anti-Patterns to Avoid
- **Conversion logic in CLI:** The CLI must NEVER contain any class extraction, CSS generation, or rewriting logic. It imports `convert` and does file I/O only.
- **Inline snapshots for fixture tests:** Inline snapshots are fragile for multi-line CSS output. Use `toMatchFileSnapshot` with separate `.css` and `.component.tsx` files.
- **Shell-based glob expansion only:** Relying on shell glob expansion (`npx vanillify src/**/*.tsx`) fails on Windows and in some CI environments. Use `tinyglobby` in the CLI to expand patterns programmatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob expansion | Custom recursive directory walker | `tinyglobby` | Edge cases with symlinks, dotfiles, negation patterns |
| Argument parsing | Manual `process.argv` parsing | `citty` | Type coercion, help text generation, error handling |
| Terminal output | `console.log` with ANSI codes | `consola` | Handles TTY detection, log levels, formatting |
| Path manipulation | String concatenation for paths | `pathe` | Windows backslash handling, extension manipulation |

**Key insight:** The CLI is intentionally thin. Every problem it solves (globbing, arg parsing, output formatting) has a well-tested library. The value is in delegating to `convert()`, not in the CLI itself.

## Common Pitfalls

### Pitfall 1: citty Positional Args Receive Single String, Not Array
**What goes wrong:** citty's `positional` type receives the raw argv value. When the shell expands `src/**/*.tsx`, multiple positional args arrive but citty may only capture the first.
**Why it happens:** citty treats `positional` as a single required argument by default.
**How to avoid:** Use `tinyglobby` to expand patterns inside the CLI. Accept `_` (rest args) from citty or handle the raw `process.argv` for file patterns. Test with both quoted globs (`'src/**/*.tsx'`) and pre-expanded file lists. [ASSUMED]
**Warning signs:** CLI only processes the first file when given multiple arguments.

### Pitfall 2: Shebang Not Preserved by Bundler
**What goes wrong:** `npx vanillify` fails with "cannot execute" or runs without node.
**Why it happens:** Some bundlers strip the `#!/usr/bin/env node` line during compilation.
**How to avoid:** Verify the shebang is present in `dist/cli.js` after building. tsdown preserves shebangs from source files. [CITED: github.com/rolldown/tsdown/discussions/589]
**Warning signs:** `head -1 dist/cli.js` does not show `#!/usr/bin/env node`.

### Pitfall 3: CJS Type Declarations Missing `.d.cts` Extension
**What goes wrong:** TypeScript consumers using `"moduleResolution": "bundler"` or `"node16"` can't resolve types for the CJS entry.
**Why it happens:** tsdown's `dts: true` generates `.d.ts` for ESM; the `.d.cts` for CJS needs to also be generated.
**How to avoid:** tsdown with `format: ['esm', 'cjs']` and `dts: true` generates both `.d.ts` and `.d.cts` automatically. Verify both exist after build. The package.json already has both referenced. [ASSUMED]
**Warning signs:** TypeScript errors when consuming vanillify from a CJS project.

### Pitfall 4: Output File Strategy Unclear
**What goes wrong:** CLI writes output but user doesn't know where files went, or overwrites originals.
**Why it happens:** No clear default for where converted files are written.
**How to avoid:** Design a clear output strategy: write `<name>.vanilla.css` and `<name>.vanilla.tsx` alongside the input file by default, with `--out-dir` flag for a different location. Never overwrite the original file.
**Warning signs:** Users confused about where output went; accidental data loss.

### Pitfall 5: toMatchFileSnapshot First Run Creates Empty Snapshots
**What goes wrong:** Snapshot files don't exist on first `vitest run`, test passes but creates potentially incorrect baseline.
**Why it happens:** `toMatchFileSnapshot` creates the file on first run with whatever output is produced.
**How to avoid:** Run tests once, manually review the created snapshot files, then commit them. All subsequent runs compare against the committed baseline.
**Warning signs:** CI passes but snapshot files contain unexpected content.

## Code Examples

### CLI Entry Point (src/cli.ts)
```typescript
// Pattern: thin CLI wrapper with citty + tinyglobby
#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'
import { resolve, dirname, basename, join } from 'pathe'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { convert } from './index'

const main = defineCommand({
  meta: {
    name: 'vanillify',
    version: '0.0.1',
    description: 'Convert Tailwind CSS classes to vanilla CSS',
  },
  args: {
    patterns: {
      type: 'positional',
      description: 'File paths or glob patterns',
      required: true,
    },
    outDir: {
      type: 'string',
      alias: 'o',
      description: 'Output directory',
    },
  },
  async run({ args }) {
    // Expand globs using tinyglobby
    const files = await glob([args.patterns].flat() as string[])
    
    if (files.length === 0) {
      consola.warn('No files matched the given patterns')
      process.exitCode = 1
      return
    }

    consola.info(`Processing ${files.length} file(s)...`)

    for (const file of files) {
      const absPath = resolve(file)
      const source = await readFile(absPath, 'utf-8')
      const result = await convert(source, file)

      // Determine output paths
      const dir = args.outDir ? resolve(args.outDir) : dirname(absPath)
      const name = basename(file).replace(/\.(tsx?|jsx?)$/, '')
      
      await mkdir(dir, { recursive: true })
      await writeFile(join(dir, `${name}.vanilla.css`), result.css)
      await writeFile(join(dir, `${name}.vanilla.tsx`), result.component)

      // Report warnings
      for (const w of result.warnings) {
        consola.warn(`${file}: ${w.message}`)
      }
    }

    consola.success(`Processed ${files.length} file(s)`)
  },
})

runMain(main)
```

### tsdown Config Update
```typescript
// tsdown.config.ts -- updated for dual entry
import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['./src/index.ts', './src/cli.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
})
```

### Fixture Snapshot Test
```typescript
// test/convert.test.ts
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { convert } from '../src/index'

describe('convert - Qwik checkbox fixture', () => {
  it('produces stable CSS output', async () => {
    const source = await readFile('fixtures/checkbox.tsx', 'utf-8')
    const result = await convert(source, 'checkbox.tsx', {
      customVariants: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    })

    // Verify non-empty output
    expect(result.css).toBeTruthy()
    expect(result.component).toBeTruthy()

    // Snapshot against committed fixture files
    await expect(result.css).toMatchFileSnapshot('fixtures/checkbox.css')
    await expect(result.component).toMatchFileSnapshot('fixtures/checkbox.component.tsx')
  })

  it('reports no errors for static classes', async () => {
    const source = await readFile('fixtures/checkbox.tsx', 'utf-8')
    const result = await convert(source, 'checkbox.tsx', {
      customVariants: `
        @custom-variant ui-checked (&[ui-checked]);
        @custom-variant ui-disabled (&[ui-disabled]);
        @custom-variant ui-mixed (&[ui-mixed]);
      `,
    })

    const errors = result.warnings.filter(w => w.type !== 'dynamic-class')
    expect(errors).toHaveLength(0)
  })
})
```

### package.json Verification Checklist
```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "bin": { "vanillify": "./dist/cli.js" },
  "files": ["dist"],
  "type": "module"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tsup` for library bundling | `tsdown` on Rolldown | 2025 | Faster builds, ESM-first, actively maintained |
| `fast-glob` / `globby` | `tinyglobby` | 2024-2025 | 3x smaller, faster, drop-in compatible |
| `commander` / `yargs` for CLI | `citty` | 2024 | Typed, zero-dep, UnJS ecosystem |
| Manual `process.argv` | `citty defineCommand` | 2024 | Auto help generation, type coercion |
| `toMatchSnapshot` (inline) | `toMatchFileSnapshot` (file) | vitest stable | Readable snapshots with correct extensions |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | citty positional args may need special handling for multiple file paths | Pitfall 1 | CLI only processes first file -- fixable at implementation time |
| A2 | tsdown `dts: true` generates both `.d.ts` and `.d.cts` for dual format | Pitfall 3 | CJS consumers can't resolve types -- verify after first build |
| A3 | tsdown preserves shebang from source to output | Pitfall 2 | `npx vanillify` fails -- add post-build shebang injection if needed |

## Open Questions

1. **Output file naming convention**
   - What we know: CLI needs to write both CSS and transformed component to disk
   - What's unclear: Should output be `<name>.vanilla.css` + `<name>.vanilla.tsx`, or use a different convention?
   - Recommendation: Use `.vanilla.css` and `.vanilla.tsx` suffixes by default; never overwrite originals

2. **citty rest args handling for multiple glob patterns**
   - What we know: citty's `positional` type may only capture one argument
   - What's unclear: How to pass multiple glob patterns (e.g., `vanillify src/**/*.tsx lib/**/*.jsx`)
   - Recommendation: Accept `process.argv.slice(2)` filtered for non-flag args, or use citty's `_` rest args if available; test both single and multiple patterns

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Yes | v24.14.1 | -- (exceeds 20+ requirement) |
| npm/npx | Package install, `npx vanillify` | Yes | 11.11.0 | -- |
| tsdown | Build | Yes (devDep) | ^0.21.7 | -- |
| vitest | Testing | Yes (devDep) | ^4.1.2 | -- |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None -- all environment dependencies are available.

## Project Constraints (from CLAUDE.md)

- **Tech stack**: vite+ toolchain (tsdown, vitest), oxc-parser, UnoCSS -- no other parsers or CSS engines
- **Node.js**: Target modern Node.js (v20+) -- this means `node:fs/promises` glob is NOT available (needs 22.17+)
- **Output format**: Vanilla CSS only
- **Class naming**: Indexed only (`.node0`, `.node1`)
- **CLI is thin wrapper**: No conversion logic in `src/cli.ts`; imports from `src/index.ts` only
- **tsdown not tsup**: tsup is unmaintained; tsdown is required
- **Avoid regex class extraction**: oxc-parser with Visitor traversal (already implemented in Phase 1)
- **Avoid full `unocss` metapackage**: Use `@unocss/core` + preset directly (already configured)

## Sources

### Primary (HIGH confidence)
- [citty README](https://github.com/unjs/citty/blob/main/README.md) -- defineCommand, runMain, args types API
- [tsdown entry point docs](https://tsdown.dev/options/entry) -- multi-entry array configuration
- [tsdown shebang discussion](https://github.com/rolldown/tsdown/discussions/589) -- shebang preservation in output
- [vitest snapshot guide](https://vitest.dev/guide/snapshot.html) -- toMatchFileSnapshot API
- [tinyglobby npm](https://www.npmjs.com/package/tinyglobby) -- version 0.2.15, API
- [citty npm](https://www.npmjs.com/package/citty) -- version 0.2.2
- [consola npm](https://www.npmjs.com/package/consola) -- version 3.4.2
- [pathe npm](https://www.npmjs.com/package/pathe) -- version 2.0.3

### Secondary (MEDIUM confidence)
- [Node.js native glob](https://www.stefanjudis.com/today-i-learned/node-js-includes-a-native-glob-utility/) -- requires Node 22.17+, confirming need for tinyglobby
- [tinyglobby comparison](https://superchupu.dev/tinyglobby/comparison) -- size and speed benchmarks vs globby/fast-glob

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified against npm registry, versions confirmed current
- Architecture: HIGH -- CLI-as-wrapper pattern is textbook; package.json already configured correctly
- Pitfalls: MEDIUM -- citty positional arg handling and tsdown shebang preservation need implementation-time verification

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain -- CLI tooling changes slowly)
