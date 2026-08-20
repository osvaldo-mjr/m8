import type { ClientToServer, ScreenToServer } from './messages.js'

type Inbound = ClientToServer | ScreenToServer

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Hand-written on purpose: this file is imported by the server only, so no
 * validation library reaches the TV bundle, where every kilobyte is budgeted.
 * Returns null for anything that is not a message we recognize; the caller
 * answers with an `invalid-message` error.
 */
export function parseInbound(raw: unknown): Inbound | null {
  if (!isRecord(raw) || !isString(raw['type'])) return null

  switch (raw['type']) {
    case 'helloTable': {
      if (!isNumber(raw['protocolVersion'])) return null
      const code = raw['code']
      if (code !== undefined && !isString(code)) return null
      return code === undefined
        ? { type: 'helloTable', protocolVersion: raw['protocolVersion'] }
        : { type: 'helloTable', protocolVersion: raw['protocolVersion'], code }
    }

    case 'hello': {
      if (!isNumber(raw['protocolVersion']) || !isString(raw['code'])) return null
      const token = raw['token']
      if (token !== undefined && !isString(token)) return null
      return token === undefined
        ? { type: 'hello', protocolVersion: raw['protocolVersion'], code: raw['code'] }
        : { type: 'hello', protocolVersion: raw['protocolVersion'], code: raw['code'], token }
    }

    case 'setProfile': {
      if (!isString(raw['nickname']) || !isString(raw['avatarId'])) return null
      return { type: 'setProfile', nickname: raw['nickname'], avatarId: raw['avatarId'] }
    }

    case 'leave':
      return { type: 'leave' }

    default:
      return null
  }
}
