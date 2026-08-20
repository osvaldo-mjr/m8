import type { DomainError, ParticipantView, TableView } from '@m8/core'
import type { ErrorCode, ParticipantSnapshot, TableSnapshot } from '@m8/protocol'

/**
 * The only place that knows both `@m8/core`'s vocabulary and the wire
 * vocabulary from `@m8/protocol`. The two happen to coincide today, field for
 * field, but that is a coincidence, not a guarantee: core is free to grow a
 * field the wire never needs to see (or vice versa) without either package
 * knowing the other exists. Written as explicit field-by-field construction,
 * not a cast and not a spread, so a new field on either side has to be
 * decided here rather than forwarded silently.
 */
export function translateParticipant(participant: ParticipantView): ParticipantSnapshot {
  return {
    id: participant.id,
    nickname: participant.nickname,
    avatarId: participant.avatarId,
    connected: participant.connected,
    hasBaton: participant.hasBaton,
  }
}

export function translateTable(table: TableView): TableSnapshot {
  return {
    code: table.code,
    phase: table.phase,
    participants: table.participants.map(translateParticipant),
  }
}

/**
 * A `Record`, not a `switch`, so that adding a member to `DomainError`
 * without updating this table is a type error rather than a silent
 * `undefined` reaching the wire.
 */
const DOMAIN_ERROR_TO_ERROR_CODE: Record<DomainError, ErrorCode> = {
  'unknown-table': 'unknown-table',
  'invalid-code': 'invalid-code',
  'table-full': 'table-full',
  'not-allowed': 'not-allowed',
  'table-unavailable': 'table-unavailable',
}

export function translateError(error: DomainError): ErrorCode {
  return DOMAIN_ERROR_TO_ERROR_CODE[error]
}
