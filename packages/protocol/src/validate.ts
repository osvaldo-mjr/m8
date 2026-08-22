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

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
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
      const round = raw['round']
      if (round !== undefined && !isNumber(round)) return null

      const { protocolVersion, code } = raw
      if (token !== undefined && round !== undefined) {
        return { type: 'hello', protocolVersion, code, token, round }
      }
      if (token !== undefined) return { type: 'hello', protocolVersion, code, token }
      if (round !== undefined) return { type: 'hello', protocolVersion, code, round }
      return { type: 'hello', protocolVersion, code }
    }

    case 'setProfile': {
      if (!isString(raw['nickname']) || !isString(raw['avatarId'])) return null
      return { type: 'setProfile', nickname: raw['nickname'], avatarId: raw['avatarId'] }
    }

    case 'leave':
      return { type: 'leave' }

    case 'previewGame': {
      if (!isString(raw['gameId'])) return null
      return { type: 'previewGame', gameId: raw['gameId'] }
    }

    case 'manualPage': {
      // Only the type is checked here, not the range. A page arrow held
      // down is exactly what produces a value past either end, and the
      // server clamps it rather than the wire refusing it — see
      // apps/server/src/translate.ts:clampPage.
      const page = raw['page']
      if (!isNumber(page)) return null
      return { type: 'manualPage', page }
    }

    case 'chooseGame': {
      if (!isString(raw['gameId'])) return null
      return { type: 'chooseGame', gameId: raw['gameId'] }
    }

    case 'setHostPlaying': {
      if (!isBoolean(raw['playing'])) return null
      return { type: 'setHostPlaying', playing: raw['playing'] }
    }

    default:
      return null
  }
}
