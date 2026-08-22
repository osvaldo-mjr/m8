# M8 Plan 2a — The Catalogue and Seats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The host browses a catalogue on his phone, a game's box and manual appear on the large screen, choosing it creates seats, people scan in and fill them, and the start control lights up when the minimum is seated.

**Architecture:** A new `packages/contract` holds the game manifest — what the platform may know about a game without loading it. `packages/core` gains the seat model and the fuller state machine. The protocol splits in two: the large screen receives the table, each phone receives only its own state. `apps/server` grows a catalogue endpoint and the new message handlers.

**Tech Stack:** Node 26, TypeScript, Vitest, Fastify, Socket.IO, Vite, Tailwind v3 (screen) and v4 (phone).

**Spec:** `docs/superpowers/specs/2026-08-21-m8-seats-catalogue-and-match-design.md`

## Why this plan stops where it stops

The spec covers the catalogue, seats, the game contract and the match lifecycle. Split here because this half produces something that stands on its own and can be carried to a television: a game is chosen, seats fill, and the start control becomes enabled. Pressing start is Plan 2b, which defines the contract from the lifecycle that consumes it.

## Global Constraints

Copied from the spec and `CLAUDE.md`; every task inherits them.

- **Repository language is English** — code, identifiers, comments, commit messages, docs.
- **Claude is never named in anything git records** — no co-author trailer, no mention in commit messages, branch names or tags.
- **Run tests through PowerShell.** Under the sandboxed Bash tool vitest workers die with `failed to find the runner` and every file reports as failed with zero tests. Builds, guards, git and docker work fine through Bash. **Never write a file through PowerShell** — it reads UTF-8 through the ANSI code page and corrupts non-ASCII characters.
- **`packages/core` performs no I/O** — no timers, no clock reads, no randomness of its own. Time arrives through `Clock`, randomness through `Rng`, identifiers through `IdSource`.
- **`packages/core` never imports `@m8/protocol`.** It owns its own vocabulary; `apps/server/src/translate.ts` maps it to the wire.
- **The large screen compiles to ES2017** — no `?.`, no `??` in emitted output. No `clamp()`, `min()`, `max()` (Chromium 79), no `aspect-ratio` (88), no `gap` in flexbox (84), no `:is()`/`:where()` (88), no `inset` shorthand (87). Tailwind v3 with preflight off.
- **5% safe margins on the large screen**; nothing interactive there; readable at three metres.
- **All colour values live once** as custom properties in `packages/tokens`.
- **The phone never imports `@m8/core`.**
- **The phone is never sent the table's state, and never sent a game's manual.**
- Three CI guards must stay green: emitted-JS ES2017 syntax, Chromium-68 CSS, and the size budget.

---

### Task 1: The manifest, and a guard on the manual

**Files:**
- Create: `packages/contract/package.json`
- Create: `packages/contract/src/index.ts`
- Create: `packages/contract/src/manifest.ts`
- Test: `packages/contract/src/manifest.test.ts`
- Modify: `tsconfig.json` (add the path), `vitest.config.ts` (add the alias)

**Interfaces:**
- Consumes: nothing.
- Produces: `type Locale = 'pt-BR' | 'en'`; `interface ManualPage { readonly title: string; readonly lines: readonly string[] }`; `interface GameManifest` with `id`, `contractVersion`, `seats: { min, max }`, `name`, `tagline`, `manual`, `cover`, `status`; `MANUAL_PAGE_MAX_WORDS: 60`; `manualPageWordCount(page: ManualPage): number`; `manifestFaults(manifest: GameManifest): string[]`.

- [ ] **Step 1: Create the package manifest**

`packages/contract/package.json`:

```json
{
  "name": "@m8/contract",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 2: Write the failing test**

`packages/contract/src/manifest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  MANUAL_PAGE_MAX_WORDS,
  manifestFaults,
  manualPageWordCount,
  type GameManifest,
} from './manifest.js'

function manifest(overrides: Partial<GameManifest> = {}): GameManifest {
  return {
    id: 'tic-tac-toe',
    contractVersion: 1,
    seats: { min: 2, max: 2 },
    name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
    tagline: { 'pt-BR': 'Três em linha', en: 'Three in a row' },
    manual: {
      'pt-BR': [{ title: 'Como joga', lines: ['Marque três em linha.'] }],
      en: [{ title: 'How to play', lines: ['Mark three in a row.'] }],
    },
    cover: 'cover.svg',
    status: 'playable',
    ...overrides,
  }
}

describe('manualPageWordCount', () => {
  it('counts the title and every line', () => {
    expect(manualPageWordCount({ title: 'How to play', lines: ['One two', 'three'] })).toBe(6)
  })

  it('ignores repeated whitespace', () => {
    expect(manualPageWordCount({ title: '  How   to play ', lines: [] })).toBe(3)
  })
})

