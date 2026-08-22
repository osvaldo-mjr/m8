// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A cover has to survive being parsed, not merely being served.
 *
 * All four shipped covers were valid-looking SVG that rendered as nothing at
 * all, on the television and on the phone alike. They served perfectly — a
 * 200, `image/svg+xml`, the right bytes, requested by both screens — and were
 * drawn by neither, because each named its colour tokens in full inside an
 * XML comment and a pair of dashes is illegal there. Served as
 * `image/svg+xml`, an SVG is parsed as XML strictly: one violation and the
 * document is discarded whole.
 *
 * Nothing in the repository had ever looked at a cover as anything but a
 * file, so nothing could tell "arrives" from "renders". This parses each one
 * the way a browser does rather than checking the single rule that was
 * broken, because the next violation will be a different rule.
 *
 * It walks the files off disk rather than reaching them through
 * `GAME_ASSET_ROOTS`, and locates them from the working directory rather than
 * from `import.meta.url`: both of those resolve through a game package's own
 * module URL, and neither survives the browser environment this file needs in
 * order to have a parser at all.
 */
const GAMES_DIR = join(process.cwd(), 'packages', 'games')

function covers(): { id: string; source: string }[] {
  return readdirSync(GAMES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((game) => {
      const assets = join(GAMES_DIR, game.name, 'assets')
      return readdirSync(assets)
        .filter((file) => file.endsWith('.svg'))
        .map((file) => ({
          id: `${game.name}/${file}`,
          source: readFileSync(join(assets, file), 'utf8'),
        }))
    })
}

describe('every game cover', () => {
  it('is there to be checked at all', () => {
    // A sweep over an empty list passes while proving nothing, which is the
    // failure this repository has shipped before.
    expect(covers().length).toBeGreaterThan(0)
  })

  it('parses as XML, the way a browser asked to draw it does', () => {
    for (const cover of covers()) {
      const doc = new DOMParser().parseFromString(cover.source, 'image/svg+xml')
      const failure = doc.querySelector('parsererror')?.textContent?.trim() ?? null
      expect({ id: cover.id, failure }).toEqual({ id: cover.id, failure: null })
    }
  })

  it('draws something once parsed', () => {
    // A file can be well-formed XML and still paint nothing — an empty root,
    // or a root that is not an `<svg>`.
    for (const cover of covers()) {
      const doc = new DOMParser().parseFromString(cover.source, 'image/svg+xml')
      const root = doc.documentElement
      expect({ id: cover.id, root: root.nodeName, shapes: root.children.length > 0 }).toEqual({
        id: cover.id,
        root: 'svg',
        shapes: true,
      })
    }
  })
})
