# M8 — Platform Design

**Date:** 2026-08-20
**Status:** Approved, ready for implementation planning
**Scope of this document:** Milestone 1 (the foundation plus one game), with the
seams that keep Milestones 2-5 possible recorded explicitly.

---

## 1. Summary

M8 is a browser-based platform for turn-based board and card games played by
people in the same room. A large screen shows the board; each player uses their
own phone as a controller and as their private information.

**The TV is the table. The phone is your hand.**

The catalogue is public-domain games, so there is nothing to license. Nothing is
installed and nothing is bought.

The bet the project makes: turn-based play hides latency and lets the big screen
be the source of truth, which is exactly where existing free alternatives go
wrong by chasing real-time input on a device that is bad at it.

The primary goal is **portfolio**: this repository is meant to be read during an
interview. The secondary goal is that it can become a product, which is why the
platform and the game rules are separate from day one.

---

## 2. Goals and non-goals of the design

### Goals

- A foundation where a game is a plug-in with a clear contract, not a special
  case in the platform.
- Two distinct screen roles — large screen and phone — with distinct
  responsibilities, not one responsive UI.
- A large-screen build light enough for a Samsung or LG TV up to five years old,
  with that lightness enforced by CI rather than promised.
- Reconnection and player rotation handled by one idea rather than a pile of
  special cases.
- Tests that run in milliseconds and cover the parts that are genuinely hard.

### Non-goals for milestone 1

Accounts, payments, persistence of any kind, end-to-end tests, spectators, bot
players, chat, voice, sound, ranking, history, multiple server instances, native
apps.

Most of these are on the roadmap. They are listed so the decision does not get
re-litigated halfway through.

---

## 3. Glossary

| pt-BR | English | Meaning |
|---|---|---|
| mesa | table | A session tied to one large screen |
| assento | seat | A role in a game, not a person |
| bastão | baton | Control of the session |
| anfitrião | host | The baton holder |
| dono da sessão | session owner | Where the catalogue entitlement comes from |
| partida | match | One play-through of a game |
| jogada | action | A move submitted by a seat |

The repository is written in English. This table exists so the translation stays
consistent, since the product domain was thought out in Portuguese.

---

## 4. Decisions

Each decision records what was chosen, why, and what was rejected. This section
is the reason the document exists.

### 4.1 Large-screen target: Samsung Tizen and LG webOS, up to ~5 years old

The TV is the primary target; PC-over-HDMI and dongles follow for free. Models
from 2020-2021 run **Chromium 68-79**, which sets hard constraints:

- Compile the TV bundle to **ES2017**. Optional chaining and nullish coalescing
  are not available.
- No flexbox `gap` (Chromium 84+).
- Overscan is real: keep 5% safe margins.

**Consequence:** "light" becomes testable rather than aspirational. CI enforces
both a bundle-size budget and emitted-syntax compatibility.

### 4.2 Multiple tables per server, with a room code

Each large screen that opens M8 creates a table with a short code. Rejected: one
table per server, which is simpler now but makes routing, state and protocol all
change together on the day it needs to scale.

### 4.3 The flow, corrected

The original sketch had everyone joining before the game was chosen. The actual
flow is:

1. The large screen opens M8 and shows only a table and a QR code.
2. The first phone to connect becomes the **host** and receives the **baton**.
3. The large screen loads the catalogue, presented as boards laid out on a table.
   Everyone in the room helps choose by looking at the TV; only the host chooses.
4. The host picks a game from their phone.
5. The large screen shows the code and QR for the remaining seats. **The host
   takes seat 1**; they are a player like anyone else, in addition to holding the
   baton.
6. Remaining seats fill in arrival order, up to the game maximum. Extra arrivals
   are **refused** ("table full").
7. The host decides when the match starts. Starting requires at least the
   manifest's **minimum** seats to be occupied; the control is disabled until
   then, with the screen and the host's phone saying how many are still needed.
8. Play.

**Consequence:** there are no spectators in milestone 1. Seat count comes from
the chosen game.

### 4.4 A seat is a role, not a person

This single idea resolves rotation, reconnection and baton migration. Seats
reference participants; they never own them.

### 4.5 Disconnect and departure are different events

- **Disconnect** pauses the match and holds the seat for a 60-second window,
  keyed on the participant token. The same phone returning resumes exactly where
  it was.
- **Explicit departure** vacates the seat immediately. Whoever takes it inherits
  the match in progress.