describe('manifestFaults', () => {
  it('accepts a well-formed manifest', () => {
    expect(manifestFaults(manifest())).toEqual([])
  })

  it('rejects a manual page too long to read from three metres', () => {
    const long = { title: 'Rules', lines: [Array.from({ length: 80 }, () => 'word').join(' ')] }
    const faults = manifestFaults(manifest({ manual: { 'pt-BR': [long], en: [long] } }))
    expect(faults.some((fault) => fault.includes(String(MANUAL_PAGE_MAX_WORDS)))).toBe(true)
  })

  it('rejects a locale with no manual at all', () => {
    const faults = manifestFaults(manifest({ manual: { 'pt-BR': [], en: [] } }))
    expect(faults.some((fault) => fault.includes('manual'))).toBe(true)
  })

  it('rejects a minimum above the maximum', () => {
    expect(manifestFaults(manifest({ seats: { min: 3, max: 2 } }))).toHaveLength(1)
  })

  it('rejects a maximum above the table capacity', () => {
    expect(manifestFaults(manifest({ seats: { min: 2, max: 9 } }))).toHaveLength(1)
  })

  it('names every fault it finds rather than stopping at the first', () => {
    const faults = manifestFaults(manifest({ seats: { min: 9, max: 2 }, cover: '' }))
    expect(faults.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run through PowerShell: `npx vitest run packages/contract/src/manifest.test.ts`

Expected: FAIL — `Failed to resolve import "./manifest.js"`.

- [ ] **Step 4: Write the implementation**

`packages/contract/src/manifest.ts`:

```ts
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
```

`packages/contract/src/index.ts`:

```ts
export {
  LOCALES,
  MANUAL_PAGE_MAX_WORDS,
  MAX_SEATS,
  manifestFaults,
  manualPageWordCount,
} from './manifest.js'
export type { GameManifest, Locale, ManualPage } from './manifest.js'
```

- [ ] **Step 5: Pin the duplicated constant**

Add to `apps/server/src/limits.test.ts`, beside the nickname case it already holds:

```ts
it('bounds a table at the same number in the contract and in the domain', () => {
  expect(MAX_SEATS).toBe(MAX_PARTICIPANTS)
})
```

- [ ] **Step 6: Wire the package into the toolchain**

Add to `tsconfig.json` `paths`: `"@m8/contract": ["./packages/contract/src/index.ts"]`.

Add to `vitest.config.ts` `resolve.alias`, keeping the more specific `@m8/protocol/validate` entry first: `'@m8/contract': fileURLToPath(new URL('./packages/contract/src/index.ts', import.meta.url))`.

- [ ] **Step 7: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS, the existing suite plus 10 new tests.

- [ ] **Step 8: Confirm the workspace guard still passes**

Run: `npx vitest run scripts/dockerfile-manifests.test.ts`

Expected: FAIL — the guard derives the workspace list from `package.json` and the Dockerfile now omits `packages/contract/package.json`. Add that COPY line to the Dockerfile, then re-run: PASS.

This is the guard doing its job; it was written for exactly this moment.

- [ ] **Step 9: Commit**

```bash
git add packages/contract apps/server/src/limits.test.ts tsconfig.json vitest.config.ts Dockerfile package-lock.json
git commit -m "Add the game manifest, with a guard on manual length

A page a room cannot read from three metres fails the only job a manual
has, so the word limit is asserted rather than advised."
```

---

### Task 2: The catalogue

**Files:**
- Create: `packages/games/tic-tac-toe/package.json`, `packages/games/tic-tac-toe/src/manifest.ts`, `packages/games/tic-tac-toe/src/index.ts`, `packages/games/tic-tac-toe/assets/cover.svg`
- Create: `packages/games/chess/`, `packages/games/draughts/`, `packages/games/dominoes/` (manifest and cover only, each `coming-soon`)
- Create: `apps/server/src/catalogue.ts`
- Test: `apps/server/src/catalogue.test.ts`
- Modify: `apps/server/src/app.ts`, `apps/server/package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile` (four more workspace manifests, and the assets they serve)

**Interfaces:**
- Consumes: `GameManifest`, `manifestFaults`, `Locale` from `@m8/contract`.
- Produces: `CATALOGUE: readonly GameManifest[]`; `GAME_ASSET_ROOTS: ReadonlyMap<string, string>`; `coverUrl(manifest): string`; `catalogueForPhone(manifests): PhoneCatalogueEntry[]` where `PhoneCatalogueEntry` is `{ id, name, tagline, cover, seats, status }` — **no manual**; `findManifest(id): GameManifest | undefined`.

The workspace glob `packages/games/*` is already in the root `package.json`, added when the monorepo was laid out; nothing there needs changing.

- [ ] **Step 1: Write the failing test**

`apps/server/src/catalogue.test.ts`:

```ts
import { manifestFaults } from '@m8/contract'
import { describe, expect, it } from 'vitest'
import { CATALOGUE, GAME_ASSET_ROOTS, catalogueForPhone, findManifest } from './catalogue.js'

describe('the catalogue', () => {
  it('offers something to choose', () => {
    expect(CATALOGUE.length).toBeGreaterThan(1)
  })

  it('holds no malformed manifest', () => {
    for (const manifest of CATALOGUE) {
      expect({ id: manifest.id, faults: manifestFaults(manifest) }).toEqual({
        id: manifest.id,
        faults: [],
      })
    }
  })

  it('gives every game a distinct id', () => {
    expect(new Set(CATALOGUE.map((m) => m.id)).size).toBe(CATALOGUE.length)
  })

  it('finds a game by id', () => {
    expect(findManifest('tic-tac-toe')?.id).toBe('tic-tac-toe')
  })

  it('does not find a game that is not there', () => {
    expect(findManifest('backgammon')).toBeUndefined()
  })
})

describe('catalogueForPhone', () => {
  it('never carries a manual', () => {
    const serialized = JSON.stringify(catalogueForPhone(CATALOGUE))
    expect(serialized).not.toContain('manual')
  })

  it('carries what the phone lists with', () => {
    const entry = catalogueForPhone(CATALOGUE)[0]!
    expect(Object.keys(entry).sort()).toEqual(['cover', 'id', 'name', 'seats', 'status', 'tagline'])
  })

  it('turns the manifest file name into a URL the phone can fetch', () => {
    const entry = catalogueForPhone(CATALOGUE).find((e) => e.id === 'tic-tac-toe')!
    expect(entry.cover).toBe('/covers/tic-tac-toe/cover.svg')
  })
})

describe('the asset roots', () => {
  it('gives every catalogued game a directory to serve', () => {
    for (const manifest of CATALOGUE) {
      expect(GAME_ASSET_ROOTS.get(manifest.id)).toBeTypeOf('string')
    }
  })
})
```

The manual assertion is structural rather than a spot check: the rule that the host reads from the screen holds because the phone is never sent the text, and a future field added to the entry cannot smuggle it back without failing the key-set assertion.

- [ ] **Step 2: Run the test and confirm it fails**

Run through PowerShell: `npx vitest run apps/server/src/catalogue.test.ts`

Expected: FAIL — `Failed to resolve import "./catalogue.js"`.

- [ ] **Step 3: Write one real manifest and three placeholders**

`packages/games/tic-tac-toe/src/manifest.ts`:

```ts
import type { GameManifest } from '@m8/contract'

export const manifest: GameManifest = {
  id: 'tic-tac-toe',
  contractVersion: 1,
  seats: { min: 2, max: 2 },
  name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
  tagline: { 'pt-BR': 'Três em linha, e a linha decide', en: 'Three in a row decides it' },
  manual: {
    'pt-BR': [
      { title: 'A mesa', lines: ['Nove casas.', 'Dois jogadores, um X e um O.'] },
      { title: 'A vez', lines: ['Marque uma casa vazia.', 'Depois é a vez do outro.'] },
      { title: 'Vitória', lines: ['Três iguais em linha, coluna ou diagonal.', 'Sem casas livres, empate.'] },
    ],
    en: [
      { title: 'The table', lines: ['Nine cells.', 'Two players, one X and one O.'] },
      { title: 'Your turn', lines: ['Mark an empty cell.', 'Then it is the other player.'] },
      { title: 'Winning', lines: ['Three alike in a row, column or diagonal.', 'No cells left is a draw.'] },
    ],
  },
  cover: 'cover.svg',
  status: 'playable',
}
```

`packages/games/tic-tac-toe/src/index.ts`:

```ts
import { fileURLToPath } from 'node:url'

export { manifest } from './manifest.js'

/** Where this game's own assets live. The game names its directory; the
 * platform decides the URL they are published under. */
export const assetsRoot = fileURLToPath(new URL('../assets/', import.meta.url))
```

`packages/games/chess/src/manifest.ts` follows the same shape with `id: 'chess'`, `seats: { min: 2, max: 2 }`, `status: 'coming-soon'`, and a three-page manual. Draughts and dominoes likewise — dominoes with `seats: { min: 2, max: 4 }`, which is the catalogue's only game where a match can begin with an empty chair.

Each game package gets the same `package.json` shape as `@m8/contract`, named `@m8/game-<id>`, with `@m8/contract` as a dependency, the same two files in `src/`, and an `assets/` directory.

- [ ] **Step 4: Write the catalogue composition**

`apps/server/src/catalogue.ts`:

```ts
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
```

- [ ] **Step 5: Serve it**

In `apps/server/src/app.ts`, beside the existing routes:

```ts
for (const [id, root] of GAME_ASSET_ROOTS) {
  // One registration per game, each rooted in that game's own package, so a
  // game's artwork travels with the game rather than being copied into the
  // server's tree at build time.
  await app.register(fastifyStatic, {
    root,
    prefix: `/covers/${id}/`,
    decorateReply: false,
  })
}

app.get('/api/games', async (_request, reply) => {
  // Platform content, identical for every table and cacheable — not table
  // state. Bundling it into the phone would make adding a game a phone
  // release.
  return reply.header('cache-control', 'public, max-age=60').send(catalogueForPhone(CATALOGUE))
})
```

- [ ] **Step 6: Draw the covers**

Create `packages/games/<id>/assets/cover.svg` for each game: a box lid in the house palette carrying the game's own pattern — a chequerboard for chess and draughts, a nine-cell grid for tic-tac-toe, a domino for dominoes.

Every colour must be a literal in the SVG rather than a token reference: these files are fetched as images, so they render outside the document and `var(--m8-…)` resolves to nothing. Copy the values from `packages/tokens/tokens.css` and name the token each one came from in a comment — this is the one place a colour is duplicated, and it should say so.

SVG rather than raster: a few hundred bytes each, scales to any panel, and no game needs an illustrator before it can appear in the list. A manifest may name a raster file instead when a game earns real artwork.

The Dockerfile copies workspace sources for the build; confirm `packages/games/*/assets/` survives into the runtime image, since the server now serves those files directly rather than a bundled copy.

- [ ] **Step 7: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS, plus 7 new tests.

- [ ] **Step 8: Verify the endpoint against a running server**

Run: `npm run lan`, then `curl -s http://localhost:3000/api/games | head -c 400`

Expected: JSON with four entries and no `manual` key anywhere. Then `curl -sI http://localhost:3000/covers/tic-tac-toe/cover.svg` — expected `200` with `content-type: image/svg+xml`. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add packages/games apps/server tsconfig.json vitest.config.ts package-lock.json Dockerfile
git commit -m "Add the catalogue, and keep the manual off the phone

The phone's entry carries no manual text at all, so the rule that the room
reads the rules together holds by construction rather than by a screen
choosing not to show something it was given."
```

---

### Task 3: Table phases and the round marker

**Files:**
- Modify: `packages/core/src/table.ts`, `packages/core/src/table-registry.ts`, `packages/core/src/views.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/table-registry.test.ts`

**Interfaces:**
- Consumes: existing `TableRegistry`, `Clock`, `Rng`, `IdSource`.
- Produces: `type TablePhase = 'awaiting-host' | 'choosing-game' | 'seating' | 'playing' | 'paused' | 'awaiting-seat' | 'finished'`; `Table` gains `readonly round: number`, `readonly chosenGameId: string | null`, `readonly preview: { gameId: string; page: number } | null`; `TableRegistry.joinParticipant(code, token, round)` — a third argument; `DomainError` gains `'stale-round'`.

`preview` holds a page **number**, never any of the manual's text. Core may not read a manifest — a manifest is a game's own description, and invariant 1 says the platform never knows what a game is. The server resolves the number to a page when it translates, and clamps it before it ever reaches core, because how many pages a manual has is a fact only the manifest holds.

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/table-registry.test.ts`:

```ts
// `newTable` and `makeRegistry` already exist at the top of this file:
// `openTable` can refuse, and unwrapping that refusal is what the helper is
// for. Use them; do not add a second way to obtain a table.
describe('the round marker', () => {
  it('starts at one', () => {
    const registry = makeRegistry()
    expect(newTable(registry).round).toBe(1)
  })

  it('admits a phone presenting the current round', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    const result = registry.joinParticipant(table.code, undefined, table.round)
    expect('error' in result).toBe(false)
  })

  it('refuses a phone presenting a stale round', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    expect(registry.joinParticipant(table.code, undefined, 0)).toEqual({ error: 'stale-round' })
  })

  it('admits a phone presenting no round at all, which is a deliberate arrival', () => {
    const registry = makeRegistry()
    const table = newTable(registry)
    const result = registry.joinParticipant(table.code, undefined, undefined)
    expect('error' in result).toBe(false)
  })
})
```

The last case is the one that matters: someone who typed the code carries no marker, and typing is as deliberate as scanning. Without it the rule has a hole that only appears months later, on the one path nobody tests.

- [ ] **Step 2: Run the test and confirm it fails**

Run through PowerShell: `npx vitest run packages/core/src/table-registry.test.ts`

Expected: FAIL — `joinParticipant` takes two arguments and `'stale-round'` is not a `DomainError`.

- [ ] **Step 3: Widen the phase, the table and the error**

In `packages/core/src/table.ts`:

```ts
export type TablePhase =
  | 'awaiting-host'
  | 'choosing-game'
  | 'seating'
  | 'playing'
  | 'paused'
  | 'awaiting-seat'
  | 'finished'
```

`Table` gains, all `readonly` on the exported shape and mutable on the registry's internal one:

```ts
  readonly round: number
  readonly chosenGameId: string | null
  readonly preview: { readonly gameId: string; readonly page: number } | null
```

In `packages/core/src/views.ts`, add `'stale-round'` to `DomainError`. The `Record<DomainError, ErrorCode>` in `apps/server/src/translate.ts` will fail to compile until it is updated — which is the exhaustiveness guard working, and the reason it exists.

That update needs a matching `'stale-round'` member on `ErrorCode` in `packages/protocol/src/messages.ts`. Add **only** that one member here. Every other protocol change — the new messages, the new snapshots, the version bump — belongs to Task 6, and adding any of it now would leave Task 6 editing a file it did not expect to find half-changed.

- [ ] **Step 4: Check the round on arrival**

In `joinParticipant`, before anything else:

```ts
  /**
   * A stale marker means this phone is resuming a session the table has moved
   * past — a page left open in a pocket, reconnecting on its own. Refusing it
   * is what stops a seat being taken by nobody.
   *
   * No marker at all means someone typed the code, which is as deliberate an
   * act as scanning, so it is admitted and assigned the current round.
   */
  if (round !== undefined && round !== table.round) return { error: 'stale-round' }
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS. Update `apps/server/src/translate.ts` to map `'stale-round'` to a new `ErrorCode` of the same name, added to `packages/protocol/src/messages.ts`.

- [ ] **Step 6: Commit**

```bash
git add packages/core packages/protocol apps/server
git commit -m "Widen the table's phases and add the round marker

The marker lives in the phone's session rather than in the address,
because a typed code carries no address parameter and would otherwise be a
permanent way around the rule."
```

---

### Task 4: Seats

**Files:**
- Create: `packages/core/src/seats.ts`
- Test: `packages/core/src/seats.test.ts`
- Modify: `packages/core/src/table.ts`, `packages/core/src/table-registry.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/table-registry.test.ts`

**Interfaces:**
- Consumes: `GameManifest` from `@m8/contract`, `Participant` from `./table.js`.
- Produces: `interface Seat { readonly number: number; readonly occupantId: string | null }`; `createSeats(max: number): Seat[]`; `firstFreeSeat(seats): Seat | undefined`; `seatOf(seats, participantId): Seat | undefined`; `occupiedCount(seats): number`; `canStart(seats, min): boolean`. `Table` gains `readonly seats: readonly Seat[]`, empty until a game is chosen. `TableRegistry` gains `chooseGame(code, participantId, gameId, seats: { min: number; max: number }): { error: DomainError } | undefined` and `setHostPlaying(code, participantId, playing: boolean): { error: DomainError } | undefined`.

`chooseGame` takes the seat range as a plain pair of numbers, not a `GameManifest`. `packages/core` must not import `@m8/contract`: a manifest is a game describing itself, and invariant 1 says the platform never knows what a game is. The server reads the manifest and passes core the two numbers it is entitled to know.

- [ ] **Step 1: Write the failing test for the seat helpers**

`packages/core/src/seats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { canStart, createSeats, firstFreeSeat, occupiedCount, seatOf } from './seats.js'

describe('createSeats', () => {
  it('creates the game maximum, numbered from one, all empty', () => {
    const seats = createSeats(4)
    expect(seats.map((seat) => seat.number)).toEqual([1, 2, 3, 4])
    expect(seats.every((seat) => seat.occupantId === null)).toBe(true)
  })
})

describe('firstFreeSeat', () => {
  it('is the lowest-numbered empty seat', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: null },
      { number: 3, occupantId: null },
    ]
    expect(firstFreeSeat(seats)?.number).toBe(2)
  })

  it('is undefined when every seat is taken', () => {
    expect(firstFreeSeat([{ number: 1, occupantId: 'p-1' }])).toBeUndefined()
  })
})

describe('seatOf', () => {
  it('finds the seat a participant occupies', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: 'p-2' },
    ]
    expect(seatOf(seats, 'p-2')?.number).toBe(2)
  })

  it('is undefined for someone not seated', () => {
    expect(seatOf([{ number: 1, occupantId: null }], 'p-1')).toBeUndefined()
  })
})

