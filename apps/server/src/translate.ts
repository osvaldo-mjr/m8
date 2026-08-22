import type { GameManifest } from '@m8/contract'
import type { DeviceView, DomainError, ParticipantView, SeatView, TableView } from '@m8/core'
import type {
  DeviceSnapshot,
  ErrorCode,
  ParticipantSnapshot,
  PreviewSnapshot,
  SeatSnapshot,
  TableSnapshot,
} from '@m8/protocol'
import { coverUrl } from './catalogue.js'

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

export function translateSeat(seat: SeatView): SeatSnapshot {
  return {
    number: seat.number,
    occupant: seat.occupant === null ? null : translateParticipant(seat.occupant),
  }
}

export function translateDevice(device: DeviceView): DeviceSnapshot {
  return {
    participantId: device.participantId,
    phase: device.phase,
    seatNumber: device.seatNumber,
    hasBaton: device.hasBaton,
    canChooseGame: device.canChooseGame,
    canStart: device.canStart,
    playersNeeded: device.playersNeeded,
  }
}

/**
 * How many pages a manifest's manual holds. The two locales are meant to
 * carry the same count; the lower of the two is used so a locale that
 * somehow fell behind can never be indexed past its own end.
 *
 * Exported so `session.ts` can clamp an incoming `manualPage` against the
 * same count this file resolves against — one formula, not two that could
 * drift.
 */
export function manifestPageCount(manifest: GameManifest): number {
  return Math.min(manifest.manual['pt-BR'].length, manifest.manual.en.length)
}

/**
 * Confines `page` to `[0, pageCount - 1]`. Exported so `session.ts` can apply
 * the same rule to an incoming `manualPage` before it ever reaches core — the
 * one file both call, so the boundary cannot drift between where a page is
 * requested and where it is resolved.
 */
export function clampPage(page: number, pageCount: number): number {
  return Math.min(Math.max(page, 0), pageCount - 1)
}

/**
 * Turns core's `{ gameId, page }` — a number, nothing else, because core may
 * not read a manifest — into the text and cover art the screen renders.
 *
 * A `gameId` naming no manifest resolves to `null` rather than throwing: the
 * only way to reach this is a game withdrawn between the tap that previewed
 * it and this translation, and a screen briefly showing a bare table beats
 * one showing a stack trace.
 */
function translatePreview(
  preview: TableView['preview'],
  catalogue: readonly GameManifest[],
): PreviewSnapshot | null {
  if (preview === null) return null

  const manifest = catalogue.find((candidate) => candidate.id === preview.gameId)
  if (!manifest) return null

  const count = manifestPageCount(manifest)
  const page = clampPage(preview.page, count)

  return {
    gameId: manifest.id,
    cover: coverUrl(manifest),
    name: manifest.name,
    page,
    pageCount: count,
    title: {
      'pt-BR': manifest.manual['pt-BR'][page]!.title,
      en: manifest.manual.en[page]!.title,
    },
    lines: {
      'pt-BR': manifest.manual['pt-BR'][page]!.lines,
      en: manifest.manual.en[page]!.lines,
    },
  }
}

export function translateTable(table: TableView, catalogue: readonly GameManifest[]): TableSnapshot {
  return {
    code: table.code,
    phase: table.phase,
    participants: table.participants.map(translateParticipant),
    seats: table.seats.map(translateSeat),
    qrVisible: table.qrVisible,
    preview: translatePreview(table.preview, catalogue),
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
  'stale-round': 'stale-round',
}

export function translateError(error: DomainError): ErrorCode {
  return DOMAIN_ERROR_TO_ERROR_CODE[error]
}
