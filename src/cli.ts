#!/usr/bin/env node
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'
import { basename, dirname, join, resolve } from 'pathe'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
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
      description: 'Output directory (default: alongside input files)',
    },
    customVariants: {
      type: 'string',
      alias: 'c',
      description: 'Path to CSS file with @custom-variant definitions',
    },
  },
  async run({ args }) {
    // Expand globs using tinyglobby (handles citty positional arg behavior)
    const files = await glob([args.patterns].flat() as string[])

    if (files.length === 0) {
      consola.warn('No files matched the given patterns')
      process.exitCode = 1
      return
    }

    consola.info(`Processing ${files.length} file(s)...`)

    // Read custom variants CSS file if provided
    let customVariantsCSS: string | undefined
    if (args.customVariants) {
      customVariantsCSS = await readFile(resolve(args.customVariants), 'utf-8')
    }

    for (const file of files) {
      const absPath = resolve(file)
      const source = await readFile(absPath, 'utf-8')

      const options = customVariantsCSS
        ? { customVariants: customVariantsCSS }
        : undefined

      const result = await convert(source, file, options)

      // Determine output paths -- never overwrite originals
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
