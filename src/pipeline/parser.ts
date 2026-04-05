import { parseSync } from "oxc-parser";

export interface ParseResult {
  program: any; // ESTree Program node from oxc-parser
  errors: Array<{ message: string }>;
}

/**
 * Parse JSX/TSX source into an ESTree-compatible AST.
 * Language is inferred from the filename extension by oxc-parser.
 *
 * @param filename - Used for language detection (e.g., "component.tsx")
 * @param source - The source code string to parse
 * @returns ParseResult with the AST program node
 * @throws Error if parsing produces errors (T-01-01: wrapped in try/catch)
 */
export function parse(filename: string, source: string): ParseResult {
  try {
    const result = parseSync(filename, source, {
      sourceType: "module",
    });

    if (result.errors && result.errors.length > 0) {
      // T-01-02: Only include user-provided filename, not filesystem paths
      const messages = result.errors.map((e: any) => e.message).join(", ");
      throw new Error(`Parse error in ${filename}: ${messages}`);
    }

    return {
      program: result.program,
      errors: [],
    };
  } catch (error) {
    // T-01-01: Never let native parser crash propagate unhandled
    if (error instanceof Error && error.message.startsWith("Parse error")) {
      throw error;
    }
    // Wrap unexpected errors with filename context only
    throw new Error(
      `Parse error in ${filename}: ${error instanceof Error ? error.message : "Unknown parsing error"}`,
    );
  }
}
