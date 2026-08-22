/** The two languages the product ships in. The interface's own strings and a
 * language switch are a later plan; a manifest declares both from the start so
 * translating a game is never a migration. */
export type Locale = 'pt-BR' | 'en'

export const LOCALES: readonly Locale[] = ['pt-BR', 'en']

/**
 * One page of a game's manual, read from the large screen by a room three
 * metres away — never from a phone.
 */
export interface ManualPage {
  readonly title: string
  readonly lines: readonly string[]
}

/**
 * At three metres, in the type size legibility demands, a page holds roughly
 * this many words. The limit is asserted rather than advised: a manual nobody
 * can read from the sofa fails the one job it has.
 */
export const MANUAL_PAGE_MAX_WORDS = 60

/**
 * The table's hard capacity, independent of any game.
 *
 * This is the same number as `MAX_PARTICIPANTS` in `@m8/core`, written twice
 * on purpose: a manifest must be checkable without pulling the domain in, and
 * the domain must bound a table without knowing games exist. The repository
 * already does this for `NICKNAME_MAX_LENGTH`, and handles it the same way —
 * `apps/server/src/limits.test.ts`, the one place that sees both packages,
 * fails if the two ever disagree.
 */
export const MAX_SEATS = 8

/**
 * Everything the platform may know about a game without loading its code:
 * enough to list it, present it, and size its table.
 */
export interface GameManifest {
  readonly id: string
  readonly contractVersion: number
  readonly seats: { readonly min: number; readonly max: number }
  readonly name: Record<Locale, string>
  readonly tagline: Record<Locale, string>
  readonly manual: Record<Locale, readonly ManualPage[]>
  /** A file name inside the game's own `assets/` directory — not a URL. The
   * platform decides where a game's assets are published; a manifest that
   * declared its own path would be a game deciding the server's routing. */
  readonly cover: string
  readonly status: 'playable' | 'coming-soon'
}

export function manualPageWordCount(page: ManualPage): number {
  const words = [page.title, ...page.lines].join(' ').trim().split(/\s+/)
  return words[0] === '' ? 0 : words.length
}

/** Returns every fault, not the first — a game author fixing one at a time is
 * a game author making six round trips. */
export function manifestFaults(manifest: GameManifest): string[] {
  const faults: string[] = []

  if (manifest.id.trim() === '') faults.push('id is empty')
  if (manifest.cover.trim() === '') faults.push('cover is empty')
  if (manifest.seats.min > manifest.seats.max) {
    faults.push(`seats.min ${manifest.seats.min} is above seats.max ${manifest.seats.max}`)
  }
  if (manifest.seats.max > MAX_SEATS) {
    faults.push(`seats.max ${manifest.seats.max} is above the table capacity of ${MAX_SEATS}`)
  }
  if (manifest.seats.min < 1) faults.push('seats.min is below one')

  for (const locale of LOCALES) {
    const pages = manifest.manual[locale]
    if (pages.length === 0) {
      faults.push(`manual for ${locale} has no pages`)
      continue
    }
    pages.forEach((page, index) => {
      const words = manualPageWordCount(page)
      if (words > MANUAL_PAGE_MAX_WORDS) {
        faults.push(
          `manual page ${index + 1} for ${locale} has ${words} words, above ${MANUAL_PAGE_MAX_WORDS}`,
        )
      }
    })
    if (manifest.name[locale].trim() === '') faults.push(`name for ${locale} is empty`)
  }

  return faults
}
