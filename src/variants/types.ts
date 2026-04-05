export interface ParsedVariant {
  name: string
  selectorTemplate: string // Contains & as placeholder for target element
}

export type CustomVariantsOption = string | Record<string, string>
