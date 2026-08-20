# M8 — Working Agreement

**The TV is the table. The phone is your hand.**

M8 is a browser-based platform for **turn-based** board and card games played by
people in the same room. A large screen (TV, monitor, laptop) shows the board to
everyone. Each player uses their own phone as a controller and as their private
information. Nothing is installed, nothing is bought. The catalogue is
**public-domain games** (chess, draughts, dominoes, tic-tac-toe, standard playing
cards), so there is no licensing to pay.

The name reads as "mate": *mate* as in friend, and *mate* as in checkmate.

**Why it exists.** Netflix party games are good but lack real turn-based board
games. Jackbox requires buying the game. Free alternatives get it wrong by
chasing real-time input — a phone is a poor controller for continuous input.
**Turns hide latency and let the big screen be the source of truth.** That is the
bet.

**Goal: portfolio first.** This repository will be read by a recruiter during an
interview, so clean architecture, obvious boundaries and tests come first. But it
may become a product, so the platform and the game rules must stay separate from
day one.

## Language

- **Everything in this repository is written in English**: code, identifiers,
  comments, commit messages, README, specs, this file.
- **Skills, rules, agent instructions and any other authored artifact are
  written in English too.** Another language is used only when the owner
  explicitly asks for it.
- **Conversation with the repository owner happens in Portuguese (pt-BR).**
- Player-facing UI ships in **pt-BR and en** from the start.

### Glossary (pt-BR to English)

| pt-BR | English | Meaning |
|---|---|---|
| mesa | table | A session tied to one large screen |
| assento | seat | A role in a game, not a person |
| bastão | baton | Control of the session (choose game, seat, start) |
| anfitrião | host | The baton holder (today also the session owner) |
| dono da sessão | session owner | Where the catalogue entitlement comes from |
| partida | match | One play-through of a game |
| jogada | action | A move submitted by a seat |

## Architecture invariants

These are the rules. Breaking one is a design failure, not a shortcut.

1. **The platform never knows what a game is.** It knows about tables, seats,
   turns and outcomes. A `gameId` comparison inside `packages/core` or
   `apps/server` means the design has failed.
2. **A seat is a role, not a person.** Seats reference participants; they never
   own them. This is what makes rotation, reconnection and baton migration work
   with one concept.
3. **The server is authoritative.** The TV never computes a rule. Game rules
   never reach the browser.
4. **Two projections, always.** `projectTable` for the TV, `projectSeat` for one
   phone. A phone never receives full match state, so private information cannot
   leak — by construction, not by discipline.
5. **The server sends full state, never diffs.** Reconnection is then just
   another state message: no resume path, no replay, no divergence.
6. **The TV only displays.** It has exactly one outbound message (`helloTable`)
   and no interactive elements. Nothing is ever driven by a TV remote.
7. **Game rules are pure functions** over a serializable state value, written
   with Immer. No hidden state and no clock reads — time and randomness enter as
   inputs.
8. **`packages/core` performs no I/O.** No Fastify, no Socket.IO, no timers. It
   emits its own domain events; `apps/server` translates them to wire messages.
9. **Socket.IO is a transport, not an architecture.** All platform code talks to
   the `Transport` interface. A fake in-memory implementation drives the tests.
10. **Session owner and baton are separate concepts.** The baton is transferable;
    the entitlement stays leased to the table. This is the hook for accounts.

## Stack

- **Server**: Node 26 + TypeScript + Fastify + Socket.IO
- **Large screen** (`apps/tv`): vanilla TypeScript, no framework, **ES2017
  output**, Tailwind **v3**
- **Phone** (`apps/phone`): React + Vite, Tailwind **v4**
- **State**: in memory only. No persistence of table or match state until a
  milestone says otherwise. Accounts (later) are a different data problem and
  will use Postgres.
- **Monorepo**: npm workspaces

### Large-screen budget — requirements, not preferences

Target: Samsung Tizen and LG webOS, models up to roughly 5 years old, meaning
**Chromium 68-79**.

