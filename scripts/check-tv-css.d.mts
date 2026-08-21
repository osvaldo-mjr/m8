export interface UnsupportedCssConstruct {
  readonly what: string
  /** The Chromium version the construct first worked in. */
  readonly since: number
  readonly pattern: RegExp
}

export interface UnsupportedCssFinding {
  readonly what: string
  readonly since: number
  /** The text that matched, for a message that says where to look. */
  readonly sample: string
}

export const TV_CHROMIUM_FLOOR: number
export const UNSUPPORTED_CSS: readonly UnsupportedCssConstruct[]
export function stripCssComments(source: string): string
export function findUnsupportedCss(source: string): UnsupportedCssFinding[]
export function assertTvCss(source: string, label: string): void