describe('canStart', () => {
  it('is false below the minimum', () => {
    expect(canStart([{ number: 1, occupantId: 'p-1' }, { number: 2, occupantId: null }], 2)).toBe(false)
  })

  it('is true at the minimum, even with a seat still empty', () => {
    const seats = [
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: 'p-2' },
      { number: 3, occupantId: null },
    ]
    expect(canStart(seats, 2)).toBe(true)
  })
})

describe('occupiedCount', () => {
  it('counts only taken seats', () => {
    expect(occupiedCount([
      { number: 1, occupantId: 'p-1' },
      { number: 2, occupantId: null },
    ])).toBe(1)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run through PowerShell: `npx vitest run packages/core/src/seats.test.ts`

Expected: FAIL — `Failed to resolve import "./seats.js"`.

- [ ] **Step 3: Write the helpers**

`packages/core/src/seats.ts`:

```ts
/**
 * A role in a game, not a person. A seat references whoever currently occupies
 * it and never owns them, which is what lets one concept carry rotation,
 * reconnection and handover.
 */
export interface Seat {
  readonly number: number
  readonly occupantId: string | null
}

export function createSeats(max: number): Seat[] {
  return Array.from({ length: max }, (_unused, index) => ({
    number: index + 1,
    occupantId: null,
  }))
}

export function firstFreeSeat(seats: readonly Seat[]): Seat | undefined {
  return seats.find((seat) => seat.occupantId === null)
}

export function seatOf(seats: readonly Seat[], participantId: string): Seat | undefined {
  return seats.find((seat) => seat.occupantId === participantId)
}

export function occupiedCount(seats: readonly Seat[]): number {
  return seats.filter((seat) => seat.occupantId !== null).length
}

/** Starting needs the manifest's minimum seated. A game whose minimum is below
 * its maximum may therefore begin with a chair still empty — and that chair
 * stays closed for the match, because the game builds its state from the seats
 * that were occupied when it started. */
export function canStart(seats: readonly Seat[], min: number): boolean {
  return occupiedCount(seats) >= min
}
```

- [ ] **Step 4: Write the failing registry test**

Add to `packages/core/src/table-registry.test.ts`:

```ts
const TIC_TAC_TOE = { min: 2, max: 2 }

describe('choosing a game', () => {
  it('is refused for anyone without the baton', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    const other = join(registry, code)
    expect(registry.chooseGame(code, other.id, 'tic-tac-toe', TIC_TAC_TOE)).toEqual({
      error: 'not-allowed',
    })
  })

  it('creates the game maximum in seats and moves to seating', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(table.phase).toBe('seating')
    expect(table.seats).toHaveLength(2)
  })

  it('seats the host, because wanting to play is the common case', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBe(host.id)
  })
})

describe('the host stepping out', () => {
  it('frees the seat', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBeNull()
  })

  it('lets him sit again while a seat is free', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    registry.setHostPlaying(code, host.id, true)
    expect(registry.getTable(code)!.seats[0]?.occupantId).toBe(host.id)
  })

  it('refuses to seat him when the table is full', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    registry.setHostPlaying(code, host.id, false)
    join(registry, code)
    join(registry, code)
    expect(registry.setHostPlaying(code, host.id, true)).toEqual({ error: 'table-full' })
  })
})

describe('joining once a game is chosen', () => {
  it('is refused before a game is chosen', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    join(registry, code)
    expect(registry.joinParticipant(code, undefined, undefined)).toEqual({ error: 'not-allowed' })
  })

  it('claims a seat on arrival, before any nickname is set', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const second = join(registry, code)
    expect(registry.getTable(code)!.seats[1]?.occupantId).toBe(second.id)
    expect(second.nickname).toBe('')
  })

  it('refuses arrival number three at a two-seat table', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    join(registry, code)
    expect(registry.joinParticipant(code, undefined, undefined)).toEqual({ error: 'table-full' })
  })
})
```

Add a `join(registry, code)` helper beside the existing `newTable`, calling `joinParticipant(code, undefined, undefined)` and throwing on an error result, so each test reads as the scene it describes. `newTable` and `makeRegistry` are already there — use them rather than adding a second way to obtain a table.

- [ ] **Step 5: Implement `chooseGame`, `setHostPlaying`, and seat claiming on arrival**

In `TableRegistry`: `chooseGame` refuses anyone who is not the baton holder, sets `chosenGameId`, calls `createSeats(manifest.max)`, seats the baton holder in seat 1, clears `preview`, and moves the phase to `'seating'`. `setHostPlaying` refuses anyone but the baton holder, and either frees his seat or claims `firstFreeSeat`, returning `{ error: 'table-full' }` when none is free. `joinParticipant` refuses with `'not-allowed'` while the phase is `'awaiting-host'` and someone already holds the baton, and with `'table-full'` when no seat is free; otherwise it claims `firstFreeSeat` for the arriving participant.

- [ ] **Step 6: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS, with 19 new tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "Add seats, claimed on arrival rather than after naming

Reserving the seat only once a nickname is typed would let two people type
for the last chair and one discover the loss on pressing confirm."
```

---

### Task 5: The two states — the table's and the device's

**Files:**
- Modify: `packages/core/src/views.ts`, `packages/core/src/table-registry.ts`
- Delete: `packages/core/src/events.ts`
- Test: `packages/core/src/table-registry.test.ts`
- Modify: `CLAUDE.md`

**Interfaces:**
- Produces: `TableView` gains `phase`, `seats: readonly SeatView[]`, `chosenGameId`, `preview`, `qrVisible: boolean`; `interface SeatView { number, occupant: ParticipantView | null }`; `interface DeviceView { participantId, seatNumber: number | null, hasBaton: boolean, canChooseGame: boolean, canStart: boolean, playersNeeded: number, phase }`; `TableRegistry.deviceView(table, participantId): DeviceView`.

- [ ] **Step 1: Write the failing test**

```ts
describe('the device view', () => {
  it('tells the baton holder he may choose a game', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, host.id).canChooseGame).toBe(true)
  })

  it('stops offering the choice once a game is chosen', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, host.id).canChooseGame).toBe(false)
  })

  it('never offers the choice to anyone without the baton', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const other = join(registry, code)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, other.id).canChooseGame).toBe(false)
  })

  it('says how many more players are needed rather than the arithmetic', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const table = registry.getTable(code)!
    expect(registry.deviceView(table, host.id)).toMatchObject({
      canStart: false,
      playersNeeded: 1,
    })
  })

  it('carries nothing about the table', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    const host = join(registry, code)
    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    const view = registry.deviceView(registry.getTable(code)!, host.id)
    expect(Object.keys(view).sort()).toEqual([
      'canChooseGame',
      'canStart',
      'hasBaton',
      'participantId',
      'phase',
      'playersNeeded',
      'seatNumber',
    ])
  })
})

