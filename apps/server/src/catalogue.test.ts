import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
    expect(Object.keys(entry).sort()).toEqual(['cover', 'id', 'name', 'pageCount', 'status', 'tagline'])
  })

  /**
   * A count, not the pages. The manual itself must never reach a phone — it is
   * read from the large screen by the whole room — but a phone that does not
   * know how many pages exist cannot stop its own page arrows walking past the
   * end, and the server clamps silently, so the next tap back does nothing.
   * A number is the least it can be told that closes that.
   */
  it('carries how many manual pages a game has, without carrying any of them', () => {
    const entry = catalogueForPhone(CATALOGUE).find((e) => e.id === 'tic-tac-toe')!
    const manifest = findManifest('tic-tac-toe')!

    expect(entry.pageCount).toBe(manifest.manual['pt-BR'].length)
    expect(entry.pageCount).toBeGreaterThan(0)
  })

  it('counts the pages every catalogued game actually has', () => {
    for (const entry of catalogueForPhone(CATALOGUE)) {
      const manifest = findManifest(entry.id)!
      expect({ id: entry.id, pages: entry.pageCount }).toEqual({
        id: entry.id,
        pages: Math.min(manifest.manual['pt-BR'].length, manifest.manual.en.length),
      })
    }
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

  it('gives every cover a size it can be drawn at', () => {
    // An SVG carrying only a `viewBox` has no intrinsic size, and an `<img>`
    // asked to draw one paints nothing on the television's Chromium. All
    // four covers shipped that way and were invisible on both screens on the
    // first real run — the files served, with a 200 and the right type, and
    // simply did not appear. Serving correctly is not the same as being
    // drawable, so this asserts the second thing rather than trusting the
    // first.
    for (const manifest of CATALOGUE) {
      const root = GAME_ASSET_ROOTS.get(manifest.id)!
      const source = readFileSync(join(root, manifest.cover), 'utf8')
      const tag = /<svg[^>]*>/.exec(source)?.[0] ?? ''
      expect({ id: manifest.id, sized: /\swidth="/.test(tag) && /\sheight="/.test(tag) }).toEqual({
        id: manifest.id,
        sized: true,
      })
    }
  })
})
