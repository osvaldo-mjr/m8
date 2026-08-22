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
