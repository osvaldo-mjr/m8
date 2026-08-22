import type { GameManifest } from '@m8/contract'
import type { PhoneCatalogueEntry } from '@m8/protocol'
import * as chess from '@m8/game-chess'
import * as dominoes from '@m8/game-dominoes'
import * as draughts from '@m8/game-draughts'
import * as ticTacToe from '@m8/game-tic-tac-toe'

const GAMES = [ticTacToe, chess, draughts, dominoes]

/**
 * The one place in the server that names a game. Everything else asks the
 * catalogue, so adding a game is adding a line here and a workspace beside it.
 */
export const CATALOGUE: readonly GameManifest[] = GAMES.map((game) => game.manifest)

/**
 * Each game's own asset directory, keyed by its id, derived from the same
 * list — so a game cannot reach the catalogue with nowhere to serve its cover
 * from.
 */
export const GAME_ASSET_ROOTS: ReadonlyMap<string, string> = new Map(
  GAMES.map((game) => [game.manifest.id, game.assetsRoot]),
)

/** The platform's routing decision, in one place. */
export function coverUrl(manifest: GameManifest): string {
  return `/covers/${manifest.id}/${manifest.cover}`
}

export function findManifest(id: string): GameManifest | undefined {
  return CATALOGUE.find((manifest) => manifest.id === id)
}

/**
 * How many pages a manifest's manual holds. The two locales are meant to
 * carry the same count; the lower of the two is used so a locale that somehow
 * fell behind can never be indexed past its own end.
 *
 * Lives here rather than in `translate.ts` because three places now need it —
 * the preview the screen is sent, the clamp `session.ts` applies to an
 * incoming page, and the count the phone is listed with — and this is the one
 * of the three every other imports from anyway.
 */
export function manifestPageCount(manifest: GameManifest): number {
  return Math.min(manifest.manual['pt-BR'].length, manifest.manual.en.length)
}

/**
 * A manifest as a phone is allowed to know it. The shape itself is the wire's
 * (`@m8/protocol`'s `PhoneCatalogueEntry`), not this file's: the phone reads
 * the very same declaration, so there is nothing here for the two to drift
 * apart on. What lives here is only the translation — which fields of a
 * manifest a phone may see, and what the platform turns them into.
 *
 * The manual is absent by construction, not by the phone declining to render
 * it: the host reads the rules from the large screen with the room, and a
 * device that never receives the text cannot break that rule later.
 */
export function catalogueForPhone(manifests: readonly GameManifest[]): PhoneCatalogueEntry[] {
  // The callback's return type is annotated, not merely inferred and checked
  // against the array's: an object literal only gets excess-property checking
  // where it is contextually typed, and inference through `map` loses that. A
  // field renamed on the wire has to fail here, in the one function that
  // builds this body, rather than only wherever the phone happens to read it.
  return manifests.map((manifest): PhoneCatalogueEntry => ({
    id: manifest.id,
    name: manifest.name,
    tagline: manifest.tagline,
    cover: coverUrl(manifest),
    pageCount: manifestPageCount(manifest),
    status: manifest.status,
  }))
}