describe('the table view', () => {
  it('shows the QR exactly while someone may join', () => {
    const registry = makeRegistry()
    const code = newTable(registry).code
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(true)

    const host = join(registry, code)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(false)

    registry.chooseGame(code, host.id, 'tic-tac-toe', TIC_TAC_TOE)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(true)

    join(registry, code)
    expect(registry.snapshot(registry.getTable(code)!).qrVisible).toBe(false)
  })
})
```

The third test is the structural one: a `DeviceView` that grew a `code` or a `participants` field would fail it, which is how the rule that a phone holds nothing of the table's stays enforced after this plan is finished.

The QR test walks the whole rule in one scene, which is how the rule is stated in the spec — one sentence, four states.

- [ ] **Step 2: Run it and confirm it fails**

Run through PowerShell: `npx vitest run packages/core/src/table-registry.test.ts`

Expected: FAIL — `deviceView` is not a function, `qrVisible` is undefined.

- [ ] **Step 3: Write the views**

`DeviceView` carries decisions rather than data: `canStart` and `playersNeeded` rather than seat counts and minimums. `qrVisible` is computed from the phase and the free-seat count in one place, so the rule cannot drift between the screen and the server.

`canChooseGame` is `hasBaton && chosenGameId === null`, not `hasBaton` alone. The design has no path for changing the game mid-seating — a host who wants a different game ends the round and everyone rescans — and Task 4's `chooseGame` guard already refuses a second choice. A device state that offers an action the server will reject is the exact failure this split exists to prevent, so the second test above, the one asserting it goes false, is the one that pins the rule.

- [ ] **Step 4: Delete the domain events**

Remove `packages/core/src/events.ts` and its export. Remove `#applyEvents` and its four call sites from `apps/server/src/session.ts`. Every registry method that returned `DomainEvent[]` now returns nothing or a result value.