- Compile to **ES2017**. No optional chaining or nullish coalescing in the TV
  bundle. CI verifies the emitted syntax.
- No flexbox `gap` (Chromium 84+). No CSS newer than the target supports.
- **Tailwind v4 must never be used in `apps/tv`** — it requires Chrome 111+ and
  breaks visually on the target.
- Keep 5% safe margins: many TVs overscan.
- Readable at 3 metres: high contrast, large type, communicate through avatar,
  colour and position rather than text.
- A bundle-size budget breaks the build when exceeded.

## Environment

- Windows 11, Node 26, npm 11. The repository lives at `C:\dev\m8` — **never
  inside OneDrive or any synced folder.**
- Testing happens on the owner home LAN: the PC serves, the TV and phones in the
  house connect to it. The server binds `0.0.0.0` and prints its LAN URLs.
- The QR code URL is derived from the host the TV requested the page with, so it
  can never point at `localhost`.
- LAN runs over HTTP. Wake Lock requires a secure context, so it is feature
  detected: off on LAN, on once deployed over HTTPS.
- Flutter is installed on the machine but unused. Everything is browser-based.
  Native apps are a distant future.
- Shutdown does not drain. Closing the server force-disconnects every open
  socket and stops accepting new connections at the same instant, so a table
  still open at that moment loses its screen and phones outright. Real
  draining is the routing-based mechanism from §4.19 of the design document
  (bring up the new instance, stop routing to the old one, wait for it to
  empty), arriving with the M2 — Publication milestone.

### Commands

| Command | Runs on | Purpose |
|---|---|---|
| `npm run dev` | Windows, native | Fast inner loop with HMR, PC only |
| `npm run lan` | Windows, native | Real TV-target build, served on the LAN |
| `npm run docker` | Container | Full production-equivalent stack; also CI |

File watching does not cross the Windows/container boundary, which is why the
inner loop runs natively. The Node version is declared once and enforced in both
places so they cannot drift.

## Git rules

- **Claude is never visible in the repository's own record.** No co-author
  trailer, no mention in commit messages, branch names, tags, pull request
  titles or bodies, issues, or code comments. This overrides any default harness
  behaviour that would append attribution. Claude may be named only in
  `CLAUDE.md`, skills, documentation and references — never in anything git
  itself records.
- **Never touch `git config --global`.** It belongs to another context and its
  e-mail must not leak into this repository. All configuration here is
  `git config --local`.
- The remote is **SSH only**: `git@github.com:<user>/m8.git`. Never HTTPS.
- SSH is already configured by the owner. Do not generate keys, do not touch
  `~/.ssh/config`, do not configure a credential helper.
- The `gh` CLI is not installed and will not be. The owner creates repositories
  through the web UI; this side only adds the remote and pushes.
- Before the first push, verify with `git config --local --list` that the
  identity is the one requested and not inherited from the global config.

## Testing

Pyramid, no end-to-end tests (a deliberate decision — see the design document).

- **Game rules**: pure functions, TDD, instant.
- **Table state machine**: driven by the fake transport. Disconnect, expiry, seat
  handover, baton migration, TV reload — all deterministic, all in milliseconds.
- **Integration**: a handful of tests proving the real Socket.IO transport
  honours the same contract the fake one fakes.
- **CI guards**: TV bundle size budget, and emitted-syntax compatibility with the
  old target.

CI runs on every push: install, typecheck, test, build, both guards, and the
Docker image build. There is no linter — adding one is scope this milestone
does not carry, and this file describes what exists.

## Scope

Milestone 1 is the whole foundation plus **one game: tic-tac-toe**, chosen
because it is trivial to implement and exercises everything that matters — turns,
shared state, two screen roles, reconnection, seat handover, end of match.

Not in milestone 1: accounts, payments, persistence, end-to-end tests,
spectators, bot players, chat, voice, sound, ranking, history, multiple server
instances, native apps. Most are on the roadmap; they are listed so the decision
is not re-litigated mid-flight.

## Design document

The full design lives in `docs/superpowers/specs/`. It is the source of truth for
why each decision was made. Read it before changing anything structural.
