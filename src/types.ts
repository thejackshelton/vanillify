/** Custom variant definitions: either a CSS string or a Record mapping names to selectors. */
export type CustomVariantsOption = string | Record<string, string>;

/** Output format for converted CSS and component references. */
export type OutputFormat = 'vanilla' | 'css-modules';

export interface ConvertOptions {
  /**
   * Custom variant definitions for opt-in variant resolution.
   *
   * Accepts either:
   * - A CSS string containing @custom-variant directives
   * - A Record mapping variant names to selector templates (& = target element)
   *
   * @example
   * // CSS string form:
   * customVariants: `
   *   @custom-variant ui-checked (&[ui-checked]);
   *   @custom-variant ui-disabled (&[ui-disabled]);
   * `
   *
   * @example
   * // Object form:
   * customVariants: {
   *   'ui-checked': '&[ui-checked]',
   *   'ui-disabled': '&[ui-disabled]',
   * }
   */
  customVariants?: CustomVariantsOption;

  /**
   * CSS string containing `@theme { ... }` blocks with CSS variable declarations.
   * These are parsed and mapped to UnoCSS theme configuration, enabling
   * theme-defined classes (e.g., `bg-brand`) to resolve correctly.
   *
   * Accepts either a full `@theme { ... }` block or bare declarations.
   *
   * @example
   * themeCss: `@theme {
   *   --color-brand: #ff0000;
   *   --spacing-huge: 10rem;
   * }`
   */
  themeCss?: string;

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
    | "theme-parse-error";
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
