export interface ConvertOptions {
  // Phase 2 will add customVariants here
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
