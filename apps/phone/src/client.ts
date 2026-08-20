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
    send: (message) => socket.emit(CHANNEL, message),
    disconnect: () => {
      // Set before closing, not after: a message already in flight when
      // disconnect() is called must still be dropped by the handler above
      // rather than reaching a component that is mid-unmount.
      closed = true
      socket.disconnect()
    },
  }
}
