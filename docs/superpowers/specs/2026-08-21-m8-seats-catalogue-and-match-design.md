# M8 — Seats, the Catalogue and the Match Lifecycle

**Date:** 2026-08-21
**Status:** Approved, ready for implementation planning
**Scope:** Milestone 1, Plan 2. The catalogue, seats, the game contract, and the
full match lifecycle — tested against a test-double game. The first real game
and its screens are Plan 3.
**Supersedes in part:** `2026-08-20-m8-platform-design.md` §4.3, §8 and
architectural invariant 8. Corrections are listed in §9.

---

## 1. Where this starts

The walking skeleton is merged and running. A table opens on the local network,
the large screen shows a code and a QR, phones scan it and appear on screen
with a name, an avatar and a colour, reconnection works by device token, and
the whole thing runs in a container with three CI guards. The screens have a
visual identity: a room, a wooden table under a lamp, and the code as four
tilted tiles.

What does not exist: any notion of a game, a seat, or a match. The table has
two phases and broadcasts one identical snapshot to every device.

This plan closes that gap up to — but not including — a playable game.

## 2. What this plan delivers

- A **catalogue** of games, presented as a box on the table with its manual
  beside it, browsed from the host's phone and displayed on the large screen.
- **Seats**, created from the chosen game, filled by arrival, gating who may
  join at all.
- The **game contract**, defined by the platform that consumes it.
- The **full match lifecycle**: starting, turns, pausing on a drop, the
  reconnection window, a vacant seat blocking play, handover to someone new,
  and the three ways a match ends.

**Not in this plan:** any real game's rules or screens; on-demand loading of a
game's code; internationalised UI strings beyond the manual's own text.

## 3. The decisions that shape everything else

Four decisions were made in this design round. Each changes the earlier spec.

### 3.1 Nobody joins before a game is chosen

Until the host picks a game, the only person connected is the host. The QR is
shown for the host, disappears once he arrives, and returns only when seats
exist.

This is what makes the rest of the design simple. The earlier spec had everyone
joining first and the game chosen afterwards, which raised a question it never
answered: what happens to the people who do not fit when a smaller game is
chosen. Gating entry on seats means nobody is ever displaced, because nobody
enters where there is no room.

### 3.2 The QR appears exactly when someone may join

Not "sometimes", not "when the host enables it". The rule is one sentence, and
the screen expresses it:

| State | QR |
|---|---|
| Awaiting host | yes — for the host |
| Choosing game | no |
| Seating | yes, while a seat is free |
| Playing · Paused · Finished | no |
| Awaiting seat | yes, with the seat number |

At three metres nobody counts chairs. A QR on the screen means there is room.

### 3.3 The host need not play

He chooses the game, reads the manual aloud from the screen, and may sit or
not. This is not a convenience: it is the earlier decision that the **session
owner** and the **baton** are separate concepts, arriving in the interface. The
person who brings the catalogue — and later, the account — is not required to
be a player.

The earlier spec fixed the host in seat 1. That is withdrawn.

### 3.4 The phone is never sent the table

The large screen receives the table's state. Each phone receives **its own**
state — who it is, whether it is seated, whether it holds the baton, what it
may do now. These are two different subjects, not two views of one.

Three consequences, all good:

**The phone receives decisions, not data.** Not "there are 4 seats, 3 filled,
the minimum is 2" but "you can start" or "one more player". The rule stays on
the server, which is the authority, instead of being reimplemented on the
device — and that duplication is exactly where two screens begin to disagree.

**Disagreement stops being possible.** The phone never contradicts the screen
about the table, because it holds no opinion about the table. The colour
desynchronisation bug found during the identity work existed precisely because
both sides computed from the same snapshot.

**It matches the manual rule.** What belongs to the room stays on the room's
screen. The phone holds what is yours.

---

## 4. The table's states

