// @vitest-environment jsdom
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
    renderTable(root, { code: 'KXTP', participants: [participant({ nickname: '' })] })
    const item = root.querySelector('li')
    expect(item?.textContent).toBe('…')
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
