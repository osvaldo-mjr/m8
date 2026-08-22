import type { Locale, PhoneCatalogueEntry } from '@m8/protocol'

/**
 * Confines a page to a manual of `pageCount` pages, so the arrows on this
 * device cannot count past either end of it.
 *
 * The same rule as `clampPage` on the server (`apps/server/src/translate.ts`)
 * and deliberately a second copy of it: this one keeps the phone's own
 * counter honest, that one is the server's last line of defence before it
 * indexes a manual, and neither may be dropped because the other exists. What
 * makes them safe to have twice is that they cannot disagree in a way that
 * matters — this one only ever narrows what the phone would otherwise send,
 * and the server clamps whatever arrives regardless.
 *
 * `pageCount` of zero is the state before the catalogue fetch lands, where
 * page zero is the only page a phone can sensibly ask for.
 */
export function clampManualPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 0
  return Math.min(Math.max(page, 0), pageCount - 1)
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
  // A cast, and it is a claim about the server rather than a check of it. What
  // makes the claim safe is that `PhoneCatalogueEntry` is the wire's own
  // declaration, imported here and imported by the one function that builds
  // this body (`apps/server/src/catalogue.ts`), so there is no second copy for
  // the two to drift apart on: a field dropped or renamed on the server stops
  // compiling on both sides at once.
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