```
      screen opens
           │
           ▼
    AWAITING_HOST ◄──────────────── last participant leaves
    (empty table + QR)                        │
           │ first phone joins                │
           ▼                                  │
    CHOOSING_GAME ────────────────────────────┤
    (empty table; list and search on the      │
     phone; tapping a game puts its box       │
     and manual on the screen)                │
           │ "play this"                      │
           ▼                                  │
        SEATING ◄──────────────────────┐      │
    (seats created; QR while a seat is  │     │
     free; the host decides whether     │     │
     he plays)                          │     │
           │ the baton starts it        │     │
           ▼                            │     │
        PLAYING ───────────────┐        │     │
         │    ▲                │        │     │
   drops │    │ reconnected    │        │     │
         ▼    │                │        │     │
        PAUSED                 │        │     │
           │ window expires    │        │     │
           │ or left for good  │        │     │
           ▼                   │        │     │
     AWAITING_SEAT             │        │     │
     (QR returns, with the     │        │     │
      seat number)             │        │     │
           │ someone takes it  │        │     │
           └──────► PLAYING    │        │     │
                               ▼        │     │
                          FINISHED ──────┘    │
                     (the baton chooses) ─────┘
```

### 4.1 The round marker

Two of the three end-of-match actions clear the seats and require everyone to
scan again. That cannot be enforced by the code alone: scanning and reloading
resolve to the same address, so a phone that reloads arrives exactly as one
that scanned.

What the rule must actually prevent is specific: **a phone left in a pocket
that reconnects on its own and silently takes a seat.** That happens — the page
stays open, the socket reconnects, and the seat is gone before anyone notices.

So the marker belongs to the **phone's session, not to the address**. It is
established on arrival — carried by the QR, or assigned on the spot to someone
who typed the code — and stored on the device. Every reconnection presents the
stored marker; a stale one is refused with an instruction to scan the code on
the screen.

If it lived only in the URL, anyone who typed the code would carry no marker at
all and would become a permanent bypass of the rule.

### 4.2 The end of a match always returns to SEATING

| The baton chooses | Seats | Round marker | Who scans |
|---|---|---|---|
| Play again | kept | unchanged | nobody |
| Clear seats | emptied | **advances** | everyone |
| Change game | emptied | **advances** | everyone, and back to CHOOSING_GAME |

In all three he decides again whether he plays. Leaving his chair frees it and
brings the QR back; taking one occupies a free seat.

Returning to SEATING rather than straight into a new match gives him somewhere
to adjust before starting, and keeps exactly one path into PLAYING.

---

## 5. The catalogue

### 5.1 The manifest

What a game declares so the platform can present it **without loading it**:

```ts
interface GameManifest {
  id: string                        // 'tic-tac-toe'
  contractVersion: number
  seats: { min: number; max: number }
  name:    Record<Locale, string>
  tagline: Record<Locale, string>   // one line under the name
  manual:  Record<Locale, ManualPage[]>
  cover: string                     // path to the box art
  status: 'playable' | 'coming-soon'
}

interface ManualPage {
  title: string
  lines: string[]
}
```

The manual is text, per locale, so translating a game is translating text
rather than redrawing pages.

`Locale` does not exist in the code yet — the internationalised interface is a
later plan. This plan defines only the type, `'pt-BR' | 'en'`, and each device
renders in its own, which is the rule milestone 1 already settled. Building the
dictionaries and the language switch is not in scope here; a manifest that
declares both languages is.

**A guard on the manual.** At three metres a page holds roughly 40 to 60 words.
A test that rejects a page above the limit stops someone shipping an unreadable
manual months from now, when nobody remembers this constraint. This project has
repeatedly shown that what is not asserted does not hold.

### 5.2 The manual rule is structural, not a screen decision

The host does not read the manual on his phone; he reads it from the screen
with everyone else. The strongest form of that rule is not a phone interface
that declines to show it — it is **the phone never receiving it**.

The catalogue the phone fetches carries name, tagline, cover, seats and status.
**No manual.** It cannot show what it does not have. The manual reaches the
large screen as part of the table's state, and only the page currently open.

### 5.3 How a choice travels

```
PHONE (host)                              SCREEN
────────────                              ──────
list + search by name
        │
   taps a game  ──── previewGame ───────► box on the left,
                                          manual on the right, page 1
        │
   cover + arrows ── manualPage ────────► the page turns
        │
   "play this"  ──── chooseGame ────────► seats appear, QR returns
```

Three new messages, all discrete — each born of a tap, never of scrolling. The
platform's bet is that turn-based play hides latency; continuous input is the
one thing this design does not want, and a stepper keeps it out.

If the host returns to searching without choosing, **the screen keeps showing
the last game he looked at.** No blank screen while somebody types.