Rejected: treating both the same. A three-second Wi-Fi blip should not cost
someone their seat, and a deliberate exit should not make the room wait.

### 4.6 A vacant seat blocks the turn, and the replacement comes from outside

There is no turn skipping and no cover from within the table — every seat is
already occupied, so a replacement is necessarily someone new. The match waits in
a dedicated state, the large screen asks for a specific seat, and whoever joins
inherits the board as it stands.

### 4.7 The wait for a vacant seat is indefinite

No timer runs while the room looks for someone. Only the baton holder can end the
match. Rejected: an automatic timeout, which decides for the room at exactly the
moment the room is still deciding.

### 4.8 Session owner and baton are separate concepts

Today the session owner is implicit and everything is free. Later it is an
account that carries the catalogue entitlement. The baton — choose game, arrange
seats, start match — is transferable and independent.

**Consequences:**

- The baton can be passed and the match continues, because the entitlement is
  leased to the table rather than carried by the person.
- If the baton holder disconnects and the window expires, the baton migrates
  automatically to the longest-present remaining participant. The table survives.
- If the original host returns, they rejoin as an ordinary participant.

### 4.9 No persistence of table or match state

Table and match state are ephemeral by nature: they live while the large screen
is on, last minutes, and nobody wants to resume yesterday's game. Persisting them
would mean serializing **every game's** state and migrating saved states whenever
a game's rules change — the worst kind of work for the smallest benefit.

**This does not mean the project has no database.** Accounts, entitlements and
payments are durable relational data and will use Postgres from milestone 3. The
two are different data problems and conflating them was an early error in this
discussion.

**Deploys do not need persistence** because of the draining strategy in §4.19.
What remains uncovered is an unexpected crash, whose real cost is "open it again
and rescan" — about twenty seconds. Recorded as accepted.

### 4.10 Repository language: English

Code, identifiers, comments, commit messages, README, specs and CLAUDE.md are in
English, because the target is an international portfolio. Conversation with the
owner remains in Portuguese.

### 4.11 Player-facing UI: real i18n, pt-BR and en, from the start

No i18n library — the large screen cannot afford one and the problem is small
enough not to need one. One dictionary per locale, typed keys so a missing key
fails to compile, and no loose strings in the code.

**Each device picks its own locale**, detected from the browser, with a way to
change it. The locale is client-local data and never enters table state or the
protocol.

### 4.12 The catalogue is data, and unavailable games are data too

The large screen shows several boards; only tic-tac-toe is playable in milestone
1, the rest are visibly "coming soon". This forces the catalogue to be a list of
manifests rather than a special case, and makes the selection step real instead
of decorative.

### 4.13 Transport: Socket.IO, behind a `Transport` interface

**Why Socket.IO and not raw WebSocket.** The reconnection work that looks
expensive is mostly domain logic — which participant is this, which seat did they
hold, has the window expired, what projection do they get — and that is written
either way. Socket.IO saves the backoff loop and the heartbeat, which is real but
modest.

The decisive argument is different: the target is a TV browser where **DevTools
cannot be opened** and where WebSocket can hit proxy or firmware trouble. Socket.
IO falls back to long-polling automatically. In a turn-based game latency does
not matter, so paying roughly 35 KB for an insurance policy against the hardware
that is hardest to debug is a clearly good trade.

**The condition:** Socket.IO enters as a transport, not as an architecture. All
platform code talks to a `Transport` interface (`send`, `onMessage`,
`onConnectionChange`). This yields three things: game code never learns Socket.IO
exists; swapping to raw WebSocket later is writing one class; and tests use a
**fake in-memory transport**, so the entire table state machine — including
disconnects and reconnections — is tested with no network at all.

The 35 KB figure is **unverified** and will be measured. The bundle budget in CI
is the enforcement.

### 4.14 Rendering: vanilla on the large screen, React on the phone

The large screen is structurally near-static — a board, avatars, a turn
highlight — so hand-written DOM is small and fast on weak hardware. The phone
changes screens constantly and has forms, which is where hand-written DOM causes
synchronization bugs.

**React rather than Preact on the phone**, decided on portfolio grounds: React is
the term a recruiter recognizes and asks about, the learning material is far
deeper, and Preact's only advantage is size — which matters on the TV, where no
framework is used at all.

**Useful consequence:** because the two sides use different technologies, the
game view contract is forced to be technology-agnostic from day one.

