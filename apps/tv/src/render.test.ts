// @vitest-environment jsdom
import { AVATARS } from '@m8/avatars'
import type { ParticipantSnapshot } from '@m8/protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderError, renderTable, renderWaiting } from './render.js'

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
    renderTable(root, { code: 'KXTP', participants: [] })
    expect(root.textContent).toContain('KXTP')
  })

  it('points the QR image at the server endpoint for that code', () => {
    renderTable(root, { code: 'KXTP', participants: [] })
    const image = root.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/qr/KXTP.svg')
  })

  it('lists each participant nickname', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ nickname: 'Bia' })] })
    expect(root.textContent).toContain('Bia')
  })

  it('marks the baton holder', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ hasBaton: true })] })
    expect(root.querySelector('[data-baton="true"]')).not.toBeNull()
  })

  it('marks a disconnected participant', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ connected: false })] })
    expect(root.querySelector('[data-connected="false"]')).not.toBeNull()
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', participants: [participant()] })
    renderTable(root, { code: 'KXTP', participants: [] })
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderTable(root, { code: 'KXTP', participants: [participant()] })
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })

  it('renders a nickname as text, never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)>'
    renderTable(root, { code: 'KXTP', participants: [participant({ nickname: hostile })] })
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
      participants: [participant({ nickname: '', avatarId: 'unset' })],
    })
    const item = root.querySelector('li')
    expect(item?.textContent).toBe('…')
  })

  it('draws the avatar glyph beside the nickname', () => {
    const fox = AVATARS.find((avatar) => avatar.id === 'fox')!
    renderTable(root, {
      code: 'KXTP',
      participants: [participant({ nickname: 'Bia', avatarId: 'fox' })],
    })

    const item = root.querySelector('li')
    expect(item?.textContent).toContain(fox.glyph)
    expect(item?.textContent).toContain('Bia')
  })

  it('draws every avatar in the shared catalogue', () => {
    renderTable(root, {
      code: 'KXTP',
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
      participants: [participant({ nickname: 'Bia', avatarId: 'unset' })],
    })

    expect(root.querySelector('li')?.textContent).toBe('Bia')
  })

  it('draws no glyph for an avatarId that names no avatar', () => {
    renderTable(root, {
      code: 'KXTP',
      participants: [participant({ nickname: 'Bia', avatarId: 'dragon' })],
    })

    expect(root.querySelector('li')?.textContent).toBe('Bia')
  })

  it('keeps the same QR element across renders of the same table', () => {
    renderTable(root, { code: 'KXTP', participants: [] })
    const first = root.querySelector('img')

    // Someone joins: a new tableState, the same code. A fresh <img> here
    // would make the browser refetch the image and blink the one element
    // people are pointing a camera at.
    renderTable(root, { code: 'KXTP', participants: [participant()] })

    expect(root.querySelector('img')).toBe(first)
  })

  it('builds a new QR element when the code changes', () => {
    renderTable(root, { code: 'KXTP', participants: [] })
    const first = root.querySelector('img')

    renderTable(root, { code: 'MNBV', participants: [] })

    const second = root.querySelector('img')
    expect(second).not.toBe(first)
    expect(second?.getAttribute('src')).toBe('/qr/MNBV.svg')
  })

  it('gives each root its own QR element', () => {
    const other = document.createElement('div')
    renderTable(root, { code: 'KXTP', participants: [] })
    renderTable(other, { code: 'KXTP', participants: [] })

    expect(other.querySelector('img')).not.toBe(root.querySelector('img'))
  })

  it('renders an avatarId as text, never as markup', () => {
    renderTable(root, {
      code: 'KXTP',
      participants: [participant({ nickname: 'Bia', avatarId: '<img src=x>' })],
    })

    // The QR code stays the only <img> the large screen ever renders.
    expect(root.querySelectorAll('img')).toHaveLength(1)
  })
})

describe('renderWaiting', () => {
  it('shows an initial waiting message', () => {
    renderWaiting(root)
    expect(root.textContent).toMatch(/opening|starting|waiting/i)
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', participants: [participant()] })
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
    renderTable(root, { code: 'KXTP', participants: [participant()] })
    renderError(root, 'invalid-message')
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderError(root, 'not-allowed')
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})
