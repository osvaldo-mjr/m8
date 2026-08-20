import { avatarGlyph } from '@m8/avatars'
import type { ErrorCode, ParticipantSnapshot } from '@m8/protocol'

export interface TvView {
  readonly code: string
  readonly participants: readonly ParticipantSnapshot[]
}

/**
 * The QR image already on screen, per root, with the code it was built for.
 *
 * A `tableState` arrives every time anyone joins, renames or drops, and a
 * fresh `<img>` each time means the browser refetches `/qr/CODE.svg` and the
 * element blinks — the one element in the room people are pointing a camera
 * at. The same element is reused while the code is unchanged, so re-rendering
 * the list around it moves it rather than reloading it. A WeakMap keyed by the
 * root rather than a module-level variable, so two roots cannot share one
 * image and nothing is retained after a root is discarded.
 */
const qrImages = new WeakMap<HTMLElement, { code: string; image: HTMLImageElement }>()

function qrImage(root: HTMLElement, code: string): HTMLImageElement {
  const cached = qrImages.get(root)
  if (cached && cached.code === code) return cached.image

  const image = document.createElement('img')
  image.setAttribute('src', `/qr/${code}.svg`)
  image.setAttribute('alt', '')
  image.className = 'h-96 w-96 bg-chalk p-6'
  qrImages.set(root, { code, image })
  return image
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
  header.appendChild(element('p', 'text-3xl uppercase tracking-widest text-ash', 'Join the table'))
  header.appendChild(element('p', 'text-9xl font-black tracking-widest text-brass', view.code))
  root.appendChild(header)

  root.appendChild(qrImage(root, view.code))

  const list = element('ul', 'mt-16')
  for (const person of view.participants) {
    // A dropped participant has to be legible as dropped from three metres,
    // by someone who cannot touch the screen to investigate. The attributes
    // below are for tests and for whoever inspects the DOM; they are not a
    // signal to a human, so the difference is carried by the classes and by a
    // word, not by the attributes.
    const item = element(
      'li',
      person.connected ? 'mb-6 text-5xl' : 'mb-6 text-5xl opacity-40',
    )
    item.setAttribute('data-baton', String(person.hasBaton))
    item.setAttribute('data-connected', String(person.connected))

    // The avatar carries the identity at three metres, where a nickname is
    // near the limit of what can be read: it comes first, and larger.
    // Margin, never flexbox `gap`, which needs Chromium 84.
    const glyph = avatarGlyph(person.avatarId)
    if (glyph !== null) item.appendChild(element('span', 'mr-6 text-6xl', glyph))

    // A participant who has not chosen a nickname yet renders a placeholder
    // rather than an empty row, so the seat is still visible on the screen.
    item.appendChild(element('span', '', person.nickname === '' ? '…' : person.nickname))

    // Margin, never flexbox `gap` — Chromium 84 and the target is 68 to 79.
    if (!person.connected) {
      item.appendChild(
        element('span', 'ml-6 text-3xl uppercase tracking-widest text-clay', 'Reconnecting'),
      )
    }

    list.appendChild(item)
  }
  root.appendChild(list)
}

/**
 * Shown from the moment the page loads until the first `tableState` arrives.
 * The screen must never be blank: nobody in the room can open developer
 * tools on a television to find out whether it is broken or just slow.
 */
export function renderWaiting(root: HTMLElement): void {
  root.textContent = ''
  root.appendChild(element('p', 'text-7xl font-black tracking-widest text-chalk', 'Opening the table…'))
}

/**
 * Shown when the server rejects the screen outright. This is the only
 * diagnostic surface a television has, so the error code is kept on screen
 * in a smaller line rather than only logged somewhere nobody can reach.
 */
export function renderError(root: HTMLElement, code: ErrorCode): void {
  root.textContent = ''
  root.appendChild(element('p', 'text-7xl font-black tracking-widest text-clay', 'Something went wrong'))
  root.appendChild(element('p', 'mt-8 text-4xl text-chalk', 'Reload this screen.'))
  root.appendChild(element('p', 'mt-16 text-2xl tracking-widest text-ash', code))
}