### 4.15 CSS: Tailwind v3 on the large screen, Tailwind v4 on the phone

Tailwind v4 requires Chrome 111+ (it relies on `@property`, `color-mix()` and
cascade layers) and would break visually on the TV target. v3 emits plain CSS and
is safe there. The phone has no such constraint and uses the current version.

**Cost and mitigation:** two Tailwind versions configure differently, and the
palette could drift between the two screens — which would be visible in a video
showing both. Design tokens therefore live in **one shared package as CSS custom
properties**, and both Tailwind configurations merely point at them. Single source
of truth, two consumers. Collapsing to v3 everywhere later is an afternoon of
work if the split becomes annoying.

### 4.16 Server language: TypeScript

Go was seriously considered and rejected on one argument: a game is rules (server)
plus two views (browser). In TypeScript that is **one package, one language, with
`TableView` and `SeatView` verified by the compiler on both sides**. In Go, every
game would be written in two languages and the contract would degrade to code
generation or manual discipline — attacking the best idea in the project.

Two supporting points: Node is single-threaded, so mutable in-memory table state
has no data races, whereas Go would need a mutex or actor pattern per table; and
Socket.IO is first-class in Node, whereas Go would mean raw WebSocket and losing
the long-polling fallback that motivated §4.13.

Go remains available for a later, separate service (accounts or billing) that
shares no types with any game.

### 4.17 Game contract: pure functions over serializable state, with Immer

Rules are pure functions; the server holds the state. `validate` is separate from
`apply`, so an invalid move is refused without touching state. Two projections —
`projectTable` and `projectSeat` — mean a phone never receives full match state,
so private information cannot leak even with DevTools open.

**Why not a stateful class.** A class needs `fromSnapshot`/`toSnapshot` to be
testable at all, at which point the state is already a separate value and the
class is a wrapper — so the state being a value is the real requirement. Beyond
that, at scale the stateful version loses three ways: constructing the
interesting mid-game situation becomes impractical, so those tests stop being
written; a bot cannot cheaply ask "what if I played here"; and a match cannot be
moved between processes. `boardgame.io`, the largest open-source project in this
exact space, uses pure reducers over immutable state for the same reasons.

**Immer removes the verbosity**, which was the honest objection: rules are
written with mutation syntax and produce immutable values. Clocks and randomness
enter as inputs — a chess clock is a `tick` action, the RNG is seeded and its
state lives in match state — which makes both easier to test, not harder.

**The object still exists, in the platform.** A single `Match` class, written
once and shared by every game, holds the state and delegates to the rules. Game
authors write pure functions; the server uses a comfortable object.

`boardgame.io` itself was evaluated and rejected as a dependency: it would
replace the platform layer that is the core of this portfolio, and it has no
concept of a separate TV and phone.

### 4.18 Game packaging: monorepo package, own bundles, loaded on demand

Each game is a workspace producing rules (imported by the server), `tv.js` and
`phone.js` (served as files). The large screen injects a script tag and waits for
the module to register; the phone uses dynamic `import()`. Nothing game-related
loads before the host chooses.

On the server, games enter through a **single composition file** — the only place
in the server that names a game. Everything else talks to a `GameRegistry`.

Manifests declare the **contract version** they implement; the server refuses an
incompatible game with a clear error rather than failing mid-match.

Rejected: bundling games into the app builds (games become compile-time
dependencies and the separation degrades to a folder convention), and full
runtime plugin discovery on the server (versioning, isolation and trust in
third-party code — real problems, far too early).

### 4.19 Deployment: single instance, draining on deploy

Socket.IO needs persistent connections, so purely serverless platforms are out.

Because state lives in memory, **exactly one process** may run. Two instances
means tables invisible to each other. This is a written limit, not a surprise:
until persistence exists, M8 scales vertically only.

**Deploys use routing-based draining**, the pattern the owner has used before
with Traefik: bring up the new container, stop routing new connections to the old
one, wait for it to empty, then kill it. This is what makes match-state
persistence unnecessary for deploys.

**Horizontal scaling, when it comes:** the TV and every phone of one table must
land on the same instance, and a sticky cookie cannot achieve that because they
are different devices. The solution is that **the table code carries its
instance**: the first character identifies the node and the proxy routes on it.
Routing becomes a pure function of the code the player scanned — no shared state,
no directory service. Today, with one instance, that character is constant and
invisible. The code generator is designed with it from the start.

