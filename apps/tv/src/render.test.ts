// @vitest-environment jsdom
import { AVATARS } from '@m8/avatars'
import type { ParticipantSnapshot } from '@m8/protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderError, renderTable, renderWaiting } from './render.js'

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

  it('turns every tile and the QR, so they read as things put down', () => {
    renderTable(root, { code: 'KXTP', address: ADDRESS, participants: [] })
    const turned = [...tiles(), root.querySelector('.m8-qr') as HTMLElement]
    for (const piece of turned) {
      expect(piece.style.transform).toMatch(/^rotate\(-?\d/)
    }
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
    // snapshot, so the two screens cannot disagree about who is coral.
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
