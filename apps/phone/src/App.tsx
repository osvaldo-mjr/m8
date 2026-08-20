import { AVATARS } from '@m8/avatars'
import { NICKNAME_MAX_LENGTH, type ErrorCode, type ServerToClient, type TableSnapshot } from '@m8/protocol'
import { useEffect, useRef, useState } from 'react'
import { codeFromLocation, connectPhone, type PhoneClient } from './client.js'
import { describeProfileSubmission } from './profile.js'
import { determineScreen, errorText } from './screen.js'

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
    return <p className="p-6 text-lg">Scan the code shown on the screen.</p>
  }

  const screen = determineScreen(table, participantId, error)

  if (screen.kind === 'error') {
    return <p className="p-6 text-lg text-clay">{errorText(screen.code)}</p>
  }

  if (screen.kind === 'connecting') {
    return <p className="p-6 text-lg">Joining the table…</p>
  }

  if (screen.kind === 'no-seat') {
    return <p className="p-6 text-lg">You are not seated at this table.</p>
  }

  if (screen.kind === 'profile') {
    const submission = describeProfileSubmission(nickname)

    return (
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (!submission.canSubmit) return
          client.current?.send({ type: 'setProfile', nickname, avatarId })
        }}
      >
        <label className="text-lg" htmlFor="nickname">
          Your name
        </label>
        <input
          id="nickname"
          className="rounded-lg bg-felt-700 p-4 text-xl"
          maxLength={NICKNAME_MAX_LENGTH}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
        />

        <div className="grid grid-cols-3 gap-3">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              aria-pressed={avatar.id === avatarId}
              className={
                avatar.id === avatarId
                  ? 'rounded-lg bg-brass p-4 text-4xl'
                  : 'rounded-lg bg-felt-700 p-4 text-4xl'
              }
              onClick={() => setAvatarId(avatar.id)}
            >
              {avatar.glyph}
            </button>
          ))}
        </div>

        <button
          className="rounded-lg bg-brass p-4 text-xl text-felt-900 disabled:opacity-40"
          type="submit"
          disabled={!submission.canSubmit}
        >
          Take a place
        </button>
        {submission.reason !== null && (
          <p className="text-sm text-chalk opacity-70" aria-live="polite">
            {submission.reason}
          </p>
        )}
      </form>
    )
  }

  return (
    <div className="p-6">
      <p className="text-2xl">You are at table {screen.table.code}</p>
      <p className="mt-2 text-lg opacity-70">{screen.table.participants.length} here</p>
    </div>
  )
}