### 4.20 One address, code at the root path

The large screen opens the root; a phone opens `/<CODE>`, so the manual fallback
is short (`m8.tv/KXTP`). Codes are exactly four characters from a known alphabet,
so they cannot collide with reserved paths.

Rejected: two real origins (`m8.tv` serving the app, `m8.io` serving the phone),
which costs CORS configuration, two certificates and a class of cross-origin bugs
that only appear in production, in exchange for nothing the player perceives.

### 4.21 HTTPS and Wake Lock

Wake Lock requires a secure context. On the LAN, over HTTP, it is unavailable and
the screen may sleep mid-match — mitigated in the TV's own power settings. Once
deployed over HTTPS it works. This is feature detection, not environment
branching, and it removes the need for a local certificate authority installed on
a television.

### 4.22 Testing: pyramid without end-to-end

Rules in unit tests, the table state machine on the fake transport, a handful of
integration tests with real Socket.IO, plus two CI guards (bundle budget and
emitted syntax).

**No end-to-end tests**, decided deliberately: they are slow, flaky and poor at
localizing failures. The trade-off accepted is that the three-device flow has no
automated safety net, and the README video is recorded by hand — which, using a
real TV and real phones, is more convincing than a headless capture anyway.
Adding end-to-end tests later remains open.

**No automated test will ever run on the actual TV.** Playwright would use a
recent Chromium and could never catch an ES2018 syntax leak. TV compatibility is
guaranteed by the compile target, the emitted-syntax check, and a manual smoke
test on the real television each milestone.

### 4.23 Development environment: Docker for the artifact, native for the inner loop

Everything ships in Docker: multi-stage image, non-root runtime, and a compose
file whose shape already accommodates `postgres` and `traefik` later without
rewriting.

But file-change events **do not cross the Windows/container boundary**. Polling
works and costs CPU and latency, exactly when iteration speed matters most.
Therefore three commands:

| Command | Runs on | Purpose |
|---|---|---|
| `npm run dev` | Windows, native | Fast inner loop with HMR, PC only |
| `npm run lan` | Windows, native | Real TV-target build, served on the LAN |
| `npm run docker` | Container | Production-equivalent stack; also CI |

The risk of this split is the machine's Node version drifting from the image's.
The version is declared once, enforced by `package.json`, and consumed by the
Dockerfile from the same declaration.

Other Windows specifics handled by design: `node_modules` is a **named volume**,
never a bind mount, so Linux-built binaries never mix with Windows ones; and
`.gitattributes` normalizes to LF so shell scripts do not break inside the image.

---

## 5. Domain model and table lifecycle

### 5.1 Entities

**Table** — exists while the large screen is connected. Holds a short code, the
participants, the selected game and at most one match.

**Participant** — a person with a phone. Holds a token persisted on the device,
a nickname, an avatar and a connection status. **The token is the identity**; it
is what makes "the same phone came back" an answerable question.

**Seat** — a numbered role of the game. Points at a participant or at nobody.
Seats are created when the game is chosen, and their count comes from the game
manifest.

**Match** — game state plus the rules instance. Created when the baton starts it,
discarded when it ends.

**Baton** — points at a participant. Alongside it, the **session owner** is where
the catalogue comes from: implicit today, an account later.

### 5.2 States

```
                    large screen connects
                            |
                            v
                     AWAITING_HOST  <---------------+
                  (empty table + QR)                |
                            |                       | last participant leaves
                  first phone connects              |
                            v                       |
                     CHOOSING_GAME  ----------------+
                (boards laid on the table)
                            |
                   baton picks a game
                            v
                        SEATING  <------------------+
              (code shown; seats filling)           |
                            |                       |
                  baton starts the match            | baton: play again
                            v                       | or change game
                        PLAYING                     |
                        |     ^                     |
        occupant drops  |     |  reconnected        |
                        v     |                     |
                        PAUSED                      |
                            |                       |
          window expires, or they left              |
                            v                       |
                     AWAITING_SEAT                  |
           (seat vacant; screen shows the QR)       |
                            |                       |
             someone new takes the seat --> PLAYING |
                            |                       |
             baton ends it --+--> FINISHED ---------+
```

### 5.3 Transition rules

**Joining.** In `AWAITING_HOST`, the first phone receives the baton. In
`SEATING`, arrivals take the next free seat in order; with no free seat the join
is refused. In `AWAITING_SEAT`, the arrival takes the vacant seat and the match
resumes immediately.

