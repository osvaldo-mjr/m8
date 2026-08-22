import { AVATARS, avatarGlyph } from '@m8/avatars'
import {
  NICKNAME_MAX_LENGTH,
  type DeviceSnapshot,
  type PhoneCatalogueEntry,
  type ServerToClient,
} from '@m8/protocol'
import { PERSON_COLOR_PROPERTY, seatColor } from '@m8/tokens'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { codeFromLocation, connectPhone, type PhoneClient } from './client.js'
import { PHONE_LOCALE, clampManualPage, fetchCatalogue, searchCatalogue } from './catalogue.js'
import { avatarTileClassName, describeProfileSubmission, primaryButtonClassName } from './profile.js'
import {
  NO_PHONE_ERRORS,
  START_NOT_YET_TEXT,
  actionRefusalText,
  determineScreen,
  errorText,
  nextErrorState,
  startReasonText,
  waitingText,
} from './screen.js'

/**
 * The screen is themed in this person's own colour, which is the same colour
 * their chip carries on the television, from the same seat number — the one
 * field neither side can disagree about, because it is assigned once when the
 * seat is created and never moves.
 *
 * Nobody without a seat has a colour: not before the server has answered at
 * all, and not the host, who may run the table without occupying a chair.
 * Those screens get no property at all and the stylesheet's fallback
 * applies. There is no table to search a seat out of any more — the device
 * itself carries its own `seatNumber`, so this is a direct read rather than a
 * lookup.
 */
