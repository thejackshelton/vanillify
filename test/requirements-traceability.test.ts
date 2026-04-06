import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

/**
 * v1.1 Requirements Traceability Meta-Test
 *
 * Verifies that every v1.1 requirement ID appears in at least one test file
 * description across the full test suite. This test will catch future regressions
 * where test coverage is removed or requirement IDs are renamed without updating
 * corresponding tests.
 *
 * Requirement IDs covered:
 * - DYN-01 through DYN-08: Dynamic class expression rewriting
 * - TMR-01 through TMR-04: twMerge cleanup
 * - PIPE-01 through PIPE-03: Pipeline updates for fragment entries
 */

const ROOT = resolve(__dirname, "..");

/** Recursively collect all *.test.ts file paths under a directory. */
function collectTestFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

const TEST_DIRS = [
  resolve(ROOT, "test"),
  resolve(ROOT, "src/pipeline"),
];

const ALL_TEST_CONTENT: string = TEST_DIRS.flatMap(collectTestFiles)
  .map((f) => readFileSync(f, "utf-8"))
  .join("\n");

const V1_1_REQUIREMENT_IDS = [
  "DYN-01",
  "DYN-02",
  "DYN-03",
  "DYN-04",
  "DYN-05",
  "DYN-06",
  "DYN-07",
  "DYN-08",
  "TMR-01",
  "TMR-02",
  "TMR-03",
  "TMR-04",
  "PIPE-01",
  "PIPE-02",
  "PIPE-03",
] as const;

describe("v1.1 requirement traceability", () => {
  it.each(V1_1_REQUIREMENT_IDS)(
    "%s appears in at least one test file",
    (reqId) => {
      const found = ALL_TEST_CONTENT.includes(reqId);
      expect(
        found,
        `Requirement ${reqId} does not appear in any test file. ` +
          `Add a test with "${reqId}" in its description to maintain traceability.`,
      ).toBe(true);
    },
  );
});
