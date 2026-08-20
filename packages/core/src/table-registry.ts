import { isAvatarId } from '@m8/avatars'
import type { Clock } from './clock.js'
import type { DomainEvent } from './events.js'
import type { IdSource } from './ids.js'
import { generateTableCode, normalizeTableCode } from './table-code.js'
import type { Rng } from './rng.js'
import type { Participant, Table, TablePhase } from './table.js'
import type { DomainError, ParticipantView, TableView } from './views.js'

export const NICKNAME_MAX_LENGTH = 16

/**
 * How many people one table holds. Not a game rule — seats come from a game
 * manifest and are a separate count — but a bound on the process: without one,
 * a single table accepts participants until the machine runs out of memory,
 * and the large screen has to render a list nobody can read at three metres.
 * Eight is comfortably above any game in the catalogue.
 */
export const MAX_PARTICIPANTS = 8

/**
 * How many times a colliding code is redrawn before giving up. The code space
 * is finite and nothing evicts a table yet, so "keep trying" is a way to hang
 * the event loop with no diagnosis; this turns that into a refusal the caller
 * can answer for.
 */
const MAX_CODE_ATTEMPTS = 100

const DEFAULT_NICKNAME = ''
const DEFAULT_AVATAR = 'unset'

export interface TableRegistryOptions {
  readonly clock: Clock
  readonly rng: Rng
  readonly newParticipantId: IdSource
  readonly newToken: IdSource
  /** The instance character that opens every code this process issues. */
  readonly shard: string
}

/**
 * Opening a table can refuse. It is a returned value and not a thrown error
 * on purpose: the caller is the server's message handling, which runs inside
 * a socket event listener with no catch above it anywhere.
 */
export type OpenTableResult =
  | { readonly table: Table }
  | { readonly error: DomainError }

export type JoinResult =
  | { readonly table: Table; readonly participant: Participant; readonly events: DomainEvent[] }
  | { readonly error: DomainError }

/**
 * The registry's own writable shape. `Table` and `Participant` (exported to
 * everyone else) are readonly all the way down, so a consumer outside this
 * class can read a table but cannot mutate it without going through a method
 * that emits the `DomainEvent` describing the change. A `MutableTable` is
 * structurally assignable to a `Table` — same object, narrower type at the
 * boundary — which is why the public methods can just return one.
 */
interface MutableParticipant {
  readonly id: string
  readonly token: string
  nickname: string
  avatarId: string
  connected: boolean
  readonly joinedAt: number
}

interface MutableTable {
  readonly code: string
  phase: TablePhase
  readonly participants: MutableParticipant[]
  batonHolderId: string | null
  readonly createdAt: number
}

/**
 * Holds every live table. Deliberately in memory: a table lives while its
 * screen is on, and persisting match state would mean migrating each game's
 * saved shape whenever its rules change.
 *
 * Access goes through this class rather than a bare map, so replacing it with
 * a persistent store later is a new implementation and not a rewrite.
 */
export class TableRegistry {
  readonly #tables = new Map<string, MutableTable>()
  readonly #clock: Clock
  readonly #newParticipantId: IdSource
  readonly #newToken: IdSource
  readonly #shard: string
  #rng: Rng

  constructor(options: TableRegistryOptions) {
    this.#clock = options.clock
    this.#rng = options.rng
    this.#newParticipantId = options.newParticipantId
    this.#newToken = options.newToken
    this.#shard = options.shard
  }

  getTable(code: string): Table | undefined {
    return this.#findMutable(code)
  }

  /**
   * What a screen presents when it opens: the table behind a remembered code
   * if that table still exists, otherwise a new one. Whether an unknown or
   * expired code should reopen a table or start over is a decision about
   * tables, so it lives here rather than in the transport-facing layer that
   * calls it.
   *
   * The only way to obtain a table, and it refuses rather than throws.
   * Reopening a code that already names a live table always succeeds; only
   * minting a fresh one can run out.
   */
  openTable(code?: string): OpenTableResult {
    const existing = code === undefined ? undefined : this.#findMutable(code)
    if (existing) return { table: existing }

    const minted = this.#mintCode()
    if (minted === undefined) return { error: 'table-unavailable' }

    const table: MutableTable = {
      code: minted,
      phase: 'awaiting-host',
      participants: [],
      batonHolderId: null,
      createdAt: this.#clock.now(),
    }
    this.#tables.set(minted, table)
    return { table }
  }