Amend architectural invariant 8 in `CLAUDE.md` to describe what actually holds:

> 8. **`packages/core` performs no I/O.** No Fastify, no Socket.IO, no timers, no clock of its own — time enters only as an injected `Clock` dependency, never read from the system directly. It owns its own vocabulary — `TableView`, `DeviceView`, `DomainError` — and `apps/server` translates that to wire messages. It emits no events: a seam that carried nothing for two milestones was a claim, not a boundary.

The qualifier is load-bearing. `TableRegistry` does call `this.#clock.now()`, twice — a flat "no clock reads" would be false against the file this task edits, and a working agreement that asserts a guarantee the code does not provide is the defect this repository keeps finding.

- [ ] **Step 5: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core apps/server CLAUDE.md
git commit -m "Split what the table holds from what a device holds

The phone receives decisions rather than data, so the rule stays on the
server instead of being reimplemented on the device — which is where two
screens start to disagree.

Removes the domain-event seam, which was emitted and discarded at every
call site since it was written."
```

---

### Task 6: The protocol

**Files:**
- Modify: `packages/protocol/src/messages.ts`, `packages/protocol/src/validate.ts`
- Test: `packages/protocol/src/validate.test.ts`

**Interfaces:**
- Produces: `ClientToServer` gains `{ type: 'previewGame'; gameId: string }`, `{ type: 'manualPage'; page: number }`, `{ type: 'chooseGame'; gameId: string }`, `{ type: 'setHostPlaying'; playing: boolean }`; `hello` gains `round?: number`; `ServerToClient` gains `{ type: 'deviceState'; device: DeviceSnapshot }`; plus the three types below.

```ts
export interface SeatSnapshot {
  readonly number: number
  readonly occupant: ParticipantSnapshot | null
}

