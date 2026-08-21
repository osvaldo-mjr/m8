// @vitest-environment jsdom
import { AVATARS } from '@m8/avatars'
import type { ParticipantSnapshot } from '@m8/protocol'
import { personColor } from '@m8/tokens'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHIPS_ABREAST,
  DISPLAY_FACE_STRINGS,
  DISPLAY_FACE_SUBSET,
  renderError,
  renderTable,
  renderWaiting,
} from './render.js'

/** What a screen on the owner's LAN would actually have been reached at. */
const ADDRESS = '192.168.0.6:3000'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
})

function participant(overrides: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return {
    id: 'p-1',
    nickname: 'Ana',
    avatarId: 'fox',
    connected: true,
    hasBaton: false,
    ...overrides,
  }
}

describe('renderTable', () => {
  it('shows the table code', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    expect(root.textContent).toContain('KXTP')
  })

  it('points the QR image at the server endpoint for that code', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const image = root.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/qr/KXTP.svg')
  })

  it('lists each participant nickname', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: 'Bia' })],
    })
    expect(root.textContent).toContain('Bia')
  })

  it('marks the baton holder', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ hasBaton: true })],
    })
    expect(root.querySelector('[data-baton="true"]')).not.toBeNull()
  })

  it('renders a disconnected participant visibly differently, not just in an attribute', () => {
    // The screen is watched from three metres by people who cannot touch it.
    // An attribute nobody can see is not a signal: this asserts the rendered
    // classes actually differ, which a data-attribute-only marker would fail.
    const online = document.createElement('div')
    renderTable(online, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ connected: true })],
    })
    const offline = document.createElement('div')
    renderTable(offline, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ connected: false })],
    })

    const onlineItem = online.querySelector('li')!
    const offlineItem = offline.querySelector('li')!
    expect(offlineItem.className).not.toBe(onlineItem.className)
  })

  it('says in words that a disconnected participant is reconnecting', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ connected: false })],
    })
    expect(root.textContent).toMatch(/reconnecting/i)
  })

  it('says nothing about reconnecting while everyone is connected', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ connected: true })],
    })
    expect(root.textContent).not.toMatch(/reconnecting/i)
  })

  it('marks a disconnected participant', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ connected: false })],
    })
    expect(root.querySelector('[data-connected="false"]')).not.toBeNull()
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })

  it('renders a nickname as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: hostile })],
    })
    expect(root.textContent).toContain(hostile)
    expect(root.querySelector('img[src="x"]')).toBeNull()
    // The QR code is the only <img> the large screen ever renders.
    expect(root.querySelectorAll('img')).toHaveLength(1)
  })

  it('shows a placeholder for a participant with no nickname yet', () => {
    // Nickname and avatar are chosen in the same submit, so a participant
    // without one has neither.
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: '', avatarId: 'unset' })],
    })
    const item = root.querySelector('li')
    expect(item?.textContent).toBe('…')
  })

  it('draws the avatar glyph beside the nickname', () => {
    const fox = AVATARS.find((avatar) => avatar.id === 'fox')!
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: 'Bia', avatarId: 'fox' })],
    })

    const item = root.querySelector('li')
    expect(item?.textContent).toContain(fox.glyph)
    expect(item?.textContent).toContain('Bia')
  })

  it('draws every avatar in the shared catalogue', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: AVATARS.map((avatar, index) =>
        participant({ id: `p-${index}`, nickname: `P${index}`, avatarId: avatar.id }),
      ),
    })

    for (const avatar of AVATARS) {
      expect(root.textContent).toContain(avatar.glyph)
    }
  })

  it('draws no glyph for a participant who has not chosen an avatar', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: 'Bia', avatarId: 'unset' })],
    })

    expect(root.querySelector('li')?.textContent).toBe('Bia')
  })

  it('draws no glyph for an avatarId that names no avatar', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: 'Bia', avatarId: 'dragon' })],
    })

    expect(root.querySelector('li')?.textContent).toBe('Bia')
  })

  it('keeps the same QR element across renders of the same table', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const first = root.querySelector('img')

    // Someone joins: a new tableState, the same code. A fresh <img> here
    // would make the browser refetch the image and blink the one element
    // people are pointing a camera at.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })

    expect(root.querySelector('img')).toBe(first)
  })

  it('builds a new QR element when the code changes', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const first = root.querySelector('img')

    renderTable(root, { code: 'MNBV', address: ADDRESS, participants: [] })

    const second = root.querySelector('img')
    expect(second).not.toBe(first)
    expect(second?.getAttribute('src')).toBe('/qr/MNBV.svg')
  })

  it('gives each root its own QR element', () => {
    const other = document.createElement('div')
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    renderTable(other, { code: 'KXTP', address: ADDRESS, participants: [] })

    expect(other.querySelector('img')).not.toBe(root.querySelector('img'))
  })

  it('renders an avatarId as text, never as markup', () => {
    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ nickname: 'Bia', avatarId: '<img src=x>' })],
    })

    // The QR code stays the only <img> the large screen ever renders.
    expect(root.querySelectorAll('img')).toHaveLength(1)
  })
})