**Dropping.** Any occupant losing connection moves the table to `PAUSED`
**immediately, even when it is not their turn.** This is more predictable in a
living room and lets the screen name who vanished. The alternative — pausing only
when their turn arrives — was rejected because it produces a match advancing with
a ghost seat. The window is **60 seconds**, configurable.

**Leaving.** The explicit leave button vacates the seat with no window.

**Baton.** Transferred explicitly. If the holder drops and the window expires, it
migrates to the longest-present remaining participant; the table does not die. A
returning original host rejoins as an ordinary participant.

**The large screen.** Its disappearance does not kill the table immediately: it
has its own tolerance window, and it stores the code locally, so a refresh or a
Wi-Fi blip reconnects to the same table with everyone still seated. If that
window expires, the table ends and phones are told.

**Empty table.** If every participant leaves, the table returns to
`AWAITING_HOST` with the large screen still open, ready for the next group.

Nothing in this section mentions a game.

---

## 6. Joining: table code and QR

**The code** is four characters from an alphabet with no visual ambiguity — no
`O`/`0`, no `I`/`1`/`L`, no `U` — leaving 30 symbols and 810,000 combinations.
Displayed uppercase, accepted in any case. Collisions are re-rolled. Per §4.19,
the first character is reserved as a routing shard hint.

**The QR carries the whole destination**, not just the code: scanning opens the
browser already inside the right table, at the nickname and avatar screen. The
same QR serves the host and everyone after; the server decides the arriving
role from the table's current state.

**The QR is generated server-side** and served as an image (`/qr/<CODE>.svg`).
The large screen only places an `<img>` — one more place where "the TV is light"
becomes a concrete decision rather than an intention.

**Typing exists only as a fallback**, for a bad camera or an old phone.

**The QR appears at three moments:** the empty table awaiting a host, while seats
fill, and — prominently, with the seat number — when a match is stalled awaiting a
seat.

**On the LAN**, the QR resolves itself correctly with no IP detection: it is built
from the host the large screen used to request the page. If the screen loaded
`http://192.168.0.12:3000`, the QR points at `http://192.168.0.12:3000/KXTP`. It
can never say `localhost`, because from the requester's point of view it never
was.

---

## 7. Repository structure

```
m8/
├── apps/
│   ├── server/            Fastify + Socket.IO + composition
│   ├── tv/                vanilla + Tailwind v3  -> ES2017
│   └── phone/             React + Vite + Tailwind v4
├── packages/
│   ├── core/              domain: Table, Seat, Baton, Match, state machine
│   ├── contract/          what a game implements
│   ├── protocol/          wire messages, typed and versioned
│   ├── transport/         Transport interface + Socket.IO impl + fake impl
│   ├── i18n/              pt-BR / en dictionaries, typed keys
│   ├── tokens/            colours, spacing, fonts as CSS custom properties
│   └── games/
│       └── tic-tac-toe/   manifest + rules + tv/ + phone/
├── docs/
└── .github/workflows/
```

**Dependency direction is a rule:** `apps` depend on `packages`, and `core`
depends on nothing but `contract`. A game never imports from `core`; the platform
never imports a game except in the single composition file.

`core` carries the whole of §5 and performs **no I/O** — no Fastify, no
Socket.IO, no timers, no clock reads. That is what makes disconnection, seat
handover and baton migration testable in milliseconds. `apps/server` is wiring
and nothing else.

---

## 8. Protocol

**The server sends full state, never diffs.** In a turn-based game state is tiny
and changes are rare, so optimizing this would trade simplicity for nothing. The
payoff is large: **reconnecting is receiving a state message like any other.**
There is no resume path, no replay of missed messages, and no way for client and
server to diverge. This is the decision that stops reconnection from being hard.

### Phone to server

| Message | Who may send | Effect |
|---|---|---|
| `hello` | anyone | Join the table by code; includes the token if one exists |
| `setProfile` | anyone | Set nickname and avatar |
| `chooseGame` | baton only | Choose a game from the catalogue |
| `startMatch` | baton only | Start the match |
| `endMatch` | baton only | End the match in progress |
| `passBaton` | baton only | Hand the baton to another participant |
| `leave` | anyone | Leave for good; vacates the seat immediately |
| `gameAction` | seated only | A move, forwarded to the game rules |

### Large screen to server

