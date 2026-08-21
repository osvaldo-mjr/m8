# Visual identity — implementation report

Written 2026-08-20, against the working tree at the moment of writing: branch
`main`, everything below committed, nothing pushed. Every figure here was
measured on this machine on that date; where something was not verified, it
says so rather than being left to be assumed.

## What was built

The approved direction — modern cheerful toy, saturated colour, large shapes,
no nostalgia — executed as described. The four-character table code is the
hero of the large screen, drawn as four separate tiles rather than a string.
Each participant is given a colour by arrival order, and that colour appears on
both screens. There is one animation in the product.

Both screens now share `packages/tokens`: the colour values, the two font
files, and one small TypeScript module that answers "which colour is this
person".

## The tilt, and why it is stable

`apps/tv/src/tilt.ts`. Each thing lying on the table — the four code tiles,
then the QR — is turned by an angle derived from the table code and the piece's
own position:

```
FNV-1a over the code characters
  → fold in the piece index
  → murmur3's fmix32 avalanche
  → magnitude = 2 + (hash mod 5) * 0.5   degrees, so 2, 2.5, 3, 3.5 or 4
  → sign      = bit 16 of the hash
```

Three properties, each with a reason:

- **Small.** Two to four degrees. The code is the one thing in the room that
  must be read correctly from three metres and typed by a stranger; past about
  six degrees that starts to cost. The QR is turned by the same rule purely so
  the arrangement is one gesture — QR decoding is rotation-invariant, so the
  angle costs it nothing.
- **Stable.** It is a pure function of the code. A `tableState` arrives every
  time anybody joins, renames or drops, and the screen redraws on each one; an
  angle that were random per render would make every piece on the table twitch
  whenever anyone touched their phone. There is no state, no storage and no
  clock read involved.
- **Not identical between tables.** Different codes hash differently, so two
  rooms do not see the same picture.

The avalanche step is not decoration, and this is the one thing in the file
worth reading twice. Five pieces of one table differ only in the last value
folded into the hash, so plain FNV-1a left the five results differing in a
handful of low bits and the arrangement of the whole table collapsed onto a few
shapes: measured over 900 codes, plain FNV-1a produced **131** distinct
arrangements where the finished hash produces **897**. The first version of the
test asserted that no two tables are ever arranged alike; that assertion is
arithmetically impossible — five pieces with ten angles each is 100,000
arrangements against 27,000 issuable codes — so it was replaced with the
property that actually holds, and the test says why in as many words.

`apps/tv/src/tilt.test.ts` pins: the range, that no piece is ever left square,
that the same code gives the same arrangement, that changing one character
rearranges the table, that both directions and all five magnitudes are used,
and that the arrangement spreads across more than 90% of a 900-code sample.

## The per-person colour

`packages/tokens/src/person-color.ts`. `personColor(arrivalIndex)` returns
`var(--m8-person-N)` — a name, never a value, so `tokens.css` stays the only
file in the repository where a colour is written down. A test asserts exactly
that, and asserts that every property the function can name is actually defined
in the stylesheet: two files with no compiler between them, where a mismatch
would produce an invisible chip on a television and nothing else would notice.

**Arrival order is the participant's index in the snapshot the server sends.**
Both screens read the same index out of the same message, so they cannot
disagree about who is coral: the television writes `--m8-person` onto the chip,
the phone writes it onto its shell, and both stylesheets read `var(--m8-person)`
without knowing whose colour it is.

It is not stable across a departure: if the second of four people leaves, the
two behind them shift one colour along. That is deliberate. The alternative —
hashing a participant id — lets two people at one table land on the same
colour, and two identical colours in the room breaks the one thing this exists
for. The trade is written down at the top of the module.

Eight colours; a ninth participant would wrap round to coral, which cannot
happen today because a table holds eight.

## The fonts, and what they cost

Archivo, self-hosted in `packages/tokens/fonts/`, with `OFL.txt` beside them.
Not from a CDN: the television runs on a home LAN that may have no route to the
internet at all, and a font request that hangs is a blank hero on the one
screen the whole room is looking at.