/**
 * A manual page, already resolved from the manifest by the server. The
 * screen receives text rather than a page number because it cannot read a
 * manifest — only the server can, and only the server should.
 *
 * Both languages travel together. Which one the room reads is a decision
 * this plan does not make, and carrying both means making it later is a
 * change to one constant in the screen rather than a change to the wire.
 * One page is about sixty words, so the cost of carrying both is nothing.
 */
export interface PreviewSnapshot {
  readonly gameId: string
  readonly cover: string
  readonly name: Record<Locale, string>
  readonly page: number
  readonly pageCount: number
  readonly title: Record<Locale, string>
  readonly lines: Record<Locale, readonly string[]>
}

export interface TableSnapshot {
  readonly code: string
  readonly phase: TablePhaseName
  readonly participants: readonly ParticipantSnapshot[]
  readonly seats: readonly SeatSnapshot[]
  readonly qrVisible: boolean
  readonly preview: PreviewSnapshot | null
}

/** What one phone is told. There is no table here, and no manual. */
export interface DeviceSnapshot {
  readonly participantId: string
  readonly phase: TablePhaseName
  readonly seatNumber: number | null
  readonly hasBaton: boolean
  readonly canChooseGame: boolean
  readonly canStart: boolean
  readonly playersNeeded: number
}
```

`TablePhaseName` is the wire's own union with the same seven members as core's `TablePhase`, written out rather than imported: `@m8/protocol` must not depend on `@m8/core`, and `translate.ts` is where the two are proved to agree. `Locale` is re-declared here for the same reason — `apps/server/src/limits.test.ts` already exists to catch exactly this kind of deliberate duplication drifting, and gets a case for it.

- [ ] **Step 1: Write the failing validator tests**

For each new message: one accept case, one reject case for every field of the wrong type, and — for `manualPage` — a reject for a negative page. Follow the existing file's shape exactly; every branch of `parseInbound` gets a case.

Add the case that matters most:

```ts
it('accepts hello with a round marker', () => {
  const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP', round: 3 }
  expect(parseInbound(message)).toEqual(message)
})

it('accepts hello without a round marker, which is a typed arrival', () => {
  const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' }
  expect(parseInbound(message)).toEqual(message)
})

