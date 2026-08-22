import type { Locale } from '@m8/protocol'

/** Mirrors `@m8/contract`'s `GameManifest['status']` without importing the
 * contract package: the phone may not depend on it (see `catalogue.ts` on the
 * server, which is the one place allowed to see both). */
export type GameStatus = 'playable' | 'coming-soon'

/**
 * What `GET /api/games` sends. The server's own `PhoneCatalogueEntry`
 * (`apps/server/src/catalogue.ts`) is the source of truth for the shape; this
 * is the phone's copy of it, deliberately with no `manual` field — there is
 * nothing here to render even if a future screen tried, because the manual is
 * read from the large screen, never from a phone.
 */
export interface PhoneCatalogueEntry {
  readonly id: string
  readonly name: Record<Locale, string>
  readonly tagline: Record<Locale, string>
  readonly cover: string
  readonly seats: { readonly min: number; readonly max: number }
  readonly status: GameStatus
}

/**
 * Which of the two shipped locales a game's own words are read in today.
 * There is no language switch yet — `apps/tv/src/render.ts` picks the same
 * way, as `SCREEN_LOCALE` — so this is the phone's half of that one decision,
 * not a second one.
 */
export const PHONE_LOCALE: Locale = 'pt-BR'

/**
 * Platform content, identical for every table — not table state, so it is
 * fetched once over HTTP rather than arriving on the socket. See
 * `apps/server/src/app.ts`'s `/api/games` route.
 */
export async function fetchCatalogue(): Promise<PhoneCatalogueEntry[]> {
  const response = await fetch('/api/games')
  if (!response.ok) {
    throw new Error(`GET /api/games failed with status ${response.status}`)
  }
  return (await response.json()) as PhoneCatalogueEntry[]
}

/**
 * Case- and accent-insensitive, so a Brazilian typing "damas" finds "Damas"
 * and "velha" finds "Jogo da velha" whichever locale they happen to type in.
 * Diacritics are stripped via Unicode decomposition rather than a hand-rolled
 * substitution table, which would need a new entry for every accented letter
 * either shipped locale ever uses.
 */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/**
 * A pure function so the search box has no server round trip and no
 * debounce to get wrong: the whole catalogue is small enough to filter on
 * every keystroke. Matches either locale's name — the room mixes languages
 * more than the wire does — and an empty (or whitespace-only) query returns
 * every entry rather than none, so clearing the box restores the full list.
 */
export function searchCatalogue(
  entries: readonly PhoneCatalogueEntry[],
  query: string,
): PhoneCatalogueEntry[] {
  const needle = fold(query.trim())
  if (needle === '') return [...entries]
  return entries.filter((entry) => Object.values(entry.name).some((name) => fold(name).includes(needle)))
}