function personTheme(device: DeviceSnapshot | null): CSSProperties {
  if (device === null || device.seatNumber === null) return {}
  return { [PERSON_COLOR_PROPERTY]: seatColor(device.seatNumber) } as CSSProperties
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

  // The only pieces of local state that are genuinely this device's own to
  // hold: what is currently typed or highlighted, which game it last tapped
  // in the catalogue, and which manual page it last asked for. Everything
  // about *which screen* is shown is derived below from what the server last
  // sent, never from a flag this component sets itself — see screen.ts.
  const [nickname, setNickname] = useState('')
  const [avatarId, setAvatarId] = useState<string>(AVATARS[0]?.id ?? '')
  const [hasProfile, setHasProfile] = useState(false)

  const [catalogue, setCatalogue] = useState<PhoneCatalogueEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [previewedGameId, setPreviewedGameId] = useState<string | null>(null)
  const [manualPage, setManualPage] = useState(0)

  const [device, setDevice] = useState<DeviceSnapshot | null>(null)
  // Two kinds of bad news, never one: a refusal of this device's session
  // replaces the screen, a refusal of one action is a line beside it. Which
  // is which is the server's answer, carried by the message type, and the
  // folding of a message into this pair is `nextErrorState` — pure, so both
  // kinds are tested without rendering anything.
  const [errors, setErrors] = useState(NO_PHONE_ERRORS)
  // Whether an enabled START has been tapped this session, so the tap can
  // answer honestly (see START_NOT_YET_TEXT) instead of doing nothing. Not
  // reset on its own: once a host has been told, re-showing the same answer
  // if the button happens to cycle disabled-then-enabled again is the right
  // default, not a bug to guard against.
  const [startTapped, setStartTapped] = useState(false)
  const client = useRef<PhoneClient | null>(null)

  useEffect(() => {
    // Platform content, identical for every table: fetched once, over HTTP,
    // independent of the table code. A game added to the catalogue must never
    // require rebuilding the phone, and a fetch that fails leaves the search
    // box empty rather than the app broken — there is nothing more targeted
    // to do with the failure than note it.
    fetchCatalogue()
      .then(setCatalogue)
      .catch((reason: unknown) => {
        console.error('Failed to fetch the game catalogue', reason)
      })
  }, [])

  useEffect(() => {
    if (code === null) return
    const phoneClient = connectPhone(code, (message: ServerToClient) => {
      setErrors((current) => nextErrorState(current, message))
      if (message.type === 'deviceState') setDevice(message.device)
    })
    client.current = phoneClient

    // The device's own name and face, if this is not the first time it has
    // joined this table — a reload must not ask a person to introduce
    // themselves twice just because the wire never echoes a profile back.
    if (phoneClient.storedProfile !== null) {
      setNickname(phoneClient.storedProfile.nickname)
      setAvatarId(phoneClient.storedProfile.avatarId)
      setHasProfile(true)
    }

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

  const screen = determineScreen(device, hasProfile, previewedGameId, errors.session)
  const theme = personTheme(device)

  /**
   * One refused action, printed where the person can see it without losing
   * the controls they were using. Rendered by the screens that can actually
   * provoke a refusal; the profile form and the waiting screen send nothing
   * that can be refused, so there is nothing for them to show.
   */
  const refusal =
    errors.action === null ? null : (
      <p className="mt-4 text-base" aria-live="polite">
        {actionRefusalText(errors.action)}
      </p>
    )

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
            setHasProfile(true)
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
                on the table's own terracotta, and the chosen one is filled with
                this person's colour — the colour they are about to become on
                the television.

                The fill alone is not the cue, and used to be. Against the old
                violet table the eight person colours ran 3.64:1 to 8.99:1;
                against terracotta they run 1.65:1 to 4.09:1, and coral —
                which the first person at every table is given — is 1.73:1,
                a slightly brighter orange square among orange squares. So the
                chosen tile also carries a border in the paper colour, which
                is 16.7:1 against the dark gaps between the tiles whatever
                colour the fill happens to be. Every tile carries the same
                border width, transparent when unchosen, so choosing one does
                not resize it and shove the grid. */}
            <div className="mt-3 grid grid-cols-3 gap-3">
              {AVATARS.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  aria-pressed={avatar.id === avatarId}
                  className={avatarTileClassName(avatar.id === avatarId)}
                  onClick={() => setAvatarId(avatar.id)}
                >
                  {avatar.glyph}
                </button>
              ))}
            </div>
          </div>

          {/* One shape for every button in this app, enabled and disabled —
              see `primaryButtonClassName`, which is also where the reason a
              disabled button is outlined rather than faded is written down. */}
          <button
            className={primaryButtonClassName(submission.canSubmit)}
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

  if (screen.kind === 'choosing') {
    const results = searchCatalogue(catalogue, searchQuery)

    return (
      <Shell style={theme}>
        <p className="m8-eyebrow text-sm">TABLE {code}</p>
        <p className="m8-eyebrow mt-6 text-xs">CHOOSE A GAME</p>

        <input
          className="mt-3 w-full rounded-2xl bg-table px-5 py-4 text-xl text-paper"
          placeholder="Search"
          aria-label="Search the catalogue"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />

        <div className="mt-6 flex flex-1 flex-col gap-4 overflow-y-auto">
          {results.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="flex items-center gap-4 rounded-2xl bg-table p-4 text-left"
              onClick={() => {
                setPreviewedGameId(entry.id)
                setManualPage(0)
                client.current?.send({ type: 'previewGame', gameId: entry.id })
              }}
            >
              <img src={entry.cover} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl">{entry.name[PHONE_LOCALE]}</p>
                <p className="truncate text-sm opacity-80">{entry.tagline[PHONE_LOCALE]}</p>
              </div>
              {/* Not merely styled differently — a coming-soon game must read
                  as one even to someone who cannot see colour, so the badge
                  carries the word itself. */}
              {entry.status === 'coming-soon' && (
                <span className="m8-eyebrow shrink-0 rounded-full border border-current px-3 py-1 text-xs">
                  SOON
                </span>
              )}
            </button>
          ))}
        </div>

        {refusal}
      </Shell>
    )
  }

  if (screen.kind === 'preview') {
    const entry = catalogue.find((candidate) => candidate.id === screen.gameId)

    // Reachable only for the instant between tapping a game and the fetched
    // catalogue actually holding it — the tap itself came from that same
    // catalogue, so this is not the steady state. There is nothing to preview
    // yet, so there is nothing to show but the fact that something is coming.
    if (entry === undefined) {
      return (
        <Shell style={theme}>
          <p className="text-2xl">Loading…</p>
        </Shell>
      )
    }

    const canPlay = entry.status === 'playable' && screen.device.canChooseGame

    return (
      <Shell style={theme}>
        <p className="m8-eyebrow text-sm">TABLE {code}</p>

        <button
          type="button"
          className="m8-eyebrow mt-6 self-start text-xs"
          onClick={() => setPreviewedGameId(null)}
        >
          ‹ BACK TO THE LIST
        </button>

        <div className="mt-6 flex flex-1 flex-col items-center justify-center">
          <img src={entry.cover} alt="" className="h-48 w-48 rounded-3xl object-cover" />
          <p className="mt-6 text-3xl">{entry.name[PHONE_LOCALE]}</p>
          {entry.status === 'coming-soon' && <p className="m8-eyebrow mt-2 text-xs">COMING SOON</p>}

          {/* The pages themselves turn on the large screen, where everyone
              can read them — the phone is sent no manual text at all, so
              these arrows are the whole of its interface to it. Both ends are
              clamped here, against the page count the catalogue carries: the
              server clamps too but never says so, so a phone that counted
              past the last page would spend the overshoot on taps that turn
              nothing. */}
          <div className="mt-8 flex items-center gap-8">
            <button
              type="button"
              aria-label="Previous page"
              className="text-4xl"
              onClick={() => {
                const next = clampManualPage(manualPage - 1, entry.pageCount)
                setManualPage(next)
                client.current?.send({ type: 'manualPage', page: next })
              }}
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next page"
              className="text-4xl"
              onClick={() => {
                const next = clampManualPage(manualPage + 1, entry.pageCount)
                setManualPage(next)
                client.current?.send({ type: 'manualPage', page: next })
              }}
            >
              ›
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={!canPlay}
          className={primaryButtonClassName(canPlay)}
          onClick={() => client.current?.send({ type: 'chooseGame', gameId: entry.id })}
        >
          PLAY THIS
        </button>

        {refusal}
      </Shell>
    )
  }

  if (screen.kind === 'waiting') {
    return (
      <Shell style={theme}>
        <p className="m8-eyebrow text-sm">TABLE {code}</p>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="text-2xl">{waitingText(screen.device.phase)}</p>
        </div>
      </Shell>
    )
  }

  // Only `screen.kind === 'seating'` remains, narrowed rather than checked —
  // the seating screen is the one place either the person's own seat or the
  // host's controls, or both, always has something to show: `determineScreen`
  // only ever returns this kind for a device that holds a seat, holds the
  // baton, or both.
  const snapshot = screen.device

  return (
    <Shell style={theme}>
      <p className="m8-eyebrow text-sm">TABLE {code}</p>

      {/* Own seat and colour — absent for a host who has stepped out of his
          own chair, since there is then no seat of his to show. This block
          reads `snapshot.seatNumber` fresh on every render, so a host who
          steps back out mid-session loses this block the same render his
          seat disappears, rather than a stale glyph lingering behind. */}
      {snapshot.seatNumber !== null && (
        <div className="m8-person-bg mt-6 flex flex-1 flex-col items-center justify-center rounded-3xl p-6 text-ink">
          <p className="text-8xl leading-none">{avatarGlyph(avatarId)}</p>
          <p className="mt-6 text-4xl">{nickname}</p>
        </div>
      )}

      {snapshot.hasBaton && (
        <div className="mt-6 flex flex-col gap-6 rounded-2xl bg-table p-5">
          <label className="flex items-center justify-between">
            <span className="m8-eyebrow text-sm">PLAYING</span>
            <input
              type="checkbox"
              checked={snapshot.seatNumber !== null}
              onChange={(event) =>
                client.current?.send({ type: 'setHostPlaying', playing: event.target.checked })
              }
            />
          </label>

          <div>
            {/* There is no wire message yet for actually starting a match —
                `canStart`/`playersNeeded` exist on `DeviceSnapshot` so this
                decision can be drawn now, but the trigger itself needs a real
                game to build an initial state from (see the design's §6.4),
                and the first one arrives with Plan 3. The button still lights
                up the moment the table is ready — that is this plan's own
                proof the server's decision reached the phone — so the tap is
                answered honestly instead of silently doing nothing. */}
            <button
              type="button"
              disabled={!snapshot.canStart}
              onClick={() => setStartTapped(true)}
              className={primaryButtonClassName(snapshot.canStart, { fullWidth: true })}
            >
              START
            </button>
            {snapshot.canStart && startTapped && (
              <p className="mt-3 text-base" aria-live="polite">
                {START_NOT_YET_TEXT}
              </p>
            )}
            {startReasonText(snapshot.playersNeeded) !== null && (
              <p className="mt-3 text-base" aria-live="polite">
                {startReasonText(snapshot.playersNeeded)}
              </p>
            )}
          </div>
        </div>
      )}

      {refusal}

      <p className="mt-6 text-xl">Watch the big screen.</p>
    </Shell>
  )
}