Games marked `coming-soon` appear in the list and may be **previewed** — box
and manual appear normally — but cannot be chosen. It costs nothing and lets
the room see what is coming.

### 5.4 Where the catalogue lives

`GET /api/games`, served from the manifests. It is not table state: it is
platform content, identical for every table, and cacheable.

It must **not** be bundled into the phone application. Adding a game cannot
require rebuilding the phone — that is the same boundary that makes games
plug-ins rather than special cases.

Cover art is a per-game file, loaded when the game is previewed, and measured
against **that game's** budget rather than the large screen's shell budget. The
shell stays light no matter how heavy a game's art becomes.

---

## 6. Seats

### 6.1 Creation and filling

Confirming a game creates **`seats.max` empty numbered seats**. The QR shows
while any is free and disappears when the last fills.

Whoever scans **claims a seat on arrival**, before choosing a nickname and
avatar. This ordering matters: if the seat were reserved only after typing a
name, two people could be typing for the last chair and one would discover the
loss on pressing confirm. Arriving takes the seat; the name fills in after, and
the screen shows the place taken with a placeholder until it does.

Order is arrival order, with no choosing of chairs. **A seat number is not a
turn order** — who goes first is the game's decision, drawn from its own seed —
so choosing a chair would be choosing nothing.

### 6.2 The host's participation

A switch on his phone, which **starts on**: choosing a game seats him, because
wanting to play is the common case and stepping out is one tap. Off, he releases
his seat and the QR returns. He may change it throughout seating and again at
every end of match.

Trying to sit with every seat taken is refused. He is the session's authority,
not an exception to its rules.

Leaving his chair mid-match is the same event as any player leaving: the seat
vacates, play blocks, the QR returns. The baton and the seat are separate, so
he continues to run the table without playing at it.

### 6.3 Starting

Occupied seats ≥ the manifest's minimum. His phone receives **the decision**,
not the arithmetic: start enabled, or "one more player".

### 6.4 Once the match starts, entry closes

Even with seats still empty, nobody else may join. Note that this situation
only arises for a game whose minimum is below its maximum: starting requires
the minimum to be seated (§6.3), so tic-tac-toe, whose minimum and maximum are
both two, can never begin with an empty chair. A game seating two to four can
start with three, and the fourth place stays closed for the rest of the match.

This is not a policy choice — it falls out of the contract. The game is handed the occupied seats and
builds its initial state from them; admitting a fourth player later would mean
altering that state from outside, which pure functions over a serializable
value do not permit.

So the distinction is exact: **a match belongs to the seats that were occupied
when it started.** A seat that never played is not part of it and leaves the
table. A seat whose person left **is** part of it — it exists in the game's
state with nobody in it — and can therefore be taken over.

### 6.5 Colour belongs to the seat

Colour is currently assigned by arrival order, so a departure shifts everyone's
colour. That is exactly where the screen and the phones came to disagree about
who was coral, and it cost a round to repair.

Seats remove the need: **seat 1 is always coral, seat 2 always cyan.** A person
leaving takes the person, not the colour; whoever takes that chair inherits it.
A seat number is unambiguous, so the two screens cannot diverge — the whole
class of bug disappears rather than being watched by a test.

The host who does not play **has no colour.** He is not in a chair. What marks
him on screen is the baton.

### 6.6 Capacity

The real ceiling is the game's. The existing hard limit of eight remains as a
process bound: no manifest may ask for more without an explicit decision.

---

## 7. The match lifecycle

### 7.1 Starting

The baton starts it. The platform takes the occupied seats, asks the game for
an initial state with a seed of its own, and the match exists. Empty seats
leave the table.

### 7.2 A turn

The platform asks the rules **whose turn it is**. The screen highlights that
seat strongly; the phone in that seat receives what it may do, and the others
receive that it is not their turn.

An action arrives, the server checks it is that seat's turn, **validates before
applying** — an invalid move is refused without touching state — and broadcasts
the new projections. A rejected move returns **only to that phone**; the room
does not need to see it.

### 7.3 A drop

Any seated occupant losing connection pauses the match **at once, even when it
is not their turn.** It is more predictable in a living room and lets the screen
name exactly who vanished. The window is 60 seconds, with the device token
deciding whether whoever returned is the same person. Returning inside the
window resumes exactly where it stopped.