Two **static instances**, not the variable font, and declared as two separate
families rather than one family with two weights — matching a face by
`font-weight` and `font-stretch` is a decision left to the browser, and these
are the names the static instances themselves carry:

| File | Face | Subset | Bytes |
|---|---|---|---|
| `archivo-expanded-black.woff2` | Archivo Expanded, Black | space, `A-Z`, `0-9`, and the uppercase accented letters pt-BR needs | **6,684** |
| `archivo-medium.woff2` | Archivo, Medium | the Google Fonts `latin` subset | **14,600** |
| | | **total** | **21,284** |

Subsetting was done by the Google Fonts CSS API's `text=` parameter, which is a
real subsetter and was the tool available. No `fonttools` or `pyftsubset` is
installed on this machine.

**One instruction in the brief contradicted itself and was resolved
deliberately.** It says the Expanded Black sets "the code characters and the
small uppercase eyebrows", and then says to subset that instance to "the code
alphabet plus digits — it is all that face ever renders". Those cannot both
hold: `SCAN OR TYPE`, `OPENING THE TABLE`, `SOMETHING WENT WRONG` and
`RECONNECTING` are all set in it and contain letters (`O`, `I`, `L`, `U`) that
the code alphabet deliberately excludes. The subset is therefore the full
uppercase Latin alphabet plus digits plus space, which is 6,684 bytes rather
than roughly 5,000 — and every string set in that face is written uppercase in
the source, never uppercased by CSS, so nothing can silently fall through to a
system font mid-headline. `apps/tv/src/render.ts` says so where the strings are
declared.

The medium face cannot be subset by text: it renders nicknames, which are typed
by strangers. A nickname outside Latin-1 — CJK, Cyrillic, emoji beyond the
avatar catalogue — will render in the fallback stack rather than in Archivo.
That is a visible inconsistency, not a failure, and it is not covered by any
test.

`assetsInlineLimit: 0` was set in `apps/tv/vite.config.ts` so the fonts stay
files: inlined as base64 they would be about a third larger, would be refetched
with the stylesheet on every deploy instead of being cached separately, and
would block the first paint of a screen whose whole job is never to be blank.

## The size guard, and the ceiling

The hole was real: `scripts/check-tv-size.mjs` matched `.js` and `.css` only.
Two font files could have been added and the guard would have gone on reporting
the television bundle comfortably within budget while the set downloaded
twenty-one kilobytes more.

What changed:

- Fonts (`.woff2`, `.woff`, `.ttf`, `.otf`) are now measured.
- They are measured **raw, not gzipped**. woff2 carries its own compression,
  nothing gzips it a second time on the way out, and a gzipped figure would
  have understated what the television actually fetches — the same defect as
  not measuring it, only harder to see.
- The printed total says `transferred`, not `gzipped`, because it now mixes
  gzipped text with raw fonts. One existing test asserted the old wording and
  was updated; the change is explained in the test itself.
- The budget key was renamed `tvBundleGzipBytes` → `tvBundleTransferBytes` for
  the same reason. That rename opened a hazard worth more than the tidiness:
  had it touched only one of the two files, the guard would have read
  `undefined`, compared `NaN` against the total, found it not greater, and
  passed every bundle for ever. The guard now refuses a budget it cannot read
  as a positive whole number of bytes, and a test asserts that `budget.json`
  declares exactly one ceiling, under the key the guard reads, as a positive
  integer.
- Fonts do not count as a build: a directory holding only fonts still fails
  with "No JavaScript and no CSS found".

Four tests were added around this: that a font changes the total by exactly its
own byte length, that it is reported `raw`, that a font alone can blow the
budget, and that fonts do not stand in for a missing bundle.

### The numbers

| | Before | After |
|---|---|---|
| Ceiling | 18,900 B | **42,000 B** |
| Measured | 16,091 B | **37,990 B** |
| Headroom | 2,809 B (17%) | 4,010 B (11%) |

The "before" figure was measured, not recalled: the previous commit's tree was
extracted with `git archive`, built, and run through the old guard. (The README
had said 15,995 B; the tree measures 16,091 B today.)

