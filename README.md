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
and appears on the screen with a name and an avatar. That is the whole slice —
no seats, no turns, no rules.

374 tests cover it: pure domain logic, a table state machine driven by a fake
transport, integration tests proving the real Socket.IO transport honours the
same contract, and a set of guards over the build itself. Two of those run on
every push — one confirms the large-screen bundle compiles to syntax the old
television targets can execute, the other holds everything the television
downloads under a 42,000-byte budget, currently measured at 37,990 bytes
(code and stylesheet gzipped, the two self-hosted font files as they are
served). The Docker image is built in CI and then started, and a request is
made against it, so the clone-and-run promise is checked on a machine with
nothing installed rather than assumed.

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
| `packages/protocol` | Wire messages. Types only for the browser. |
| `packages/avatars` | The fixed avatar catalogue, read by both screens. |
| `packages/transport` | The `Transport` seam, plus an in-memory fake. |
| `packages/tokens` | Design tokens shared by both screens. |
| `apps/server` | Wiring: Fastify, Socket.IO, QR. |
| `apps/tv` | The large screen. Vanilla TypeScript, ES2017. |
| `apps/phone` | The phone. React. |