it('rejects a round that is not a number', () => {
  expect(
    parseInbound({ type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP', round: '3' }),
  ).toBeNull()
})

it('strips an unknown field from every new message', () => {
  expect(parseInbound({ type: 'chooseGame', gameId: 'chess', evil: 1 })).toEqual({
    type: 'chooseGame',
    gameId: 'chess',
  })
})
```

- [ ] **Step 2: Run and confirm they fail**

Run through PowerShell: `npx vitest run packages/protocol/src/validate.test.ts`

Expected: FAIL — the new types do not exist.

- [ ] **Step 3: Write the messages and the validator branches**

Bump `PROTOCOL_VERSION` to `2`. A phone holding a stale page is told to reload, which is what that constant is for.

- [ ] **Step 4: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/protocol
git commit -m "Add the catalogue messages and the device state to the wire

Bumps the protocol version, so a phone holding yesterday's page is told to
reload rather than silently speaking a language the server retired."
```

---

### Task 7: The server

**Files:**
- Modify: `apps/server/src/session.ts`, `apps/server/src/translate.ts`
- Test: `apps/server/src/session.test.ts`, `apps/server/src/translate.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3-6.
- Produces: a `Session` that sends `tableState` to screens and `deviceState` to phones, and handles the four new messages.

- [ ] **Step 1: Write the failing session tests**

Drive them through `FakeTransport` exactly as the existing tests do. The scenes to cover:

- a screen receives `tableState` and never `deviceState`;
- a phone receives `deviceState` and **never** `tableState` — assert on the message types the fake recorded, not on their contents, so the guarantee is about what was sent rather than about what a payload happened to contain;
- `previewGame` from the baton holder puts a preview on the table; from anyone else it is refused;
- `manualPage` moves the page and clamps at both ends;
- `chooseGame` creates seats and every device is told;
- a phone joining before a game is chosen is refused;
- a phone presenting a stale round is refused with `stale-round`;
- a `chooseGame` naming a game that is not in the catalogue is refused, and the table is unchanged;
- a `manualPage` beyond the last page clamps to the last rather than erroring, and below zero clamps to the first.

- [ ] **Step 2: Run and confirm they fail**

Run through PowerShell: `npx vitest run apps/server/src/session.test.ts`

Expected: FAIL — the handlers do not exist.

- [ ] **Step 3: Implement the handlers and the split broadcast**

`#broadcast` becomes two paths: the screen attachment receives the translated `TableView`; every phone attachment receives its own translated `DeviceView`. There is no filtered table for phones and no code path that could produce one.

The server owns the two things core cannot:

- **Clamping.** `manualPage` arrives, the server looks up the manifest, clamps the page to `[0, pageCount - 1]`, and passes the clamped number to core. A page beyond the end is clamped rather than refused — a page arrow held down on a phone should stop at the last page, not raise an error on the television.
- **Resolving.** `translateTable` takes a second argument, the catalogue, and turns core's `{ gameId, page }` into a `PreviewSnapshot` with the cover URL, the name and that page's text. A `gameId` with no manifest translates to `preview: null` rather than throwing: it can only happen if a game is withdrawn between two messages, and a screen briefly showing a bare table beats a screen showing a stack trace.

Both belong here because `translate.ts` is already the one file that knows two vocabularies, and neither `@m8/core` nor `@m8/protocol` may learn what a manifest is.

- [ ] **Step 4: Run the tests and confirm they pass**

Run through PowerShell: `npm test`

Expected: PASS.

- [ ] **Step 5: Add the real-transport test**

One integration test in `apps/server/src/socket-transport.integration.test.ts`: a screen and two phones over real sockets, the host chooses a game, both phones receive a `deviceState` and neither receives a `tableState`.

- [ ] **Step 6: Commit**

```bash
git add apps/server
git commit -m "Send the table to the screen and its own state to each phone

There is no filtered table for a phone because there is no code path that
could produce one."
```

---

### Task 8: The large screen — choosing a game

**Files:**
- Modify: `apps/tv/src/render.ts`, `apps/tv/src/styles.css`, `apps/tv/src/main.ts`
- Test: `apps/tv/src/render.test.ts`

**Interfaces:**
- Produces: `renderChoosing(root, view)` — the box on the left of the table, the manual page on the right.

- [ ] **Step 1: Write the failing test**

Cover: the cover image `src` is the URL the snapshot carries; the page's title and every line appear; the page indicator reads "2 of 3" from `page` and `pageCount`; nothing interactive is rendered; rendering twice replaces rather than appends; and — the one that protects the identity — the box and the notebook sit on the table surface, asserted through the same stylesheet-reading helpers `scripts/tv-safe-area.test.ts` already uses.

One more, because it is the constraint most easily lost: a page whose lines are long must not push the notebook past the table's edge. Assert the wrapping container has a fixed width and `overflow: hidden`, so a manual that slips past the word guard degrades to clipped text rather than to a broken table.

The screen picks its language with a single exported constant, `SCREEN_LOCALE = 'pt-BR'`, read from the snapshot's `Record<Locale, …>` fields. That constant is the whole surface a language switch will later touch.

The wire now carries seven phases and this plan draws three of them — awaiting-host, choosing-game and seating. Nothing here can start a match, so `playing`, `paused`, `awaiting-seat` and `finished` are unreachable. Route them to the existing waiting screen and pin that with a test naming all four. A `switch` that silently renders nothing would show a blank television, which is the one failure the target cannot be debugged through; Plan 2b replaces the fallback screen by screen.

- [ ] **Step 2: Run and confirm it fails**

Run through PowerShell: `npx vitest run apps/tv/src/render.test.ts`

- [ ] **Step 3: Implement**

The box is a rounded rectangle carrying the cover; the manual is a lighter rectangle beside it holding the page's title, its lines and a small page indicator.

Both are placed through the existing scatter in `apps/tv/src/tilt.ts` — `arrangePieces(code, 2)` for the placements, then `pieceTransform`, `pieceSpacing` and `pieceShadow` — so a box reads as an object set down on the table rather than as a panel. Reuse that module rather than inventing a second scattering rule: it is one mechanism, already measured across the whole code space, and its separation rules already guarantee the two pieces do not land at the same angle.

- [ ] **Step 4: Extend the safe-area proof**

Add the box and the notebook to `scripts/tv-safe-area.ts`, and prove at both resolutions that they sit inside the table surface at every tilt in range, exactly as the code tiles and the QR already are.

- [ ] **Step 5: Run everything**

Run through PowerShell: `npm test`, then `npm run guards` through Bash.

Expected: all pass; report the bundle figure.

- [ ] **Step 6: Commit**

```bash
git add apps/tv scripts
git commit -m "Put the game's box and its manual on the table

Reuses the existing scatter so a box reads as something set down rather
than as a panel, and extends the geometry proof to both new pieces."
```

---

### Task 9: The large screen — seats

**Files:**
- Modify: `apps/tv/src/render.ts`, `apps/tv/src/styles.css`
- Test: `apps/tv/src/render.test.ts`

**Interfaces:**
- Produces: `renderSeating(root, view)` — the seats around the table, the QR while one is free, the baton holder marked.

- [ ] **Step 1: Write the failing test**

Cover: a seat with an occupant shows their avatar and nickname in that **seat's** colour; an empty seat renders as an empty place rather than being omitted; the QR appears while a seat is free and disappears when the last fills; the baton holder is marked even when he holds no seat; nothing interactive; and the eight-participant safe-area sweep still closes.

- [ ] **Step 2: Run and confirm it fails**

- [ ] **Step 3: Implement, and move colour from arrival to seat**

`packages/tokens/src/person-color.ts` currently exports `personColor(arrivalIndex: number)`, zero-based, and its own doc comment argues at length for why arrival order shifts when somebody leaves. Replace it with `seatColor(seatNumber: number)`, one-based, so seat 1 is `--m8-person-1`; rewrite that comment, because the reasoning it defends no longer applies. Update both call sites — `apps/tv/src/render.ts` and `apps/phone/src/App.tsx` — and `packages/tokens/src/person-color.test.ts`.

`apps/tv/src/render.test.ts` has a test asserting that colours follow arrival order after a departure. It should be replaced, not deleted: assert instead that a seat's colour is unchanged by anyone joining or leaving. The bug class disappears rather than being watched.

The host without a seat is marked by the baton, not by a colour.

- [ ] **Step 4: Run everything**

Run through PowerShell: `npm test`, then `npm run guards`.

- [ ] **Step 5: Commit**

```bash
git add apps/tv packages/tokens
git commit -m "Draw the seats, and give the colour to the seat

Colour indexed by arrival shifted for everyone when somebody left, which
is where the screen and the phones came to disagree. A seat number is
unambiguous, so the class of bug disappears rather than being watched."
```

---

### Task 10: The phone

**Files:**
- Modify: `apps/phone/src/App.tsx`, `apps/phone/src/client.ts`, `apps/phone/src/screen.ts`
- Create: `apps/phone/src/catalogue.ts`
- Test: `apps/phone/src/catalogue.test.ts`, `apps/phone/src/screen.test.ts`

**Interfaces:**
- Produces: `fetchCatalogue(): Promise<PhoneCatalogueEntry[]>`; `searchCatalogue(entries, query): PhoneCatalogueEntry[]`; `screenFor` extended with the catalogue and seating screens.

- [ ] **Step 1: Write the failing tests**

`searchCatalogue` is a pure function and gets real coverage: matches on either locale's name, is case- and accent-insensitive, an empty query returns everything, and no match returns nothing. `screenFor` gains cases for choosing, seating, waiting and started, driven by `DeviceSnapshot` — including the case the boolean form got wrong: a device that was seated and is no longer.

- [ ] **Step 2: Run and confirm they fail**

- [ ] **Step 3: Implement**

The catalogue screen lists games with cover, name and tagline, with a search field. Tapping one sends `previewGame`; the phone then shows the cover, the page arrows and "play this" — **and no manual text**, which it does not have.

The seating screen shows the person's own seat and colour, the host's switch, and the start control with its reason when disabled — all from `DeviceSnapshot`, never from a table.

- [ ] **Step 4: Run everything**

Run through PowerShell: `npm test`; build both apps.

- [ ] **Step 5: Commit**

```bash
git add apps/phone
git commit -m "Give the phone a catalogue, a search and the host's controls

The phone renders no manual because it is sent none; reading the rules is
something the room does together, from the screen."
```

---

### Task 11: The per-game asset budget

**Files:**
- Create: `scripts/check-game-assets.mjs`, `scripts/game-asset-budget.ts`
- Test: `scripts/game-asset-budget.test.ts`, `scripts/check-game-assets.test.ts`
- Modify: `package.json`, `budget.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `npm run guard:assets`, and `budget.json` gains `gameAssetBytes`.

- [ ] **Step 1: Write the failing tests**

The pure part decides whether a game's assets are over budget, including the boundary where the total equals the ceiling. The subprocess part runs the guard against fixture directories and asserts on **output content**, not only the exit code: a guard that passes while checking nothing is the failure this repository has already shipped once.

- [ ] **Step 2: Run and confirm they fail**

- [ ] **Step 3: Implement**

The guard walks `packages/games/*/assets/`, totals each directory, and checks it against `gameAssetBytes`. It fails loudly when a game package exists with no measurable asset — a guard reporting success over an empty directory is worse than no guard, and this repository has already shipped that failure once.

Follow `scripts/check-tv-size.mjs` for the entry-point shape, including `pathToFileURL(process.argv[1]).href` for the main-module check: the plain `file://${process.argv[1]}` comparison never matches on Windows, which is exactly how two earlier guards passed without checking anything.

The shell's budget is untouched: a heavy cover must not be able to push the platform's own budget around. That is the boundary that keeps games plug-ins.

- [ ] **Step 4: Wire it into `npm run guards` and CI**

- [ ] **Step 5: Run everything and set the ceiling from measurement**

Run the guard, read the real figures, set `gameAssetBytes` to the largest plus roughly a fifth, and record the measured number in the commit message.

- [ ] **Step 6: Commit**

```bash
git add scripts budget.json package.json .github
git commit -m "Give each game its own asset budget

A game's artwork must not be able to push the platform's budget around;
that boundary is what keeps a game a plug-in."
```

---

### Task 12: The television run

**Files:**
- Modify: `docs/tv-smoke-test.md`

- [ ] **Step 1: Add the steps this plan makes checkable**

Choosing a game from the phone and seeing the box and manual appear; turning pages and watching them turn on the screen; the QR appearing when seats are created and disappearing when the last fills; a seat's colour matching the phone in that seat; the start control lighting when the minimum is seated; and a phone left open across a "clear seats" being refused rather than silently re-seated.

That last one is the round marker, and it is the only step that proves it: no test can distinguish scanning from reloading, because at the level of an address they are the same act.

- [ ] **Step 2: Run the checklist on the real television**

Record the outcome, the set's model, and the negotiated transport.

- [ ] **Step 3: Commit**

```bash
git add docs/tv-smoke-test.md
git commit -m "Extend the television checklist to the catalogue and seats"
```

---

## Self-review notes

**Spec coverage.** §3.1 no joining before a game (Task 4); §3.2 the QR rule (Tasks 5, 9); §3.3 the host need not play (Tasks 4, 10); §3.4 the two states (Tasks 5, 7); §4 phases (Task 3); §4.1 the round marker (Tasks 3, 6, 12); §5.1 manifest and the manual guard (Task 1); §5.2 the manual never reaching the phone (Tasks 2, 10); §5.3 the three messages (Tasks 6, 7, 10); §5.4 the endpoint and per-game assets (Tasks 2, 11); §6.1-6.3 seats (Tasks 4, 9); §6.5 colour by seat (Task 9); §6.6 capacity (Task 1); §9.3 removing the domain events (Task 5).

**Deferred to Plan 2b, deliberately:** §4.2's three end-of-match actions, §6.4's entry closing at start, and all of §7 and §8 — the lifecycle and the contract. Each needs a match to exist.

**Known gap accepted:** `chooseGame` does not check `contractVersion`, because nothing implements the contract yet. Plan 2b adds the check when it adds the rules.

## The plan that follows

**Plan 2b — the contract and the match lifecycle.** The `GameRules` interface defined by the lifecycle that consumes it; a test-double game; starting a match from the occupied seats; turns; pause on a drop and the 60-second window; a vacant seat blocking play; handover to whoever scans; the three ways a match ends; and the baton preferring a connected successor.
