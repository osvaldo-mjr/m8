import type { PhoneCatalogueEntry } from '@m8/protocol'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampManualPage, fetchCatalogue, searchCatalogue } from './catalogue.js'

/**
 * Fixtures, not a copy of the shipped catalogue. They carry real names because
 * what is under test is the folding — accents, case, and the word a Brazilian
 * would actually type — and inventing words with the same properties would
 * only obscure that. Nothing here asserts that the shipped catalogue says any
 * of this: the real manifests are guarded where they live
 * (`packages/contract`'s `manifestFaults`, and `apps/server/src/catalogue.test.ts`),
 * so these going out of date costs nothing and hides nothing.
 */
const ticTacToe: PhoneCatalogueEntry = {
  id: 'tic-tac-toe',
  name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
  tagline: { 'pt-BR': 'Três em linha, e a linha decide', en: 'Three in a row decides it' },
  cover: '/covers/tic-tac-toe/cover.svg',
  pageCount: 3,
  status: 'playable',
}

const chess: PhoneCatalogueEntry = {
  id: 'chess',
  name: { 'pt-BR': 'Xadrez', en: 'Chess' },
  tagline: { 'pt-BR': 'Trinta e duas peças, um rei a proteger', en: 'Thirty-two pieces, one king to protect' },
  cover: '/covers/chess/cover.svg',
  pageCount: 3,
  status: 'coming-soon',
}

const draughts: PhoneCatalogueEntry = {
  id: 'draughts',
  name: { 'pt-BR': 'Damas', en: 'Draughts' },
  tagline: { 'pt-BR': 'Avance na diagonal, capture saltando', en: 'Advance diagonally, capture by jumping' },
  cover: '/covers/draughts/cover.svg',
  pageCount: 3,
  status: 'coming-soon',
}

const dominoes: PhoneCatalogueEntry = {
  id: 'dominoes',
  name: { 'pt-BR': 'Dominó', en: 'Dominoes' },
  tagline: { 'pt-BR': 'Encaixe as pontas até esvaziar a mão', en: 'Match the ends until your hand is empty' },
  cover: '/covers/dominoes/cover.svg',
  pageCount: 3,
  status: 'coming-soon',
}

const CATALOGUE = [ticTacToe, chess, draughts, dominoes]

describe('searchCatalogue', () => {
  it('matches a pt-BR name, case-insensitively', () => {
    expect(searchCatalogue(CATALOGUE, 'DAMAS')).toEqual([draughts])
  })

  it('matches an en name, case-insensitively', () => {
    expect(searchCatalogue(CATALOGUE, 'chess')).toEqual([chess])
  })

  it('matches a substring of a pt-BR name', () => {
    // "velha" alone, not the full "Jogo da velha" — a Brazilian typing the
    // word that actually names the game, not the whole phrase.
    expect(searchCatalogue(CATALOGUE, 'velha')).toEqual([ticTacToe])
  })

  it('is accent-insensitive: "domino" without the acute finds "Dominó"', () => {
    expect(searchCatalogue(CATALOGUE, 'domino')).toEqual([dominoes])
  })

  it('is accent-insensitive the other way too: a typed accent still finds the plain form', () => {
    expect(searchCatalogue(CATALOGUE, 'chéss')).toEqual([chess])
  })

  it('returns every entry for an empty query', () => {
    expect(searchCatalogue(CATALOGUE, '')).toEqual(CATALOGUE)
  })

  it('returns every entry for a whitespace-only query', () => {
    expect(searchCatalogue(CATALOGUE, '   ')).toEqual(CATALOGUE)
  })

  it('returns nothing for a query matching no entry', () => {
    expect(searchCatalogue(CATALOGUE, 'mahjong')).toEqual([])
  })

  it('can match more than one entry', () => {
    // "da" is a substring of both "Jogo da velha" and "Damas" — every entry
    // whose name contains the letter run comes back, in catalogue order.
    expect(searchCatalogue(CATALOGUE, 'da')).toEqual([ticTacToe, draughts])
  })
})

describe('fetchCatalogue', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('fetches the platform catalogue from the games endpoint', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => CATALOGUE,
    }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const entries = await fetchCatalogue()

    expect(fetchMock).toHaveBeenCalledWith('/api/games')
    expect(entries).toEqual(CATALOGUE)
  })

  it('rejects when the server refuses the request', async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => [],
    })) as unknown as typeof fetch

    await expect(fetchCatalogue()).rejects.toThrow(/500/)
  })
})

/**
 * The phone holds its own page number — the wire carries the manual to the
 * large screen and a `DeviceSnapshot` never mentions a preview — so nothing
 * corrects it if it walks past the end. The server clamps what it receives and
 * says nothing about the clamp, which is worse than it sounds: a host who taps
 * `›` three times through a three-page manual leaves his own counter at 3
 * while the screen shows page 3 of 3, and his next `‹` sends 2, which clamps
 * back to the page already showing. The television does not move. One dead tap
 * per overshoot, in front of the room, on the one interaction this plan exists
 * to demonstrate.
 */
describe('clampManualPage', () => {
  it('keeps a page inside the manual', () => {
    expect(clampManualPage(1, 3)).toBe(1)
  })

  it('holds at the last page rather than walking past it', () => {
    expect(clampManualPage(3, 3)).toBe(2)
    expect(clampManualPage(99, 3)).toBe(2)
  })

  it('holds at the first page rather than walking behind it', () => {
    expect(clampManualPage(-1, 3)).toBe(0)
  })

  it('has somewhere to be even for a game whose page count has not arrived yet', () => {
    // The catalogue is fetched over HTTP, so a tap between the tap that opened
    // a preview and the fetch landing has no count to clamp against. Zero is
    // the only page such a phone can ask for, and it is a page the server
    // resolves for every manual that exists.
    expect(clampManualPage(1, 0)).toBe(0)
  })
})