describe('the code, drawn as four objects', () => {
  function tiles(target: HTMLElement = root): HTMLElement[] {
    return Array.from(target.querySelectorAll('.m8-tile'))
  }

  /** How many steps sideways a piece throws its shadow, as the renderer wrote it. */
  function shadowAcross(piece: HTMLElement): number {
    const match = /^calc\(var\(--m8-shadow-step\) \* (-?\d+)\)/.exec(piece.style.boxShadow)
    if (match === null || match[1] === undefined) {
      throw new Error(`No sideways shadow: ${piece.style.boxShadow}`)
    }
    return Number.parseInt(match[1], 10)
  }

  it('draws one tile per character rather than one string', () => {
    // The alphabet has no O, no I, no zero and no one because every
    // character of a code is read out on its own and typed on its own. Four
    // tiles is that fact made visible; a single string would undo it.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    expect(tiles().map((tile) => tile.textContent)).toEqual(['K', 'X', 'T', 'P'])
  })

  it('shows the address to type the code into', () => {
    // The eyebrow says "scan or type". A phone with no camera, or a camera
    // that will not focus in a dark room, has nothing to type without this.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    expect(root.textContent).toContain(ADDRESS)
  })

  it('turns every tile and the QR, and lifts each off the row baseline', () => {
    // The assertion used to be `/^rotate\(-?\d/`. It changed because the
    // transform carries more than an angle now: turning alone was
    // indistinguishable from three metres, so a piece is also lifted off the
    // baseline the four tiles used to share. The order is part of what is
    // pinned — transforms apply right to left, so the piece is turned first
    // and then moved in the table's own axes.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const turned = [...tiles(), root.querySelector('.m8-qr') as HTMLElement]
    for (const piece of turned) {
      expect(piece.style.transform).toMatch(/^translateY\(calc\(var\(--m8-.*\)\) rotate\(-?\d/)
    }
  })

  it('gives the QR its own, smaller step than the tiles have', () => {
    // The QR is the largest thing on the table, so its turned and lifted
    // bounding box is what sets the least height the table can be drawn in —
    // and it lies alone, with no baseline to break out of. A lift as large as
    // a tile's would cost the row of people real space and buy nothing.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const qr = root.querySelector('.m8-qr') as HTMLElement
    expect(qr.style.transform).toContain('var(--m8-qr-scatter-step)')
    for (const tile of tiles()) expect(tile.style.transform).toContain('var(--m8-scatter-step)')
  })

  it('throws every shadow away from the middle of the table', () => {
    // There is one lamp in this picture and it is above the middle of the
    // table, so a shadow does not fall straight down: it falls away from the
    // centre, each piece in its own direction. Every piece throwing the same
    // way is what tells the eye these are boxes in a layout rather than
    // objects on a surface — and it is the cue that costs nothing, because it
    // is geometry rather than art.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const across = [...tiles(), root.querySelector('.m8-qr') as HTMLElement].map(shadowAcross)

    // Left to right, and never the same twice: the leftmost tile throws
    // furthest left, the QR furthest right, and the middle of the row throws
    // nothing sideways at all.
    expect(across).toEqual([...across].sort((a, b) => a - b))
    expect(new Set(across).size).toBe(across.length)
    expect(across[0]).toBeLessThan(0)
    expect(across[across.length - 1]).toBeGreaterThan(0)
    // The lamp is over the middle, so the two ends are mirror images.
    expect(across[0]).toBe(-(across[across.length - 1] ?? 0))
  })

  it('keeps the downward part of a shadow on the stylesheet lengths', () => {
    // A shadow is written entirely out of custom properties, like every other
    // length this module emits: the two screen sizes live in the stylesheet
    // and nothing here can know which one is in force.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    for (const piece of [...tiles(), root.querySelector('.m8-qr') as HTMLElement]) {
      expect(piece.style.boxShadow).toContain('var(--m8-shadow-lift)')
      expect(piece.style.boxShadow).toContain('var(--m8-shadow-blur)')
      expect(piece.style.boxShadow).toContain('var(--m8-shadow)')
      expect(piece.style.boxShadow).not.toMatch(/\d+px/)
    }
  })

  it('does not space the tiles evenly', () => {
    // Objects scattered on a table are not equidistant. The gap after each
    // tile is widened by a number of steps drawn from the code, and two
    // neighbouring gaps are never the same width.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const gaps = tiles().map((tile) => tile.style.marginRight)
    // Three gaps: the last tile's margin is left to the stylesheet, which
    // zeroes it so the block margin alone separates the code from the QR.
    expect(gaps[3]).toBe('')
    for (const gap of gaps.slice(0, 3)) {
      expect(gap).toMatch(/^calc\(var\(--m8-piece-gap\) \+ var\(--m8-scatter-step\) \* \d\)$/)
    }
    expect(new Set(gaps.slice(0, 3)).size).toBeGreaterThan(1)
  })

  it('leaves the table itself square and the row of people aligned', () => {
    // The contrast is what sells it: a rigid surface with things casually
    // placed on it reads as real, everything tilted reads as a filter. And
    // counting the people around the table is a real glance-task.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    for (const selector of ['.m8-table', '.m8-people', '.m8-chip']) {
      expect((root.querySelector(selector) as HTMLElement).style.transform).toBe('')
    }
  })

  it('arranges the same table the same way every time it redraws', () => {
    // A `tableState` arrives whenever anybody joins or renames. Angles that
    // were random per render would make the whole table twitch each time.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const before = tiles().map((tile) => tile.style.transform)

    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    expect(tiles().map((tile) => tile.style.transform)).toEqual(before)
  })

  it('arranges a different table differently', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const first = tiles().map((tile) => tile.style.transform)

    const other = document.createElement('div')
    renderTable(other, { code: 'MNBV', address: ADDRESS, participants: [] })

    expect(tiles(other).map((tile) => tile.style.transform)).not.toEqual(first)
  })
})

