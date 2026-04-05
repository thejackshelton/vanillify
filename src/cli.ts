#!/usr/bin/env node
import { createRegExp, exactly, maybe } from "magic-regexp";
import { defineCommand, runMain } from "citty";
import { consola } from "consola";
import { glob } from "tinyglobby";
import { basename, dirname, join, resolve } from "pathe";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { convert } from "./index";
import type { ConvertOptions, OutputFormat } from "./types";

/** Matches JSX/TSX file extensions at end of string */
const EXT_RE = createRegExp(
  exactly(".").and(exactly("ts").or(exactly("js"))).and(maybe(exactly("x"))).at.lineEnd(),
);

const main = defineCommand({
  meta: {
    name: "vanillify",
    version: "0.0.1",
    description: "Convert Tailwind CSS classes to vanilla CSS",
  },
  args: {
    patterns: {
      type: "positional",
      description: "File paths or glob patterns",
      required: true,
    },
    outDir: {
      type: "string",
      alias: "o",
      description: "Output directory (default: alongside input files)",
    },
    customVariants: {
      type: "string",
      alias: "c",
      description: "Path to CSS file with @custom-variant definitions",
    },
    theme: {
      type: "string",
      alias: "t",
      description: "Path to CSS file with @theme block definitions",
    },
    format: {
      type: "string",
      alias: "f",
      description: "Output format: vanilla (default) or css-modules",
      default: "vanilla",
    },
  },
  async run({ args }) {
    // Expand globs using tinyglobby (handles citty positional arg behavior)
    const files = await glob([args.patterns].flat() as string[]);

    if (files.length === 0) {
      consola.warn("No files matched the given patterns");
      process.exitCode = 1;
      return;
    }

    consola.info(`Processing ${files.length} file(s)...`);

    // Read custom variants CSS file if provided
    let customVariantsCSS: string | undefined;
    if (args.customVariants) {
      customVariantsCSS = await readFile(resolve(args.customVariants), "utf-8");
    }

    // Read theme CSS file if provided
    let themeCss: string | undefined;
    if (args.theme) {
      themeCss = await readFile(resolve(args.theme), "utf-8");
    }

    const outputFormat: OutputFormat = args.format === 'css-modules' ? 'css-modules' : 'vanilla';

    const options: ConvertOptions = {
      ...(customVariantsCSS ? { customVariants: customVariantsCSS } : {}),
      ...(themeCss ? { themeCss } : {}),
      outputFormat,
    };

    let processed = 0;
    for (const file of files) {
      try {
        const absPath = resolve(file);
        const source = await readFile(absPath, "utf-8");

        const result = await convert(source, file, options);

        // Determine output paths -- never overwrite originals
        const dir = args.outDir ? resolve(args.outDir) : dirname(absPath);
        const name = basename(file).replace(EXT_RE, "");
        const ext = file.match(EXT_RE)?.[0] ?? ".tsx";

        await mkdir(dir, { recursive: true });
        const fullCss = result.themeCss
          ? `${result.themeCss}\n\n${result.css}`
          : result.css;
        const cssExt = outputFormat === 'css-modules' ? '.module.css' : '.vanilla.css';
        const componentExt = outputFormat === 'css-modules' ? `.module${ext}` : `.vanilla${ext}`;
        await writeFile(join(dir, `${name}${cssExt}`), fullCss);
        await writeFile(join(dir, `${name}${componentExt}`), result.component);

        // Report warnings
        for (const w of result.warnings) {
          consola.warn(`${file}: ${w.message}`);
        }
        processed++;
      } catch (err) {
        consola.error(`Failed to process ${file}: ${err instanceof Error ? err.message : err}`);
      }
    }

    consola.success(`Processed ${processed}/${files.length} file(s)`);
  },
});

runMain(main);
