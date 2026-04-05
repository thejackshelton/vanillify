import type { Warning } from "../types";

export interface ThemeDeclaration {
  property: string; // e.g., "--color-brand"
  value: string; // e.g., "#ff0000"
}

export interface ParseThemeResult {
  declarations: ThemeDeclaration[];
  warnings: Warning[];
}

export interface ThemeMapResult {
  theme: Record<string, any>;
  warnings: Warning[];
}
