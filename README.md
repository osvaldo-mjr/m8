# M8

**The TV is the table. The phone is your hand.**

Turn-based board and card games for people in the same room. A large screen
shows the board; every player uses their own phone as a controller and as their
private information. Nothing to install, nothing to buy — the catalogue is
public-domain games.

The name reads as "mate": a friend, and a checkmate.

## Why

Party games on television are plentiful, but real turn-based board games are
not, and the free alternatives chase real-time input on a device that is bad at
it. Turns hide latency and let the big screen be the source of truth.

## Status

Milestone 1, in progress. **There is no playable game yet.** What exists today
is the foundation a game will run on: a table opens on the local network, the
large screen shows a table code and a QR code, and a phone that scans it joins
and appears on the screen with a name and an avatar. From there the host
browses a catalogue of games on his own phone, puts one on the television — its
box and its manual, turned a page at a time from his hand — and chooses it,
which sizes the table's seats from that game's manifest and opens them to
whoever scans the code next. What is missing is the match: no game has rules
behind it yet, so nothing starts.

Tests cover it at four levels: pure domain logic, a table state machine driven
by a fake transport, integration tests proving the real Socket.IO transport
honours the same contract the fake one fakes, and guards over the build itself.
`npm test` prints the count; this file does not repeat it, because nothing
here could keep it true.

Each guard runs on every push, and fails the build rather than warning:
`guard:syntax` confirms the large-screen bundle compiles to syntax the old
television targets can execute; `guard:css` scans the emitted stylesheet and
rejects CSS newer than those sets can run; `guard:size` holds everything the
television downloads — code and stylesheet gzipped, the two self-hosted font
files as they are served — under a 42,000-byte budget; and `guard:assets`
holds each game's own artwork under a budget of its own, so no game can spend
the television's on a cover nobody asked for. Both budgets live in
`budget.json`, and `npm run guards` prints what each one currently weighs. The
Docker image is built in CI and then started, and a request is made against
it, so the clone-and-run promise is checked on a machine with nothing
installed rather than assumed.

## Architecture

The design document is the source of truth for every decision and the
alternatives rejected:
[`docs/superpowers/specs/2026-08-20-m8-platform-design.md`](docs/superpowers/specs/2026-08-20-m8-platform-design.md)

Three ideas carry the project:

- **A seat is a role, not a person.** One concept covers rotation,
  reconnection and host migration.
- **Two projections, always.** The server decides what the screen sees and what
  each phone sees separately, so private information cannot leak by
  construction.
- **The platform never learns what a game is.** It knows tables, seats, turns
  and outcomes; rules live behind a contract.

## Running it

Requires Node 26 (see `.nvmrc`), or Docker alone.

```bash
npm install
npm run lan     # builds for the television target and serves on the LAN
```

The log prints the LAN address. Open it on the television or on a second
machine; scan the QR with a phone. The manual checklist for testing on a real
television — including the Windows network-profile and firewall prerequisites
— lives in [`docs/tv-smoke-test.md`](docs/tv-smoke-test.md).

```bash
npm run dev     # fast inner loop with HMR, this machine only
npm run docker  # the full stack in a container, as CI runs it
npm test
```

## Layout

| Path | Responsibility |
|---|---|
| `packages/core` | The domain. No I/O of any kind. |
| `packages/contract` | What a game declares about itself, and nothing more. |
| `packages/games/*` | One workspace per game: its manifest, its artwork, later its rules. |
| `packages/protocol` | Wire messages. Types only for the browser. |
| `packages/avatars` | The fixed avatar catalogue, read by both screens. |
| `packages/transport` | The `Transport` seam, plus an in-memory fake. |
| `packages/tokens` | Design tokens shared by both screens. |
| `apps/server` | Wiring: Fastify, Socket.IO, QR. |
| `apps/tv` | The large screen. Vanilla TypeScript, ES2017. |
| `apps/phone` | The phone. React. |

A game is a workspace, not a branch in the platform. `packages/contract` is
the whole of what the platform may know about one — enough to list it, present
it and size its table — so adding a game is adding a directory beside the
others and one line in the server's catalogue. Nothing in `packages/core` or
`apps/server` ever compares a game id, which is the invariant that boundary
exists to make true.