`helloTable` only — create a new table or resume the stored one. **The large
screen sends nothing else, ever.** "The TV only displays" becomes a property of
the protocol surface: even if someone wanted to drive it with a remote, there
would be nothing to call.

### Server outbound

Table state (projected by role — the baton holder's phone receives what it may
do, others do not), game views (`projectTable` to the screen, `projectSeat` to
each phone), and errors with stable codes translated on the client.

**Versioning.** `hello` carries the protocol version. A mismatch tells the client
to reload — which is what happens when the server is updated while someone's
phone holds a stale page. Without it the symptom is a phantom bug; with it, a
clear message.

### Core and protocol

`core` emits **its own domain events**; a thin layer in `apps/server` maps them to
wire messages. The domain does not know a network exists. This costs a mapping to
maintain, and is justified because the wire format will change for reasons that
have nothing to do with game rules — a web deployment is planned, and a native
client is plausible.

---

## 9. The game contract

A game is four pieces.

**1. Manifest** — what the platform needs to know *without loading the game*: id,
implemented contract version, minimum and maximum seats, i18n keys for name and
description, thumbnail, and status (`playable` or `coming-soon`). The catalogue is
the list of manifests, which is why "coming soon" games are not a special case.

**2. Rules** — the pure functions, server-side only:

```ts
interface GameRules<State, Action> {
  createInitialState(seats: SeatId[], rng: Rng): State
  currentTurn(state: State): SeatId | null
  validate(state: State, seat: SeatId, action: Action): Result<void, RuleError>
  apply(state: State, seat: SeatId, action: Action): State
  outcome(state: State): Outcome | null          // null = still in progress
  projectTable(state: State): TableView          // what the big screen sees
  projectSeat(state: State, seat: SeatId): SeatView   // what THAT phone sees
}
```

Rules never reach the browser, so a player cannot read them to cheat, and private
information cannot leak.

**3. Table view** — the large-screen module, vanilla.
**4. Seat view** — the phone module, React.

Both implement the same minimal interface, and it is this interface that makes
the boundary real rather than decorative:

```ts
interface GameView<V> {
  mount(root: HTMLElement, ctx: ViewContext): void
  update(view: V): void
  unmount(): void
}
```

Three methods, no framework in the contract. `ViewContext` provides what a view
needs from the world: send an action, translate a key, know the participants.

**Loading.** Nothing game-related enters memory before the choice. Once chosen,
the large screen injects `/games/<id>/tv.js` and waits for registration; the
phone dynamically imports `phone.js`. The server checks the declared contract
version before accepting.

**The transition animation** — the table and the phones "loading" into the chosen
game — belongs to the **platform**, not the game. It runs while the bundle
downloads, so it is the loading indicator rather than decoration.

**What the platform never learns:** what an X is, what a winning line is, how
many cells a board has. It knows a match exists, it is seat *n*'s turn, an action
arrived, and the match ended with this outcome.

---

## 10. The two interfaces

> **The large screen shows what is happening. The phone shows what you can do.**

Not the same screen at two sizes — different roles. The screen is public and
narrative; the phone is private and active. When a card game arrives, that
sentence already decides where a hand appears.

### Large screen, state by state

**Empty table.** Only the table and the QR, with the code large beside it.
Nothing else.

**Choosing a game.** Boards laid out on the table; unavailable ones visibly
dimmed. As the host moves through the list on their phone, **the highlight moves
on the screen in real time** — which is what lets the whole room take part in the
choice without anyone touching the TV.

**Seats filling.** The QR and code stay visible next to the chosen game's seats.
Each phone that joins makes an avatar appear in a seat.

**Loading.** The transition animation, covering the game download.

**Playing.** The board fills the screen. Around it, the players, with a strong
turn highlight readable from three metres without hunting.

**Paused.** An overlay over the board: who vanished, and the 60-second window
counting down. The board stays visible behind, because the match has not ended.

**Awaiting a seat.** The empty seat highlighted, the QR large again, and the seat
number. Unambiguous at three metres.

**Finished.** The outcome, and the table waiting for the baton to decide.

### Phone

**Joining.** Arrived by QR, already in the right table. Picks a nickname and an
avatar from a fixed set — no uploads, all distinguishable at three metres. This is
the only typing in the entire project.

**Waiting or choosing.** The baton holder sees the catalogue and chooses.
Everyone else sees the table and who has arrived — nobody stares at a dead screen.

