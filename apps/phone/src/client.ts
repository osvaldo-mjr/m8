import { PROTOCOL_VERSION, type ClientToServer, type ServerToClient } from '@m8/protocol'
import { io } from 'socket.io-client'

const CHANNEL = 'm8'
const TOKEN_KEY = 'm8.participant.token'
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 4

/** The QR carries the whole destination, so the code arrives in the path. */
export function codeFromLocation(pathname: string): string | null {
  const candidate = pathname.replace(/^\/+|\/+$/g, '').toUpperCase()
  if (candidate.length !== CODE_LENGTH) return null
  for (const char of candidate) {
    if (!CODE_ALPHABET.includes(char)) return null
  }
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
}

export function connectPhone(
  code: string,
  onMessage: (message: ServerToClient) => void,
): PhoneClient {
  const socket = io({ transports: ['websocket', 'polling'] })

  socket.on('connect', () => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY)
    socket.emit(CHANNEL, determineHelloMessage(code, storedToken))
  })

  socket.on(CHANNEL, (message: ServerToClient) => {
    const token = determineTokenToStore(message)
    if (token !== null) window.localStorage.setItem(TOKEN_KEY, token)

    if (message.type === 'reload') {
      window.location.reload()
      return
    }
    onMessage(message)
  })

  return {
    send: (message) => socket.emit(CHANNEL, message),
  }
}