### 7.4 A vacant seat

Window expired, or a deliberate departure: the seat empties, the match
**blocks**, and the QR returns with that seat's number highlighted. Whoever
scans takes over the match as it stands.

It blocks whether or not it is that seat's turn — there is no match running with
a ghost in a chair.

The wait is **indefinite**. No clock runs while the room looks for someone. Only
the baton ends it.

### 7.5 Ending

By the rules: the game reports an outcome and the screen shows it.
By the baton: ended at any moment, with no outcome.

Both return to SEATING with the three choices of §4.2.

### 7.6 The baton prefers a connected successor

When the baton holder leaves for good, it migrates to the longest-present
remaining participant — but **skipping anyone currently disconnected.** Until
now this did not matter, because no action required the baton. Starting a
match, choosing a game and ending a match all do, so a baton parked on an absent
phone would leave the table unable to act.

---

## 8. The contract the lifecycle consumes

This is everything the platform needs from a game, and nothing more:

```ts
createInitialState(seats, rng)      // the match begins
currentTurn(state)                  // whose turn, or nobody
validate(state, seat, action)       // may this happen?
apply(state, seat, action)          // the next state
outcome(state)                      // is it over, and how?
projectTable(state)                 // what the large screen draws
projectSeat(state, seat)            // what that one phone draws
```

Rules are pure functions over a serializable value, written with Immer. No
clock reads: time enters as an input the day a game needs it. No turn clock in
milestone 1.

**The contract is defined here, by its consumer.** The lifecycle above is built
and tested against a test-double game implementing it — a vacant seat blocking,
a window expiring, a handover inheriting a match in progress. None of that
depends on knowing what an X is. The first real game arrives in Plan 3 and
implements a contract that has already been exercised by the code that uses it,
which is the order that tends to produce a good interface.

---

## 9. Corrections to the milestone 1 spec

This design withdraws four things from `2026-08-20-m8-platform-design.md`:

1. **§4.3, the flow.** Participants no longer join before a game is chosen, and
   the host no longer takes seat 1. Replaced by §4 and §6 here.
2. **§8, role-projected table state.** The phone does not receive a filtered
   table; it receives its own state. Nothing in the table is secret — every
   part of it is on the large screen for the room to see — so projecting it per
   recipient protects nothing while computing N versions of one fact. Secrecy
   belongs to the match, where the contract's `projectSeat` already provides it.
3. **Architectural invariant 8, the domain-event half.** `DomainEvent` has been
   emitted and discarded at every call site since it was written; with per-device
   state, every change is expressed by recomputing what each device holds, and
   the events add nothing. The invariant's real purpose — that `packages/core`
   knows nothing of the wire — is served by core owning its own vocabulary
   (`TableView`, `DomainError`) and the server translating. **Remove
   `DomainEvent` and amend the invariant to say so.** A seam that has never
   carried anything is not a seam; it is a claim.
4. **§4.5, the reconnection window's scope.** Unchanged in duration, but it now
   applies to seated occupants specifically, since only seats can be vacant.

## 10. Non-goals

No real game rules or screens. No on-demand loading of game code. No
spectators — someone without a phone simply watches the screen, which is where
the game is. No turn clocks. No seat choosing. No persistence. No accounts.

## 11. Risks

**The catalogue's art is unproven at three metres.** A box and a manual page
have never been drawn on the target. The manual's word limit is derived from
type size rather than from experiment, and only a television settles whether a
page reads from the sofa.

**The round marker adds a concept to the protocol**, and its correctness depends
on the phone storing and presenting it. A phone that clears its storage becomes
a fresh arrival, which is correct but means the protection is only as good as
the device's storage.

**The lifecycle is proven against a test double.** A contract with one
implementer is a guess. Plan 3's real game is the test of this one, and the
second game after it is the real test.

## 12. Open questions

1. What a phone shows when refused for a stale round marker — the wording of
   "scan the code on the screen" is a copy decision, not settled here.
2. Whether a previewed `coming-soon` game should say what is missing, or simply
   read as unavailable.
3. Cover art for public-domain games has no publisher: the first game will use a
   freely-licensed image to see how it reads, and whether a typographic or
   geometric box becomes the house style is deferred until that has been seen.