**Before the start.** Their seat, who else is seated, and — baton only — start,
pass the baton, change game. Everyone has leave.

**Playing.** The game's seat view. For tic-tac-toe, a tappable board with
playable cells highlighted and taken cells inert — and which cells are playable
came from the server, not from rules duplicated on the phone. When it is not
their turn the control is visibly inactive and the screen says whose turn it is.

**Finished.** The outcome and, for the baton, play again or change game.

### Large-screen constraints (requirements, not taste)

**Overscan.** No content in the outer 5%.

**Reading distance.** Three metres. This sets a floor on type size and contrast
far above a normal website, and means secondary information simply does not fit —
which pushes the design toward communicating with avatar, colour and position
instead of text.

**Zero interactivity.** No hover, no focus, no clickable element. It receives no
input, and the protocol guarantees it.

**Weight budget.** A number in CI that breaks the build when exceeded.

### Visual identity

The look — palette, typography, the texture of the table, how a "coming soon"
board reads as unavailable without reading as broken — is deliberately **not**
decided here. It is the job of the `frontend-design` skill during implementation,
with pixels on screen to judge. This document fixes only the constraints above,
which that work must respect.

---

## 11. Milestone 1: definition of done

Written as a scene rather than a checklist:

> On a clean machine, one command brings everything up. The large screen opens
> the table on the local network. Two phones join by scanning the QR, choose
> nicknames and avatars. The host picks tic-tac-toe from the boards on the table
> and starts the match. They play until someone wins. Midway, one of them loses
> Wi-Fi for twenty seconds and returns to the same seat with the board intact.
> Then one leaves for good, the turn stalls, a third person scans the QR, takes
> the seat and the match continues. The host passes the baton and walks away; the
> table does not die. All of it covered by tests that run in seconds.

**In scope:** table and code, server-generated QR, profile with nickname and
avatar, seats, baton, implicit session owner, the reconnection windows, manifest-
driven catalogue, the game contract, on-demand loading, the complete tic-tac-toe
game, i18n in both locales, Docker, CI, README and this document.

---

## 12. Roadmap

| | Delivers |
|---|---|
| **M1 — Foundation** | Everything above. Runs on the home LAN. |
| **M2 — Publication** | Traefik, HTTPS, draining, Wake Lock, nickname filtering, abuse limits. Becomes a link to send someone. |
| **M3 — Accounts** | Postgres, login; the implicit session owner becomes a real account. |
| **M4 — Monetization** | Subscription or per-game purchase; catalogue gated by entitlement. |
| **M5 — Scale** | A second instance, routed by the shard character in the table code. |
| **Games** | Added in parallel from M1 onward, without touching the platform. |

The seams for M2-M5 already exist in this design: session owner separate from
baton, the repository boundary around table storage, the shard character in the
code generator, and `core` free of I/O.

If a new game ever forces a change to the platform, that is a signal the contract
must evolve — and it becomes its own discussion, not a patch.

Two things the LAN hides and the web will charge for, recorded now so they do not
become incidents: **nicknames are free text typed by strangers** and displayed on
a television in a room with other people, so they need length limits,
sanitization and a basic profanity filter; and **creating a table is free**, so
without a per-origin limit and idle-table expiry someone can fill the process
with empty tables.

---

## 13. Risks

**The real television — the largest risk by far.** The entire design is
calibrated for Chromium 68-79 from documentation, not from experiment. TV
browsers have undocumented behaviours. The mitigation is scheduling: **open it on
the actual TV in the first week**, with a trivial page, before any game exists.
Finding this out early is cheap; finding out at the end is a rewrite.

**Socket.IO on the TV engine.** It was chosen for resilience in a hostile
environment, but its client must actually run there. Verified in the same early
test. The `Transport` boundary exists precisely so replacing it is writing one
class.

**The large-screen weight budget.** Socket.IO is its largest single item. The
number will be measured before it is promised.

**The game contract is only truly validated by the second game.** A contract with
one implementer is a guess. The second game follows M1 for that reason — it is the
test of the contract, not merely another game.

**The domain names.** `m8.tv` and `m8.io` are **unverified**. Recorded as an open
question, not as a fact.

---

## 14. Open questions

1. Domain availability for `m8.tv` and `m8.io` — not checked.
2. GitHub account name, and the local `user.name` / `user.email` for this
   repository. The repository will be **public**.
3. The exact TV bundle budget number, to be set after the first measurement.
