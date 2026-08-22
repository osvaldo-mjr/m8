import type { GameManifest, Locale } from '@m8/contract'
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

export interface PhoneCatalogueEntry {
  readonly id: string
  readonly name: Record<Locale, string>
  readonly tagline: Record<Locale, string>
  readonly cover: string
  readonly seats: { readonly min: number; readonly max: number }
  readonly status: GameManifest['status']
}

/**
 * What the phone is allowed to know. The manual is absent by construction, not
 * by the phone declining to render it: the host reads the rules from the large
 * screen with the room, and a device that never receives the text cannot break
 * that rule later.
 */
export function catalogueForPhone(manifests: readonly GameManifest[]): PhoneCatalogueEntry[] {
  return manifests.map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    tagline: manifest.tagline,
    cover: coverUrl(manifest),
    seats: manifest.seats,
    status: manifest.status,
  }))
}