describe('the colour each person is given', () => {
  function chips(target: HTMLElement = root): HTMLElement[] {
    return Array.from(target.querySelectorAll('.m8-chip'))
  }

  function colorOf(chip: HTMLElement): string {
    return chip.style.getPropertyValue('--m8-person')
  }

  const three = [
    participant({ id: 'p-1', nickname: 'Ana' }),
    participant({ id: 'p-2', nickname: 'Bia' }),
    participant({ id: 'p-3', nickname: 'Caio' }),
  ]

  it('gives everyone at the table a colour of their own', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: three })
    const colors = chips().map(colorOf)
    expect(colors.every((color) => color !== '')).toBe(true)
    expect(new Set(colors).size).toBe(three.length)
  })

  it('names a colour rather than writing one, so tokens stay the only source', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: three })
    for (const color of chips().map(colorOf)) {
      expect(color).toMatch(/^var\(--m8-person-\d\)$/)
    }
  })

  it('hands out colours in arrival order, which is what the phone reads too', () => {
    // The phone finds the same participant at the same index of the same
    // snapshot. What makes that hold after somebody leaves, and not only on
    // the way in, is covered in `when somebody leaves` below.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: three })
    expect(chips().map(colorOf)).toEqual([
      'var(--m8-person-1)',
      'var(--m8-person-2)',
      'var(--m8-person-3)',
    ])
  })

  it('keeps somebody in their colour when the person after them joins', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [three[0] as ParticipantSnapshot] })
    const first = colorOf(chips()[0] as HTMLElement)

    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: three })
    expect(colorOf(chips()[0] as HTMLElement)).toBe(first)
  })

  /**
   * What a departure does to the colours, which nothing covered before: the
   * suite tested a join and stopped there, and a join is the one case where
   * writing the colour once, when the element is created, happens to be
   * right.
   *
   * The sequence below is the milestone's own definition of done — somebody
   * leaves for good and a third person scans the code and takes their place —
   * and it used to produce two people at one table wearing the same colour,
   * which is the single failure this whole idea exists to prevent.
   */
  describe('when somebody leaves', () => {
    const four = [
      participant({ id: 'p-a', nickname: 'Ana' }),
      participant({ id: 'p-b', nickname: 'Bia' }),
      participant({ id: 'p-c', nickname: 'Caio' }),
      participant({ id: 'p-d', nickname: 'Duda' }),
    ]
    const withoutBia = [four[0], four[2], four[3]] as ParticipantSnapshot[]
    const eve = participant({ id: 'p-e', nickname: 'Eva' })

    function colors(): string[] {
      return chips().map(colorOf)
    }

    it('shifts everybody behind them one colour along', () => {
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: four })
      expect(colors()).toEqual([
        'var(--m8-person-1)',
        'var(--m8-person-2)',
        'var(--m8-person-3)',
        'var(--m8-person-4)',
      ])

      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: withoutBia })
      // Which is exactly what the phone computes from the same snapshot, and
      // is the trade `packages/tokens/src/person-color.ts` writes down: a
      // colour follows an index, not a person, so no two people can share one.
      expect(colors()).toEqual(['var(--m8-person-1)', 'var(--m8-person-2)', 'var(--m8-person-3)'])
    })

    it('does not hand the next person a colour somebody is already wearing', () => {
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: four })
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: withoutBia })
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [...withoutBia, eve] })

      expect(colors()).toEqual([
        'var(--m8-person-1)',
        'var(--m8-person-2)',
        'var(--m8-person-3)',
        'var(--m8-person-4)',
      ])
      expect(new Set(colors()).size).toBe(4)
    })

    it('agrees with what the phone computes from the same snapshot', () => {
      // The two screens read the same index out of the same message. This is
      // the assertion that the television is still doing that after a
      // departure, rather than remembering what it drew before.
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: four })
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: withoutBia })

      expect(colors()).toEqual(withoutBia.map((_person, index) => personColor(index)))
    })
  })
})