The after figure breaks down as JS 14,732 B gzipped, CSS 1,974 B gzipped, fonts
21,284 B raw. The fonts are fixed weight, so the 4,010 B of headroom is really
24% of headroom over the code and stylesheet, which is the part that grows.

`README.md` was updated to the new ceiling, the new measurement, the new test
count, and to stop calling the budget a gzip budget.

## Tailwind's preflight was switched off on the television

Not asked for, and worth stating plainly. Tailwind v3's preflight emits

```css
[hidden]:where(:not([hidden=until-found])) { display: none }
```

`:where()` is Chromium 88 against a declared floor of 68, and an old television
does not ignore the unknown part of that selector — it discards the whole rule.
Nothing on this screen uses `[hidden]`, so the visible damage today was none,
which is exactly why it would have sat there for ever. The constraint is "no
`:is()`, no `:where()` in what the television is sent"; shipping one on the
grounds that this particular rule does not matter is how the next one arrives.

`corePlugins: { preflight: false }` in `apps/tv/tailwind.config.js`, and the
reset the screen actually needs — box sizing, body margin, list and paragraph
margins, `img { display: block }` — is written out at the top of
`apps/tv/src/styles.css`. It also took about 9 kB of unused reset off a bundle
whose whole point is to be light.

The emitted stylesheet was then checked by hand for every banned construct:
zero occurrences of `:where(`, `:is(`, `clamp(`, `aspect-ratio`,
`backdrop-filter`, and no `inset:` or `gap:` property (the only matches for
those two strings are custom property *names* such as `--m8-safe-inset` and
`--m8-piece-gap`, which is why margins are used for every space on the screen).

**No automated guard covers this.** The syntax guard parses JavaScript; the
size guard weighs bytes; nothing parses the emitted CSS against the old target.
A third guard would be cheap and is the obvious next piece of work, but it is
scope this pass did not carry, and until it exists the only thing standing
between the television and a `:where()` is review.

## The renderer

`apps/tv/src/render.ts` was rewritten around the requirement that only a
genuinely new chip animates.

Per root, a `WeakMap` now holds the whole table tree — following the shape the
QR `<img>` reuse already established — keyed by root so two roots cannot share
one tree. A render reuses it when the code is unchanged *and* the stage is
still attached to that root; a different code means different tilts and a
different QR, and a detached stage means a waiting or error screen cleared the
root, so both rebuild.

Chip elements are held in a `Map` by participant id, updated in place, moved
only when the order genuinely differs, and removed when their person leaves.
That makes creating an element and somebody arriving the same event — so the
arrival animation lives on `.m8-chip` itself, with nothing to add or take away
afterwards, and a chip that is merely renamed or marked disconnected does not
re-animate.

The animation: 200ms, opacity and transform, with a small overshoot. It is the
only animation in the product and it has a job — the person who just scanned
the code is looking up at the television to find out whether their phone
connected, and this is the answer.

### On `prefers-reduced-motion`

The rule is implemented. **It is not a guarantee.** The query arrived in
Chromium 74 and the declared floor for this screen is 68; on 68 to 73 the query
does not exist, the rule never matches, and the animation plays regardless of
what the set's accessibility settings say. That sentence is in the stylesheet
where the rule is, and it is the only place motion reduction is mentioned. No
document in this repository claims the product respects it.

## Tests: what was adapted, and why

329 before, **374 after**, 30 files, all passing through PowerShell. (Under the
sandboxed Bash tool every vitest worker dies with `Cannot read properties of
undefined (reading 'config')` and reports zero tests — a known environment
defect, not a suite failure. Every figure here comes from PowerShell.)

Nothing was weakened. Every existing assertion in `apps/tv/src/render.test.ts`
still holds, including the ones that matter most: a disconnected participant
renders with different classes and the word "reconnecting" appears, a nickname
is text and never markup, a participant with no nickname renders a placeholder,
nothing interactive is rendered anywhere, and the QR element is reused across
renders of the same table.

Four changes were deliberate:

1. **`TvView` gained a required `address`.** Every call in the test file gained
   it. The eyebrow says "scan or type"; a phone with no camera, or a camera
   that will not focus in a dark room, has nothing to type without it. It comes
   from `window.location.host` — the address the screen was actually reached
   at — for the same reason the QR is built from the request's host, so it can
   never tell the room to type `localhost`.
