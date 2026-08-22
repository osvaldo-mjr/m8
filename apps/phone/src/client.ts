import { PROTOCOL_VERSION, type ClientToServer, type ServerToClient } from '@m8/protocol'
import { io } from 'socket.io-client'

const CHANNEL = 'm8'
const TOKEN_KEY_PREFIX = 'm8.participant.token.'

/**
 * Where this device's token for one table is kept.
 *
 * Keyed by table code, not global: a phone that joins table A, then scans
 * table B, then comes back to A must come back as the same participant. Under
 * a single key, B's token overwrites A's, the return to A is greeted as a
 * stranger, and A's original row stays behind for good with nobody able to
 * reclaim it — which quietly breaks the one promise reconnection makes.
 */
export function tokenStorageKey(code: string): string {
  return `${TOKEN_KEY_PREFIX}${code}`
}

const PROFILE_KEY_PREFIX = 'm8.participant.profile.'

/**
 * Where this device's own name and face for one table are kept.
 *
 * The wire never echoes a nickname or an avatar back to the phone that chose
 * them — `DeviceSnapshot` carries decisions, not data — so this is the only
 * place either survives a reload. Without it, a page that reloads mid-session
 * (a phone whose browser reclaimed the tab while it sat in a pocket) would
 * ask a person to introduce themselves twice: the server already knows their
 * profile, but the screen would have no way to know that and would show the
 * form again. Keyed by table code for the same reason the token is.
 */
export function profileStorageKey(code: string): string {
  return `${PROFILE_KEY_PREFIX}${code}`
}

export interface StoredProfile {
  readonly nickname: string
  readonly avatarId: string
}

/**
 * Reads whatever profile was last remembered for `code`, tolerating anything
 * that is not the shape this module itself writes: corrupted storage, a
 * browser extension's stray value, an older format from a previous release.
 * All of those are read the same as never having a profile at all, which is
 * always a safe fallback — the phone simply asks again.
 */
function readStoredProfile(code: string): StoredProfile | null {
  const raw = window.localStorage.getItem(profileStorageKey(code))
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { nickname?: unknown }).nickname !== 'string' ||
      typeof (parsed as { avatarId?: unknown }).avatarId !== 'string'
    ) {
      return null
    }
    return { nickname: (parsed as StoredProfile).nickname, avatarId: (parsed as StoredProfile).avatarId }
  } catch {
    return null
  }
}

/**
 * The QR carries the whole destination, so the code arrives in the path.
 *
 * Deliberately no alphabet check here. Whether a code names a table is the
 * server's answer to give — it is authoritative, it already answers
 * `invalid-code`, and a second copy of the alphabet on this side would reject
 * codes the server considers perfectly valid the moment the two drift apart,
 * with nothing failing to say so. This only answers whether the path carries
 * something to ask about at all.
 */
export function codeFromLocation(pathname: string): string | null {
  const candidate = pathname.replace(/^\/+|\/+$/g, '').toUpperCase()
  if (candidate === '') return null
  if (candidate.includes('/')) return null
  return candidate
}

/**
 * The rejoin decision, pulled out as a pure function so "the same phone
 * comes back to the same seat" is testable without a socket or localStorage
 * in the loop. The caller reads the stored token; this only decides what to
 * send once it has one (or doesn't).
 */
export function determineHelloMessage(code: string, storedToken: string | null): ClientToServer {
  return storedToken === null
    ? { type: 'hello', protocolVersion: PROTOCOL_VERSION, code }
    : { type: 'hello', protocolVersion: PROTOCOL_VERSION, code, token: storedToken }
}

/**
 * Only a `welcome` ever carries a token to persist; every other message
 * leaves whatever is already stored untouched. Pulled out as a pure function
 * so "the device remembers its seat" is testable without localStorage or a
 * socket in the loop.
 */
export function determineTokenToStore(message: ServerToClient): string | null {
  return message.type === 'welcome' ? message.token : null
}

export interface PhoneClient {
  send(message: ClientToServer): void
  /**
   * Closes the socket and stops the message handler from firing again.
   * React's StrictMode double-invokes effects in development, so without
   * this an unmounted-and-remounted component would leave two live sockets
   * behind it, each greeting the server on its own and racing to be "the"
   * participant for this device.
   */
  disconnect(): void
  /**
   * This device's own name and face, remembered from an earlier session at
   * this table — `null` the first time this device ever joins it. Read once,
   * synchronously, at connect time: it does not depend on the server
   * answering anything, so there is no reason to make the caller wait for a
   * round trip before it can decide whether to show the profile form.
   */
  readonly storedProfile: StoredProfile | null
}

export function connectPhone(
  code: string,
  onMessage: (message: ServerToClient) => void,
): PhoneClient {
  const socket = io({ transports: ['websocket', 'polling'] })
  let closed = false

  socket.on('connect', () => {
    if (closed) return
    const storedToken = window.localStorage.getItem(tokenStorageKey(code))
    socket.emit(CHANNEL, determineHelloMessage(code, storedToken))
  })

  socket.on(CHANNEL, (message: ServerToClient) => {
    if (closed) return

    const token = determineTokenToStore(message)
    if (token !== null) window.localStorage.setItem(tokenStorageKey(code), token)

    if (message.type === 'reload') {
      window.location.reload()
      return
    }
    onMessage(message)
  })

  return {
    send: (message) => {
      // The only message this module has any reason to remember: it is the
      // one message whose whole content the wire never sends back. Written
      // at send time, not on some later acknowledgement — the server has no
      // refusal path for a profile from an attachment that could reach the
      // profile screen at all, so waiting for one would only add a window in
      // which a reload asks the same question again for nothing.
      if (message.type === 'setProfile') {
        window.localStorage.setItem(
          profileStorageKey(code),
          JSON.stringify({ nickname: message.nickname, avatarId: message.avatarId }),
        )
      }
      socket.emit(CHANNEL, message)
    },
    disconnect: () => {
      // Set before closing, not after: a message already in flight when
      // disconnect() is called must still be dropped by the handler above
      // rather than reaching a component that is mid-unmount.
      closed = true
      socket.disconnect()
    },
    storedProfile: readStoredProfile(code),
  }
}
