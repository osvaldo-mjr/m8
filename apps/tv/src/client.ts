import { PROTOCOL_VERSION, type ScreenToServer, type ServerToClient } from '@m8/protocol'
import { io } from 'socket.io-client'

const CHANNEL = 'm8'
const STORED_CODE_KEY = 'm8.table.code'

/**
 * The rejoin decision, pulled out as a pure function so "the television
 * refreshes and rejoins the same table" is testable without a socket or
 * localStorage in the loop. The caller reads the stored code; this only
 * decides what to send once it has one (or doesn't).
 */
export function determineHelloMessage(storedCode: string | null): ScreenToServer {
  return storedCode === null
    ? { type: 'helloTable', protocolVersion: PROTOCOL_VERSION }
    : { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code: storedCode }
}

/**
 * The large screen has exactly one outbound message, `helloTable`, and no
 * others, ever. It is sent internally on connect and reconnect; nothing is
 * returned to the caller, so there is no handle here that a later change
 * could grow a second outbound message onto.
 */
export function connectScreen(onMessage: (message: ServerToClient) => void): void {
  const socket = io({ transports: ['websocket', 'polling'] })

  const hello = (): void => {
    const stored = window.localStorage.getItem(STORED_CODE_KEY)
    socket.emit(CHANNEL, determineHelloMessage(stored))
  }

  socket.on('connect', hello)
  socket.on(CHANNEL, (message: ServerToClient) => {
    if (message.type === 'tableReady') {
      window.localStorage.setItem(STORED_CODE_KEY, message.code)
    }
    if (message.type === 'reload') {
      window.location.reload()
      return
    }
    onMessage(message)
  })
}
