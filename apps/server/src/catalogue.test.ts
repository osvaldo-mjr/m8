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
