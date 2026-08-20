import type { ParticipantSnapshot } from '@m8/protocol'

export interface TvView {
  readonly code: string
  readonly participants: readonly ParticipantSnapshot[]
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  // Nicknames are free text typed by strangers on a screen in a shared room:
  // textContent only, never innerHTML, so nothing typed can render as markup.
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * The large screen displays and nothing else: no buttons, no links, no focus.
 * Written against the DOM directly because this tree is structurally almost
 * static, and because a framework runtime is weight the target hardware should
 * not have to carry.
 */
export function renderTable(root: HTMLElement, view: TvView): void {
  root.textContent = ''

  const header = element('div', 'mb-16')
  header.appendChild(element('p', 'text-3xl uppercase tracking-widest text-slate', 'Join the table'))
  header.appendChild(element('p', 'text-9xl font-black tracking-widest text-brass', view.code))
  root.appendChild(header)

  const qr = document.createElement('img')
  qr.setAttribute('src', `/qr/${view.code}.svg`)
  qr.setAttribute('alt', '')
  qr.className = 'h-96 w-96 bg-chalk p-6'
  root.appendChild(qr)

  const list = element('ul', 'mt-16')
  for (const person of view.participants) {
    const item = element('li', 'mb-6 text-5xl')
    item.setAttribute('data-baton', String(person.hasBaton))
    item.setAttribute('data-connected', String(person.connected))
    // A participant who has not chosen a nickname yet renders a placeholder
    // rather than an empty row, so the seat is still visible on the screen.
    item.textContent = person.nickname === '' ? '…' : person.nickname
    list.appendChild(item)
  }
  root.appendChild(list)
}