2. **The disconnected treatment changed shape but not strength.** The chip's
   disc empties out to an outline of that person's own colour and the word is
   now `RECONNECTING`, set in the expanded black face in their colour. The test
   comparing connected and disconnected class names is untouched and still
   passes; the `/reconnecting/i` match is case-insensitive and still passes.
3. **`check-tv-size.test.ts`: one assertion changed wording** —
   `Total: N B gzipped` became `Total: N B transferred` — because the total is
   no longer a gzipped figure and the old wording would have been a small lie
   in the one line anybody reads. One fixture grew from 60,000 to 120,000 bytes
   so it still exceeds the raised ceiling.
4. **`tilt.test.ts` avoids `flatMap`.** `apps/tv` is typechecked against the
   libraries a 2020 television has, and that includes its own tests;
   `flatMap` is ES2019 and was a `TS2550`. The guard working as designed.

Added: `apps/tv/src/tilt.test.ts` (9), `packages/tokens/src/person-color.test.ts`
(9), and new blocks in `render.test.ts` covering the four tiles, the address,
which elements are turned and which stay square, arrangement stability, the
colour handed to each chip, chip element reuse across joins and renames,
removal on leave, row order, and rebuilding after a waiting screen.

## Verified

- `npm run typecheck` — clean across all three projects.
- `npm test` — 374 passed, 30 files.
- `npm run guards` — ES2017 syntax check passed; size 37,990 B against 42,000 B.
- `docker compose up --build -d` — image `m8-server:latest`, **222 MB**, built
  and running; `/` served the large screen, the hashed CSS 200, both `woff2`
  files 200 as `font/woff2`, `/qr/CODE.svg` 200 as `image/svg+xml`, and
  `/CODE` 200 for the phone.
- The container was then driven with a real headless Chromium over the DevTools
  protocol and real Socket.IO clients, and inspected as pictures rather than as
  markup: the join screen at 1920×1080 and at 1280×720; a table with eight
  seated people including a sixteen-character nickname; one of them dropped off
  the network; and the phone at 390×844 through the profile form to the seated
  screen, confirming that the colour on the phone is the colour of that
  person's chip on the television.

Two things were found that way and fixed:

- **The row of people overflowed the screen.** Eight people, at a size
  readable from three metres, do not fit across 1728px of safe area — and a
  television crops its own edges, so the ninth chip was gone twice over. The
  row now wraps, and the table above shrinks to pay for the second row, which
  is what `flex: 1 1 auto` on it is for.
- **The disabled "take a place" button was mud.** A saturated person colour at
  40% opacity over the near-black ground is a dead olive, which is the one
  thing this palette is not allowed to produce. Disabled is now an outline in
  that person's colour.

## Not verified, and open

- **None of this has been on a real television.** The fonts, the tilt and the
  animation are three new demands on Chromium 68-79, all documented as
  supported and none confirmed by experiment. `docs/tv-smoke-test.md` gained
  steps 10 to 13 for exactly these, and they are marked as never run.
- **`prefers-reduced-motion` does nothing on the oldest supported sets.** See
  above. This is a property of the target, not a defect to fix.
- **Nicknames outside Latin-1** fall back to a system font.
- **No guard parses the emitted CSS** against the old target.
- **The baton still has no visual mark.** The smoke-test document had left this
  to "the visual identity pass". The approved direction describes the code
  tiles, the QR, the per-person colour and the row of people, and says nothing
  about the baton — inventing a mark for it would have been the one thing this
  pass was told not to do. `data-baton` is still there and still invisible.
  `docs/tv-smoke-test.md` now records that this pass did not settle it and that
  it belongs with the first game, where a baton-only action finally exists to
  justify a mark.
- **Colour contrast was judged by eye**, not measured against a ratio. Paper on
  the violet table and paper on the ground are both far above any threshold;
  the person colours are used as fills behind emoji and as short uppercase
  labels on the ground, where they are comfortable — but no numbers were
  computed and no tool was run.
