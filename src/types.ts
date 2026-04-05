/** Output format for converted CSS and component references. */
export type OutputFormat = 'vanilla' | 'css-modules';

export interface ConvertOptions {
  /**
   * CSS string prepended to Tailwind's base import before compilation.
   * Use this for @theme blocks, @custom-variant directives, or any other
   * CSS that Tailwind's compile() should process alongside utilities.
   *
   * @example
   * css: `
   *   @theme { --color-brand: #ff0000; }
   *   @custom-variant ui-checked (&[ui-checked]);
   * `
   */
  css?: string;

  /** Output format. 'vanilla' (default) produces bare class names, 'css-modules' produces styles.nodeN expressions with import statement. */
  outputFormat?: OutputFormat;
}

export interface ConvertResult {
  /** Transformed component source with indexed class names */
  component: string;
  /** Generated vanilla CSS */
  css: string;
  /** :root CSS variable definitions from theme layer (empty string if no theme) */
  themeCss: string;
  /** Warnings for dynamic/unmatched classes */
  warnings: Warning[];
  /** CSS Modules class map (only present when outputFormat is 'css-modules'). Maps indexed names to themselves, e.g. { node0: "node0" }. */
  classMap?: Record<string, string>;
}

export interface Warning {
  type:
    | "dynamic-class"
    | "unmatched-class"
    | "theme-parse-error"
    | "unknown-theme-namespace"
    | "unsupported-theme-reset";
  message: string;
  location: { line: number; column: number };
}

export interface NodeEntry {
  /** 0-based index in DOM extraction order */
  nodeIndex: number;
  /** Extracted Tailwind class tokens */
  classNames: string[];
  /** Byte offset span in original source for the attribute value */
  span: { start: number; end: number };
  /** Whether this className is a dynamic expression */
  isDynamic: boolean;
}