describe('the row of people, redrawn', () => {
  function chips(): HTMLElement[] {
    return Array.from(root.querySelectorAll('.m8-chip'))
  }

  const ana = participant({ id: 'p-1', nickname: 'Ana' })
  const bia = participant({ id: 'p-2', nickname: 'Bia' })

  it('keeps the element of somebody already at the table', () => {
    // This is what the one animation in the product rests on: a chip element
    // exists from the moment its person did, so a newly created element is a
    // genuine arrival and everybody else stays put. Rebuilding the row would
    // re-animate every chip whenever one person joined.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana] })
    const first = chips()[0]

    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana, bia] })
    expect(chips()[0]).toBe(first)
    expect(chips()[1]).not.toBe(first)
  })

  it('keeps the element when that person renames', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana] })
    const first = chips()[0]

    renderTable(root, {
      code: 'KXTP',
      address: ADDRESS,
      participants: [participant({ id: 'p-1', nickname: 'Ana Paula' })],
    })

    expect(chips()[0]).toBe(first)
    expect(root.textContent).toContain('Ana Paula')
  })

  it('drops the element of somebody who left', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana, bia] })
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [bia] })

    expect(chips()).toHaveLength(1)
    expect(root.textContent).not.toContain('Ana')
  })

  it('leaves the survivors alone when somebody in the middle leaves', () => {
    /*
     * The one animation in this product means "your phone connected", and it
     * lives on `.m8-chip` because creating an element and somebody arriving
     * are the same event. Moving an element is not: `insertBefore` in Blink
     * removes the node and inserts it again, which restarts its animation
     * from the beginning.
     *
     * Placing each chip against whatever occupied its index made every
     * survivor behind a departure look misplaced, so three people's phones
     * appeared to reconnect at the moment a fourth left. Nothing here can
     * observe a CSS animation — jsdom runs none — so what is asserted is the
     * cause: no survivor is moved at all.
     */
    const caio = participant({ id: 'p-3', nickname: 'Caio' })
    const duda = participant({ id: 'p-4', nickname: 'Duda' })
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana, bia, caio, duda] })
    const before = chips()

    const people = root.querySelector('.m8-people') as HTMLElement
    const moves = vi.spyOn(people, 'insertBefore')
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana, caio, duda] })

    expect(moves).not.toHaveBeenCalled()
    expect(chips()).toEqual([before[0], before[2], before[3]])
    moves.mockRestore()
  })

  it('tells the stylesheet how many people sit abreast', () => {
    // The one number the stylesheet cannot work out for itself. Below a full
    // line the width cap is width nobody is using, so the row carries the
    // count and the cap relaxes to match; at a full line and beyond the
    // number stops rising, because the cap is what keeps eight people on two
    // lines.
    const people = () => root.querySelector('.m8-people')?.getAttribute('data-abreast')

    for (const count of [0, 1, 2, 3, 4, 5, 8]) {
      const seated = Array.from({ length: count }, (_unused, index) =>
        participant({ id: `p-${index}`, nickname: `P${index}` }),
      )
      renderTable(root, { code: 'KXTP', address: ADDRESS, participants: seated })
      expect(people()).toBe(String(Math.min(count, CHIPS_ABREAST)))
    }
  })

  it('draws the row in the order the server sent', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana, bia] })
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [bia, ana] })

    expect(chips().map((chip) => chip.textContent)).toEqual(['🦊Bia', '🦊Ana'])
  })

  it('builds a fresh row after a waiting screen replaced the table', () => {
    // The reused tree is invalidated by its own root being cleared, so a
    // screen that went back to waiting and then received a table again does
    // not reattach chips that are no longer on screen.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana] })
    renderWaiting(root)
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [ana] })

    expect(chips()).toHaveLength(1)
    expect(root.textContent).toContain('Ana')
  })
})

