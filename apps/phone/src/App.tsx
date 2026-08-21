import { AVATARS, avatarGlyph } from '@m8/avatars'
import { NICKNAME_MAX_LENGTH, type ErrorCode, type ServerToClient, type TableSnapshot } from '@m8/protocol'
import { PERSON_COLOR_PROPERTY, personColor } from '@m8/tokens'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { codeFromLocation, connectPhone, type PhoneClient } from './client.js'
import { describeProfileSubmission } from './profile.js'
import { determineScreen, errorText } from './screen.js'

/**
 * The screen is themed in this person's own colour, which is the same colour
 * their chip carries on the television. Both read it from the same place —
 * the participant's index in the snapshot the server sent — so the two
 * cannot disagree about who is coral.
 *
 * Nobody has a colour before the server has answered; those screens get no
 * property at all and the stylesheet's fallback applies.
 */
function personTheme(table: TableSnapshot | null, participantId: string | null): CSSProperties {
  if (table === null || participantId === null) return {}
  const arrivalIndex = table.participants.findIndex((person) => person.id === participantId)
  if (arrivalIndex < 0) return {}
  return { [PERSON_COLOR_PROPERTY]: personColor(arrivalIndex) } as CSSProperties
}

/**
 * Ground everywhere, no neutral panel anywhere: a phone in this room is one
 * saturated surface, the same as the television it is looking at.
 */
function Shell({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <main className="flex min-h-dvh flex-col bg-ground p-6 text-paper" style={style}>
      {children}
    </main>
  )
}

export function App() {
  const code = codeFromLocation(window.location.pathname)

  // The only two pieces of local state that are genuinely this device's own
  // opinion: what is currently typed, and which avatar is highlighted.
  // Everything about *which screen* is shown is derived below from what the
  // server last sent, never from a flag this component sets itself.
  const [nickname, setNickname] = useState('')
  const [avatarId, setAvatarId] = useState<string>(AVATARS[0]?.id ?? '')

  const [table, setTable] = useState<TableSnapshot | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)
  const [error, setError] = useState<ErrorCode | null>(null)
  const client = useRef<PhoneClient | null>(null)

  useEffect(() => {
    if (code === null) return
    const phoneClient = connectPhone(code, (message: ServerToClient) => {
      if (message.type === 'welcome') {
        setParticipantId(message.participantId)
        // Cleared here, not left latched: the server restarting means every
        // phone in the room greets a table that no longer exists and is told
        // so. Whoever then scans the fresh code on the screen must land back
        // at the table, not stay parked on the failure that preceded it.
        setError(null)
      }
      if (message.type === 'tableState') setTable(message.table)
      if (message.type === 'error') setError(message.code)
    })
    client.current = phoneClient

    // StrictMode mounts, cleans up, then mounts again in development. This
    // teardown is what keeps that a single live connection rather than two:
    // without it, both the discarded socket and its replacement would greet
    // the server, and the server would mint two participants for one phone.
    return () => {
      phoneClient.disconnect()
      client.current = null
    }
  }, [code])

  if (code === null) {
    return (
      <Shell>
        <p className="text-2xl">Scan the code shown on the screen.</p>
      </Shell>
    )
  }

  const screen = determineScreen(table, participantId, error)
  const theme = personTheme(table, participantId)

  if (screen.kind === 'error') {
    return (
      <Shell>
        <p className="m8-eyebrow m8-person-text text-lg">SOMETHING WENT WRONG</p>
        <p className="mt-4 text-2xl">{errorText(screen.code)}</p>
      </Shell>
    )
  }

  if (screen.kind === 'connecting') {
    return (
      <Shell>
        <p className="text-2xl">Joining the table…</p>
      </Shell>
    )
  }

  if (screen.kind === 'no-seat') {
    return (
      <Shell>
        <p className="text-2xl">You are not seated at this table.</p>
      </Shell>
    )
  }

  if (screen.kind === 'profile') {
    const submission = describeProfileSubmission(nickname)

    return (
      <Shell style={theme}>
        <p className="m8-eyebrow text-sm">TABLE {code}</p>

        <form
          className="mt-8 flex flex-col gap-8"
          onSubmit={(event) => {
            event.preventDefault()
            if (!submission.canSubmit) return
            client.current?.send({ type: 'setProfile', nickname, avatarId })
          }}
        >
          <div>
            <label className="m8-eyebrow text-xs" htmlFor="nickname">
              YOUR NAME
            </label>
            <input
              id="nickname"
              className="mt-3 w-full rounded-2xl bg-table px-5 py-4 text-2xl text-paper"
              maxLength={NICKNAME_MAX_LENGTH}
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
            />
          </div>

          <div>
            <p className="m8-eyebrow text-xs">YOUR FACE</p>
            {/* The palette, not a grid of grey tiles: an unchosen face sits
                on the table's own violet, and the chosen one is filled with
                this person's colour — the colour they are about to become on
                the television. */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {AVATARS.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={avatar.id === avatarId}
                  className={
                    avatar.id === avatarId
                      ? 'm8-person-bg rounded-2xl py-6 text-4xl'
                      : 'rounded-2xl bg-table py-6 text-4xl'
                  }
                  onClick={() => setAvatarId(avatar.id)}
                >
                  {avatar.glyph}
                </button>
              ))}
            </div>
          </div>

          {/* Disabled is drawn as an outline in this person's colour, not as
              the same button faded out: a saturated colour at 40% over the
              ground turns to mud, and mud is the one thing the palette is
              not allowed to produce. */}
          <button
            className={
              submission.canSubmit
                ? 'm8-person-bg m8-eyebrow rounded-2xl py-5 text-lg text-ink'
                : 'm8-person-text m8-eyebrow rounded-2xl border-2 border-current py-5 text-lg'
            }
            type="submit"
            disabled={!submission.canSubmit}
          >
            TAKE A PLACE
          </button>
          {submission.reason !== null && (
            <p className="-mt-4 text-base" aria-live="polite">
              {submission.reason}
            </p>
          )}
        </form>
      </Shell>
    )
  }

  const me = screen.table.participants.find((person) => person.id === participantId)
  const glyph = me === undefined ? null : avatarGlyph(me.avatarId)

  return (
    <Shell style={theme}>
      <p className="m8-eyebrow text-sm">TABLE {screen.table.code}</p>

      {/* One block of this person's colour, filling the hand that is holding
          it. Whoever glances between the phone and the television is looking
          for the same colour twice, not for their name. */}
      <div className="m8-person-bg mt-6 flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-ink">
        <p className="text-8xl leading-none">{glyph}</p>
        <p className="mt-6 text-4xl">{me === undefined ? '' : me.nickname}</p>
      </div>

      <p className="mt-6 text-xl">{screen.table.participants.length} here</p>
      <p className="mt-1 text-xl">Watch the big screen.</p>
    </Shell>
  )
}
