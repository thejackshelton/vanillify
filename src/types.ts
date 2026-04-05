import type { CustomVariantsOption } from './variants/types'

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
  customVariants?: CustomVariantsOption
}

export interface ConvertResult {
  /** Transformed component source with indexed class names */
  component: string
  /** Generated vanilla CSS */
  css: string
  /** Warnings for dynamic/unmatched classes */
  warnings: Warning[]
}

export interface Warning {
  type: 'dynamic-class' | 'unmatched-class'
  message: string
  location: { line: number; column: number }
}

export interface NodeEntry {
  /** 0-based index in DOM extraction order */
  nodeIndex: number
  /** Extracted Tailwind class tokens */
  classNames: string[]
  /** Byte offset span in original source for the attribute value */
  span: { start: number; end: number }
  /** Whether this className is a dynamic expression */
  isDynamic: boolean
}