describe('renderWaiting', () => {
  it('shows an initial waiting message', () => {
    renderWaiting(root)
    expect(root.textContent).toMatch(/opening|starting|waiting/i)
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    renderWaiting(root)
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderWaiting(root)
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})

describe('renderError', () => {
  it('shows a failure message telling the room to reload', () => {
    renderError(root, 'unknown-table')
    expect(root.textContent).toMatch(/reload/i)
  })

  it('includes the error code for diagnosis', () => {
    renderError(root, 'table-full')
    expect(root.textContent).toContain('table-full')
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant()] })
    renderError(root, 'invalid-message')
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderError(root, 'not-allowed')
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})

/**
 * The expanded black instance is subset to `[A-Z0-9 ]` plus the uppercase
 * accented letters pt-BR needs — not merely "uppercase". There is no hyphen
 * in it, no full stop and no apostrophe, and a character outside the subset
 * does not look slightly wrong: it falls through to whatever font the
 * television has, in the middle of the one line the whole room is reading.
 *
 * This stops being theoretical with the first game. `TIC-TAC-TOE` set as an
 * eyebrow would drop its two hyphens into a fallback face and say nothing.
 */
describe('the strings set in the expanded black face', () => {
  const strings = Object.entries(DISPLAY_FACE_STRINGS)

  it('finds strings to check', () => {
    // Guards the guard: an empty set would make the assertion below vacuous.
    expect(strings.length).toBeGreaterThan(0)
  })

  it.each(strings)('%s is inside the subset', (_name, value) => {
    expect(value).toMatch(DISPLAY_FACE_SUBSET)
  })

  it('rejects the hyphen the first game is about to bring', () => {
    // Guards the guard from the other side: a pattern that accepted anything
    // would pass every assertion above and catch nothing.
    expect('TIC-TAC-TOE').not.toMatch(DISPLAY_FACE_SUBSET)
    expect('Reconnecting').not.toMatch(DISPLAY_FACE_SUBSET)
  })

  it('puts every one of them on the screen where it belongs', () => {
    // The set is only worth checking while it really is the whole set, so
    // each string is traced to the screen that renders it.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [participant({ connected: false })] })
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.wordmark)
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.joinEyebrow)
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.reconnecting)

    renderWaiting(root)
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.waiting)

    renderError(root, 'unknown-table')
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.failed)
  })
})