  joinParticipant(code: string, token: string | undefined): JoinResult {
    const normalized = normalizeTableCode(code)
    if (normalized === null) return { error: 'invalid-code' }

    const table = this.#tables.get(normalized)
    if (!table) return { error: 'unknown-table' }

    const returning = token === undefined
      ? undefined
      : table.participants.find((p) => p.token === token)

    if (returning) {
      returning.connected = true
      return {
        table,
        participant: returning,
        events: [{ type: 'participant-rejoined', code: table.code, participantId: returning.id }],
      }
    }

    // Checked only on this path: a returning token takes no new place,
    // because the participant it names already occupies one.
    if (table.participants.length >= MAX_PARTICIPANTS) return { error: 'table-full' }

    const participant: MutableParticipant = {
      id: this.#newParticipantId(),
      token: this.#newToken(),
      nickname: DEFAULT_NICKNAME,
      avatarId: DEFAULT_AVATAR,
      connected: true,
      joinedAt: this.#clock.now(),
    }
    table.participants.push(participant)

    const events: DomainEvent[] = [
      { type: 'participant-joined', code: table.code, participantId: participant.id },
    ]

    if (table.batonHolderId === null) {
      table.batonHolderId = participant.id
      table.phase = 'choosing-game'
      events.push({ type: 'baton-granted', code: table.code, participantId: participant.id })
    }

    return { table, participant, events }
  }

  disconnectParticipant(code: string, participantId: string): DomainEvent[] {
    const table = this.#findMutable(code)
    const participant = table?.participants.find((p) => p.id === participantId)
    if (!table || !participant) return []

    participant.connected = false
    return [{ type: 'participant-disconnected', code: table.code, participantId }]
  }

  removeParticipant(code: string, participantId: string): DomainEvent[] {
    const table = this.#findMutable(code)
    if (!table) return []

    const index = table.participants.findIndex((p) => p.id === participantId)
    if (index === -1) return []

    table.participants.splice(index, 1)
    const events: DomainEvent[] = [
      { type: 'participant-left', code: table.code, participantId },
    ]

    if (table.batonHolderId !== participantId) return events

    // The baton is leased to the table, not carried by the person, so it moves
    // to whoever has been here longest rather than ending the session.
    const successor = table.participants[0]
    if (successor) {
      table.batonHolderId = successor.id
      events.push({ type: 'baton-migrated', code: table.code, participantId: successor.id })
    } else {
      table.batonHolderId = null
      table.phase = 'awaiting-host'
      events.push({ type: 'table-emptied', code: table.code })
    }

    return events
  }

  setProfile(code: string, participantId: string, nickname: string, avatarId: string): DomainEvent[] {
    const table = this.#findMutable(code)
    const participant = table?.participants.find((p) => p.id === participantId)
    if (!table || !participant) return []

    const trimmed = nickname.trim()
    // A blank nickname carries no information about intent: the empty
    // string is also the sentinel a client reads as "no profile chosen
    // yet", so accepting one here would make that sentinel ambiguous with a
    // deliberate choice. Treated as no change at all, not a change to an
    // empty nickname, so a stray submit cannot discard an avatar pick either.
    if (trimmed === '') return []

    // An id naming no avatar carries no intent either, and the server is the
    // only thing standing between a hand-written message and a value every
    // screen in the room then renders. Same rule as the blank nickname: not a
    // change to something else, no change at all.
    if (!isAvatarId(avatarId)) return []

    participant.nickname = trimmed.slice(0, NICKNAME_MAX_LENGTH)
    participant.avatarId = avatarId
    return [{ type: 'profile-changed', code: table.code, participantId }]
  }

  /** The full public view of a table. Tokens never appear here. */
  snapshot(table: Table): TableView {
    const participants: ParticipantView[] = table.participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarId: p.avatarId,
      connected: p.connected,
      hasBaton: table.batonHolderId === p.id,
    }))

    return { code: table.code, phase: table.phase, participants }
  }

  /** A code no live table holds, or undefined once the space is full. */
  #mintCode(): string | undefined {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      const [candidate, nextRng] = generateTableCode(this.#rng, this.#shard)
      this.#rng = nextRng
      if (!this.#tables.has(candidate)) return candidate
    }
    return undefined
  }

  #findMutable(code: string): MutableTable | undefined {
    const normalized = normalizeTableCode(code)
    return normalized === null ? undefined : this.#tables.get(normalized)
  }
}
