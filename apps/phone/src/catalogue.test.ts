import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchCatalogue, searchCatalogue, type PhoneCatalogueEntry } from './catalogue.js'

const ticTacToe: PhoneCatalogueEntry = {
  id: 'tic-tac-toe',
  name: { 'pt-BR': 'Jogo da velha', en: 'Tic-tac-toe' },
  tagline: { 'pt-BR': 'Três em linha, e a linha decide', en: 'Three in a row decides it' },
  cover: '/covers/tic-tac-toe/cover.svg',
  seats: { min: 2, max: 2 },
  status: 'playable',
}

const chess: PhoneCatalogueEntry = {
  id: 'chess',
  name: { 'pt-BR': 'Xadrez', en: 'Chess' },
  tagline: { 'pt-BR': 'Trinta e duas peças, um rei a proteger', en: 'Thirty-two pieces, one king to protect' },
  cover: '/covers/chess/cover.svg',
  seats: { min: 2, max: 2 },
  status: 'coming-soon',
}

const draughts: PhoneCatalogueEntry = {
  id: 'draughts',
  name: { 'pt-BR': 'Damas', en: 'Draughts' },
  tagline: { 'pt-BR': 'Avance na diagonal, capture saltando', en: 'Advance diagonally, capture by jumping' },
  cover: '/covers/draughts/cover.svg',
  seats: { min: 2, max: 2 },
  status: 'coming-soon',
}

const dominoes: PhoneCatalogueEntry = {
  id: 'dominoes',
  name: { 'pt-BR': 'Dominó', en: 'Dominoes' },
  tagline: { 'pt-BR': 'Encaixe as pontas até esvaziar a mão', en: 'Match the ends until your hand is empty' },
  cover: '/covers/dominoes/cover.svg',
  seats: { min: 2, max: 4 },
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
