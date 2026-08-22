// @vitest-environment jsdom
import { AVATARS } from '@m8/avatars'
import { NICKNAME_MAX_LENGTH, type ParticipantSnapshot, type PreviewSnapshot, type SeatSnapshot, type TableSnapshot } from '@m8/protocol'
import { seatColor } from '@m8/tokens'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CHIPS_ABREAST,
  DISPLAY_FACE_STRINGS,
  DISPLAY_FACE_SUBSET,
  SCREEN_LOCALE,
  renderChoosing,
  renderError,
  renderScreen,
  renderSeating,
  renderTable,
  renderWaiting,
} from './render.js'
import type { ChoosingView, SeatingView } from './render.js'

/** How many steps sideways a piece throws its shadow, as the renderer wrote it. */
function shadowAcross(piece: HTMLElement): number {
  const match = /^calc\(var\(--m8-shadow-step\) \* (-?\d+)\)/.exec(piece.style.boxShadow)
  if (match === null || match[1] === undefined) {
    throw new Error(`No sideways shadow: ${piece.style.boxShadow}`)
  }
  return Number.parseInt(match[1], 10)
}

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

describe('the colour of the row before any seat exists', () => {
  // Nobody joins before a game is chosen (spec 3.1), so this row is the host
  // alone, and always was — nothing here ever has a second person to shift.
  // What used to be tested here as "arrival order" was really just this row's
  // own position pushed through the same colour function every other row on
  // this screen uses. Genuine seat-colour stability under a departure —
  // several people, one of them leaving, none of the survivors' colours
  // moving — is covered where it is actually reachable: `renderSeating`, in
  // `the colour a seat is given` below.
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

  it('colours the row by position, one-based to match a seat number', () => {
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

  it('still shifts a survivor one colour along when somebody ahead of them leaves', () => {
    // Deliberately unguarded against the bug this whole task removes: this
    // row is coloured by array position, the same mechanism `personColor`
    // used to be. That is safe only because nobody may join before a game is
    // chosen (spec 3.1), so the row this function actually draws never holds
    // more than the host alone — the departure below cannot happen for real.
    // Pinned anyway, so a later reader who "fixes" this row in place, without
    // reading that it is unreachable, gets a red test rather than a silent
    // reintroduction of the bug `renderSeating` was built to remove.
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: three })
    const thirdBefore = colorOf(chips()[2] as HTMLElement)

    const withoutAna = [three[1], three[2]] as ParticipantSnapshot[]
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: withoutAna })

    expect(colorOf(chips()[1] as HTMLElement)).not.toBe(thirdBefore)
    expect(colorOf(chips()[1] as HTMLElement)).toBe(seatColor(2))
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

describe('renderChoosing', () => {
  function view(overrides: Partial<ChoosingView> = {}): ChoosingView {
    return {
      code: 'KXTP',
      cover: '/games/chess/cover.svg',
      title: { 'pt-BR': 'A vez', en: 'Your turn' },
      lines: {
        'pt-BR': ['Mova uma peça por vez.', 'Cada peça se move à sua maneira.'],
        en: ['Move one piece at a time.', 'Each piece moves its own way.'],
      },
      page: 1,
      pageCount: 3,
      ...overrides,
    }
  }

  it('points the cover image at the URL the snapshot carries', () => {
    renderChoosing(root, view())
    const image = root.querySelector('.m8-box img')
    expect(image?.getAttribute('src')).toBe('/games/chess/cover.svg')
  })

  it("shows the page's title and every one of its lines, in the screen locale", () => {
    renderChoosing(root, view())
    expect(root.textContent).toContain('A vez')
    expect(root.textContent).toContain('Mova uma peça por vez.')
    expect(root.textContent).toContain('Cada peça se move à sua maneira.')
  })

  it('never shows the locale the screen did not pick', () => {
    renderChoosing(root, view())
    expect(root.textContent).not.toContain('Your turn')
    expect(root.textContent).not.toContain('Move one piece at a time.')
  })

  it('reads the page indicator from page and pageCount, one-based for the room', () => {
    // `page` is the zero-based index the wire carries — the same one
    // `clampPage` on the server produces — so page 1 of 3 reads "2 of 3".
    renderChoosing(root, view({ page: 1, pageCount: 3 }))
    expect(root.textContent).toContain('2 of 3')
  })

  it('renders nothing interactive', () => {
    renderChoosing(root, view())
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })

  it('replaces previous content instead of appending', () => {
    renderChoosing(root, view())
    renderChoosing(
      root,
      view({
        title: { 'pt-BR': 'Xeque-mate', en: 'Checkmate' },
        lines: { 'pt-BR': ['Ameace o rei sem escapatória.'], en: ['Threaten the king with no escape.'] },
        page: 2,
      }),
    )
    expect(root.textContent).not.toContain('A vez')
    expect(root.textContent).not.toContain('Cada peça se move à sua maneira.')
    expect(root.querySelectorAll('.m8-manual-line')).toHaveLength(1)
  })

  it('keeps the same cover element when only the page turns', () => {
    // The one image on this screen anyone stares at while the host flips
    // pages. Rebuilding it on every `manualPage` tap would refetch and
    // blink it, the same defect the QR's own reuse test guards against.
    renderChoosing(root, view())
    const first = root.querySelector('.m8-box img')

    renderChoosing(root, view({ page: 2, title: { 'pt-BR': 'Xeque-mate', en: 'Checkmate' } }))

    expect(root.querySelector('.m8-box img')).toBe(first)
  })

  it('builds a new box and manual when the table code changes', () => {
    renderChoosing(root, view())
    const first = root.querySelector('.m8-box img')

    renderChoosing(root, view({ code: 'MNBV' }))

    expect(root.querySelector('.m8-box img')).not.toBe(first)
  })

  it('gives each root its own box and manual', () => {
    const other = document.createElement('div')
    renderChoosing(root, view())
    renderChoosing(other, view())

    expect(other.querySelector('.m8-box img')).not.toBe(root.querySelector('.m8-box img'))
  })
})

describe('the box and the manual, drawn as two objects', () => {
  function view(overrides: Partial<ChoosingView> = {}): ChoosingView {
    return {
      code: 'KXTP',
      cover: '/games/chess/cover.svg',
      title: { 'pt-BR': 'A vez', en: 'Your turn' },
      lines: { 'pt-BR': ['Mova uma peça por vez.'], en: ['Move one piece at a time.'] },
      page: 0,
      pageCount: 3,
      ...overrides,
    }
  }

  function box(target: HTMLElement = root): HTMLElement {
    return target.querySelector('.m8-box') as HTMLElement
  }

  function manual(target: HTMLElement = root): HTMLElement {
    return target.querySelector('.m8-manual') as HTMLElement
  }

  it('turns and lifts both the box and the manual, through the same scatter the table already has', () => {
    renderChoosing(root, view())
    for (const piece of [box(), manual()]) {
      expect(piece.style.transform).toMatch(/^translateY\(calc\(var\(--m8-.*\)\) rotate\(-?\d/)
    }
  })

  it('gives both the QR-scale step rather than the code tile step', () => {
    // The box and the manual are large single objects, like the QR, and not
    // a row several of which share a baseline, like the code tiles — so they
    // take the QR's smaller step for the reason `tilt.ts` gives: a large
    // lift on a large piece costs more room than it buys.
    renderChoosing(root, view())
    for (const piece of [box(), manual()]) {
      expect(piece.style.transform).toContain('var(--m8-qr-scatter-step)')
    }
  })

  it('throws the box shadow left and the manual shadow right', () => {
    // Left to right on the table, same as the code tiles and the QR: the
    // lamp is over the middle, so the leftmost piece throws left and the
    // rightmost throws right.
    renderChoosing(root, view())
    expect(shadowAcross(box())).toBeLessThan(0)
    expect(shadowAcross(manual())).toBeGreaterThan(0)
  })

  it('keeps the table itself square, never turned', () => {
    renderChoosing(root, view())
    expect((root.querySelector('.m8-table') as HTMLElement).style.transform).toBe('')
  })

  it('arranges the same table the same way every time it redraws', () => {
    renderChoosing(root, view())
    const before = box().style.transform

    renderChoosing(root, view({ page: 1, title: { 'pt-BR': 'Outra', en: 'Other' } }))

    expect(box().style.transform).toBe(before)
  })

  it('arranges a different table differently', () => {
    renderChoosing(root, view())
    const first = box().style.transform

    const other = document.createElement('div')
    renderChoosing(other, view({ code: 'MNBV' }))

    expect(box(other).style.transform).not.toBe(first)
  })
})

describe('renderSeating', () => {
  function seat(overrides: Partial<SeatSnapshot> = {}): SeatSnapshot {
    return { number: 1, occupant: null, ...overrides }
  }

  function view(overrides: Partial<SeatingView> = {}): SeatingView {
    return {
      code: 'KXTP',
      address: ADDRESS,
      seats: [],
      qrVisible: true,
      batonHolder: null,
      ...overrides,
    }
  }

  function chips(target: HTMLElement = root): HTMLElement[] {
    return Array.from(target.querySelectorAll('.m8-chip'))
  }

  it("shows an occupant's avatar and nickname in that seat's own colour", () => {
    renderSeating(
      root,
      view({ seats: [seat({ number: 2, occupant: participant({ nickname: 'Bia', avatarId: 'fox' }) })] }),
    )
    const chip = chips()[0] as HTMLElement
    expect(chip.textContent).toContain('Bia')
    expect(chip.style.getPropertyValue('--m8-person')).toBe(seatColor(2))
  })

  it('renders an empty seat as a place at the table, not as a gap', () => {
    renderSeating(
      root,
      view({
        seats: [seat({ number: 1, occupant: null }), seat({ number: 2, occupant: participant() })],
      }),
    )
    expect(chips()).toHaveLength(2)
    expect(chips()[0]?.className).toContain('m8-chip-away')
    expect(chips()[0]?.style.getPropertyValue('--m8-person')).toBe(seatColor(1))
  })

  it('tells an empty seat apart from one claimed but not yet named', () => {
    // Both draw a mostly-blank chip; only the empty one carries the seat's
    // own number, since the other genuinely has somebody in it.
    renderSeating(
      root,
      view({
        seats: [
          seat({ number: 1, occupant: null }),
          seat({ number: 2, occupant: participant({ id: 'p-2', nickname: '', avatarId: 'unset' }) }),
        ],
      }),
    )
    expect(chips()[0]?.textContent).toBe('1')
    expect(chips()[1]?.textContent).toBe('…')
  })

  it('shows the QR while a seat is free', () => {
    renderSeating(root, view({ qrVisible: true, seats: [seat({ number: 1 })] }))
    expect(root.querySelector('.m8-qr img')).not.toBeNull()
  })

  it('hides the QR the instant the last seat fills', () => {
    renderSeating(root, view({ qrVisible: false, seats: [seat({ number: 1, occupant: participant() })] }))
    expect(root.querySelector('.m8-qr')).toBeNull()
  })

  it('takes the QR off the table the moment qrVisible flips, not only when it starts false', () => {
    // The stronger form of the test above: the same table, one seat still
    // free, then the same table with that seat just taken — the actual
    // transition the domain calls "the instant the last seat fills", rather
    // than two screens that never shared a root.
    renderSeating(root, view({ qrVisible: true, seats: [seat({ number: 1 })] }))
    expect(root.querySelector('.m8-qr')).not.toBeNull()

    renderSeating(root, view({ qrVisible: false, seats: [seat({ number: 1, occupant: participant() })] }))
    expect(root.querySelector('.m8-qr')).toBeNull()
  })

  it('brings the QR back if a seat empties again', () => {
    renderSeating(root, view({ qrVisible: false, seats: [seat({ number: 1, occupant: participant() })] }))
    renderSeating(root, view({ qrVisible: true, seats: [seat({ number: 1, occupant: null })] }))
    expect(root.querySelector('.m8-qr img')).not.toBeNull()
  })

  it('marks the baton holder even when he holds no seat', () => {
    const host = participant({ id: 'p-host', nickname: 'Duda', hasBaton: true })
    renderSeating(
      root,
      view({
        seats: [seat({ number: 1, occupant: participant({ id: 'p-1', nickname: 'Ana' }) })],
        batonHolder: host,
      }),
    )
    expect(root.textContent).toContain('Duda')
    // Not seated: the only chip in the row belongs to whoever actually is.
    expect(chips()).toHaveLength(1)
  })

  it('draws the badge for the longest nickname a player can actually submit', () => {
    // NICKNAME_MAX_LENGTH is the wire's own ceiling (`@m8/protocol`) — the
    // longest string that ever reaches this badge for real, not a
    // hypothetical. jsdom computes no layout, so this cannot prove a pixel
    // width; what makes that length safe regardless — a bounded, truncating
    // box rather than one that grows with its content — is `.m8-host` in
    // `styles.css`, proven in `scripts/tv-safe-area.test.ts`. This proves
    // the other half: the screen still renders it, whole, without throwing.
    const longest = 'A'.repeat(NICKNAME_MAX_LENGTH)
    const host = participant({ id: 'p-host', nickname: longest, hasBaton: true })
    renderSeating(root, view({ seats: [seat({ number: 1 })], batonHolder: host }))
    expect(root.textContent).toContain(longest)
  })

  it('names nobody when there happens to be no baton holder to mark', () => {
    // Unreachable in the real product — a table always has one — but a
    // screen that threw on a missing field would be a worse failure than a
    // blank badge, so this pins that it does not.
    renderSeating(root, view({ seats: [seat({ number: 1 })], batonHolder: null }))
    expect(() => renderSeating(root, view({ seats: [seat({ number: 1 })], batonHolder: null }))).not.toThrow()
  })

  it('tells the stylesheet how many seats sit abreast', () => {
    renderSeating(root, view({ seats: [seat({ number: 1 }), seat({ number: 2 })] }))
    expect(root.querySelector('.m8-people')?.getAttribute('data-abreast')).toBe('2')
  })

  it('renders nothing interactive', () => {
    renderSeating(
      root,
      view({
        seats: [seat({ number: 1, occupant: participant() })],
        batonHolder: participant({ hasBaton: true }),
      }),
    )
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })

  it('renders a nickname as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    renderSeating(root, view({ seats: [seat({ number: 1, occupant: participant({ nickname: hostile }) })] }))
    expect(root.textContent).toContain(hostile)
    expect(root.querySelector('img[src="x"]')).toBeNull()
  })

  it('keeps the same QR element across renders while a seat stays free', () => {
    renderSeating(root, view({ seats: [seat({ number: 1 })] }))
    const first = root.querySelector('img')

    renderSeating(root, view({ seats: [seat({ number: 1, occupant: participant() })] }))
    expect(root.querySelector('img')).toBe(first)
  })

  it('builds a new QR element when the table code changes', () => {
    renderSeating(root, view({ code: 'KXTP', seats: [seat({ number: 1 })] }))
    const first = root.querySelector('img')

    renderSeating(root, view({ code: 'MNBV', seats: [seat({ number: 1 })] }))
    expect(root.querySelector('img')).not.toBe(first)
  })

  it('replaces previous content instead of appending', () => {
    renderSeating(root, view({ seats: [seat({ number: 1, occupant: participant({ nickname: 'Ana' }) })] }))
    renderSeating(root, view({ seats: [] }))
    expect(root.textContent).not.toContain('Ana')
  })

  it("draws every seat at the table's hard capacity without crashing", () => {
    // MAX_SEATS in `@m8/contract`, and `MAX_PARTICIPANTS` in `@m8/core`, are
    // both 8 — asserted equal in `apps/server/src/limits.test.ts`, the one
    // place that sees both packages. `apps/tv/src` is typechecked under its
    // own narrow project (`apps/tv/tsconfig.json`) and imports neither, so
    // the number is written out here rather than imported; the arithmetic
    // that proves this many seats actually fit on screen, at every tilt and
    // both resolutions, lives in `scripts/tv-safe-area.test.ts`.
    const eight = Array.from({ length: 8 }, (_unused, index) =>
      seat({
        number: index + 1,
        occupant: index % 2 === 0 ? participant({ id: `p-${index}`, nickname: `P${index}` }) : null,
      }),
    )
    renderSeating(root, view({ seats: eight, qrVisible: false }))

    expect(chips()).toHaveLength(8)
    const colors = new Set(chips().map((chip) => chip.style.getPropertyValue('--m8-person')))
    expect(colors.size).toBe(8)
  })

  describe('the colour a seat is given', () => {
    it('is unaffected by another seat emptying', () => {
      const ana = participant({ id: 'p-1', nickname: 'Ana' })
      const caio = participant({ id: 'p-3', nickname: 'Caio' })
      renderSeating(
        root,
        view({
          seats: [
            seat({ number: 1, occupant: ana }),
            seat({ number: 2, occupant: participant({ id: 'p-2', nickname: 'Bia' }) }),
            seat({ number: 3, occupant: caio }),
          ],
        }),
      )
      const thirdBefore = chips()[2]?.style.getPropertyValue('--m8-person')

      // Seat 2's occupant leaves for good; the row's other two seats do not move.
      renderSeating(
        root,
        view({
          seats: [seat({ number: 1, occupant: ana }), seat({ number: 2, occupant: null }), seat({ number: 3, occupant: caio })],
        }),
      )

      expect(chips()[2]?.style.getPropertyValue('--m8-person')).toBe(thirdBefore)
      expect(chips()[2]?.style.getPropertyValue('--m8-person')).toBe(seatColor(3))
    })

    it('is inherited by whoever takes the seat next, not carried away by who left', () => {
      renderSeating(root, view({ seats: [seat({ number: 1, occupant: participant({ id: 'p-1', nickname: 'Ana' }) })] }))
      renderSeating(root, view({ seats: [seat({ number: 1, occupant: participant({ id: 'p-2', nickname: 'Bia' }) })] }))

      const chip = chips()[0] as HTMLElement
      expect(chip.textContent).toContain('Bia')
      expect(chip.style.getPropertyValue('--m8-person')).toBe(seatColor(1))
    })
  })
})

describe('renderScreen', () => {
  const ADDRESS = '192.168.0.6:3000'

  function preview(overrides: Partial<PreviewSnapshot> = {}): PreviewSnapshot {
    return {
      gameId: 'chess',
      cover: '/games/chess/cover.svg',
      name: { 'pt-BR': 'Xadrez', en: 'Chess' },
      page: 0,
      pageCount: 3,
      title: { 'pt-BR': 'O tabuleiro', en: 'The board' },
      lines: { 'pt-BR': ['Oito por oito casas.'], en: ['Eight by eight cells.'] },
      ...overrides,
    }
  }

  function table(overrides: Partial<TableSnapshot> = {}): TableSnapshot {
    return {
      code: 'KXTP',
      phase: 'awaiting-host',
      participants: [],
      seats: [],
      qrVisible: true,
      preview: null,
      ...overrides,
    }
  }

  it('draws the join screen while awaiting the host', () => {
    renderScreen(root, table({ participants: [participant({ nickname: 'Ana' })] }), ADDRESS)
    expect(root.textContent).toContain('Ana')
    expect(root.textContent).toContain('KXTP')
  })

  it('draws the box and the manual once a game is being previewed', () => {
    renderScreen(root, table({ phase: 'choosing-game', preview: preview() }), ADDRESS)
    expect(root.textContent).toContain('O tabuleiro')
    expect(root.querySelector('.m8-box img')?.getAttribute('src')).toBe('/games/chess/cover.svg')
  })

  it('falls back to the waiting screen while choosing a game before anyone has previewed one', () => {
    // The instant between arriving at this phase and the first
    // `previewGame` — `table.preview` is still null, and this plan draws
    // nothing else for that moment.
    renderScreen(root, table({ phase: 'choosing-game', preview: null }), ADDRESS)
    expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.waiting)
  })

  it('draws the seats, and the baton holder, once seating begins', () => {
    renderScreen(
      root,
      table({
        phase: 'seating',
        seats: [
          { number: 1, occupant: participant({ nickname: 'Ana', hasBaton: true }) },
          { number: 2, occupant: null },
        ],
        participants: [participant({ nickname: 'Ana', hasBaton: true })],
      }),
      ADDRESS,
    )
    expect(root.querySelectorAll('.m8-chip')).toHaveLength(2)
    expect(root.textContent).toContain('Ana')
  })

  // Nothing in this plan can start a match, so these four phases can arrive
  // on the wire but never really happen. Named individually, because a
  // `switch` silently rendering nothing for one of them would leave a blank
  // television with no way to tell why — the one failure this target cannot
  // be debugged through.
  it.each(['playing', 'paused', 'awaiting-seat', 'finished'] as const)(
    'falls back to the waiting screen for the unreachable phase %s',
    (phase) => {
      renderScreen(root, table({ phase }), ADDRESS)
      expect(root.textContent).toContain(DISPLAY_FACE_STRINGS.waiting)
    },
  )

  it('clears the box and the manual once the phase moves past choosing', () => {
    renderScreen(root, table({ phase: 'choosing-game', preview: preview() }), ADDRESS)
    renderScreen(root, table({ phase: 'seating' }), ADDRESS)
    expect(root.querySelector('.m8-box')).toBeNull()
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
