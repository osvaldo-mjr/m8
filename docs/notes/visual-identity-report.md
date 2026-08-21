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
Both screens read the same index out of the same message: the television writes
`--m8-person` onto the chip, the phone writes it onto its shell, and both
stylesheets read `var(--m8-person)` without knowing whose colour it is.

> **Correction, 2026-08-21.** This paragraph originally ended "so they cannot
> disagree about who is coral". They could, and did. The television wrote the
> colour once, when the chip element was created, and never again — so after
> anybody left, it kept every survivor's original colour while the phones
> recomputed from the new index, and the next person to join was handed a
> colour somebody at the table was already wearing. The defect and its fix are
> in *The colour, after somebody leaves* below. The claim above is true of the
> design and was not true of the code; it is stated as design here, and the
> guarantee is now carried by a test rather than by this sentence.

It is not stable across a departure: if the second of four people leaves, the
two behind them shift one colour along. That is deliberate — and until
2026-08-21 only the phone actually did it. The alternative —
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

**No automated guard covered this at the time of writing.** The syntax guard
parses JavaScript; the size guard weighs bytes; nothing parsed the emitted CSS
against the old target. That third guard was written the next day —
`scripts/check-tv-css.mjs`, described below.

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
- ~~**No guard parses the emitted CSS** against the old target.~~ Closed on
  2026-08-21 by `scripts/check-tv-css.mjs`.
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

---

# Review follow-up — the defects the visual identity shipped with

Written 2026-08-21. Everything below describes the working tree at the moment
of writing: branch `main`, the work committed, nothing pushed. Every figure was
measured on this machine on that date, in the container, with a real Chromium
driven over the DevTools protocol — not recalled and not reasoned about.

A review of the pass above found four defects and three smaller gaps. All seven
are closed. Two of them were the kind that only a browser finds, so the
verification for those is a browser too, and both were turned into something
that can fail in CI rather than something somebody has to look at again.

## The row of people broke the safe area with ordinary names

**What was wrong.** `.m8-people` wrapped, and the note in the stylesheet said
the table above shrinks to pay for the second row. It cannot. `.m8-table` is a
column flex item whose content — the QR, 432px at 1920 — sets a floor it will
not go below, so after two lines there is nothing left to pay with. Measured in
Chrome at eight participants, sweeping nickname length:

| Nickname length | Lines | Where the last chip ended up |
|---|---|---|
| up to 9 | 2 | on the safe line |
| 10 to 15 | 3 | 72px into the overscan at 1920×1080, 28px at 1280×720 |
| 16 | 4 | two chips off the panel entirely, at both resolutions |

`NICKNAME_MAX_LENGTH` is 16 and `MAX_PARTICIPANTS` is 8, so every one of those
rows is inside what the product permits, and ten characters is a name, not an
attack. A television has no scrollbar and nobody standing at it to scroll.

The wrap fix looked sufficient because the check that accepted it used eight
people with *one* long nickname.

**What was done.** A chip is now capped at a quarter of the row, and everything
inside it truncates rather than widening it:

- `.m8-chip` gets `flex: 0 0 auto`, `max-width: 25%` and `overflow: hidden`.
- The space between chips moved from `margin-right` to `padding-right`, so it
  is *inside* the quarter. Four chips of 25% plus four margins is more than a
  line holds, and the fourth would have wrapped.
- The nickname and the `RECONNECTING` note are a column (`.m8-chip-text`) with
  `min-width: 0`, each `overflow: hidden; text-overflow: ellipsis`. A flex
  item's floor is its content unless it is told otherwise, so `min-width: 0` is
  what lets the cap bite at all.

A percentage rather than a pixel width, because the safe area is a percentage
of the screen: one rule holds at 1280, at 1920 and at whatever a laptop is,
with no breakpoint to keep in step. Four to a line is not a taste — eight is
what the table holds and two lines is what the screen has room for, so it is
the only cap that works.

Two consequences, both deliberate:

- **The note moved under the name rather than beside it.** `RECONNECTING` set
  beside a nickname does not fit in a quarter of a 1280-wide screen, and
  squeezing the name to make room would have hidden *which* person had gone.
  It is smaller and less tracked than the other eyebrows and has its own token
  (`--m8-chip-note-type`, 19px and 13px) rather than sharing `--m8-note-type`
  with the error code, which has no such constraint. The size was chosen by
  measuring the rendered text against its box, not by estimating: at the first
  size tried it overflowed by 4 to 13px and was being ellipsised.
- **Below four people the cap is width nobody is using.** A table of two would
  have truncated two nicknames with three quarters of the row empty, which is a
  regression the fix should not introduce. The renderer writes `data-abreast`
  on the row — the count, never more than four — and three rules relax the cap
  to 100%, 50% and 33.3333%. They only ever loosen, and only for counts that
  fit on one line anyway, so the two-line guarantee does not depend on them; a
  row that somehow never receives the attribute keeps the strict quarter rather
  than losing it.

**One more defect found while measuring.** The disc was giving up thirteen
pixels of its width and none of its height when the chip was capped, so the one
circle carrying a person's colour was drawn as an ellipse at eight people and a
circle at four. `flex: 0 0 auto` on `.m8-chip-disc`. Discs now measure 96×96 and
60×60 in every case below.

**The covering test.** `scripts/tv-safe-area.ts` and
`scripts/tv-safe-area.test.ts`, following the pattern of
`scripts/tv-size-budget.ts`: the box arithmetic is a pure module exercised with
plain numbers, and the test is what reads the real stylesheet and feeds it in.
The sweep is now two claims rather than one eyeball:

1. **No string anybody can type changes how many chips fit on a line.** The
   test asserts the stylesheet facts that make that true — the cap, the
   `overflow`, the padding-not-margin, the `min-width: 0`, the ellipsis on both
   the name and the note, and that the relaxed caps are never narrower than the
   unconditional one and never apply at a full line.
2. **Given (1), the arithmetic closes** at every count from 1 to
   `MAX_PARTICIPANTS`, at 1280×720 and at 1920×1080, including the QR's turned
   bounding box fitting inside the table it lies on. The sizes come from
   `styles.css` and `tokens.css` rather than being restated, so the test fails
   when a size changes rather than when somebody remembers to update it.

It also guards itself from both ends: it asserts that removing the cap (three
lines of people) *does* overflow at both resolutions, and that the maximum tilt
it assumes still matches `TILT_MAX_DEGREES` in `apps/tv/src/tilt.ts`.

**What that test still cannot know is font metrics** — whether `RECONNECTING`
fits the width it is given is a question for a browser. What makes that a
cosmetic question rather than a layout one is claim (1): the text truncates, so
it cannot move a chip onto a third line whatever it measures.

**The evidence.** The container was built and run, and the large screen driven
in headless Chromium at both resolutions over 32 cases: eight people at
nicknames of 1, 6, 9, 10, 12, 14 and 16 characters; eight people with three of
them dropped and with all eight dropped; five, four, three, two and one people
at sixteen characters; and an empty table. Every case: **two lines or fewer, the
last chip's bottom edge exactly on the safe line and never past it, nothing
past the safe area on the right, no document scroll, the QR entirely inside the
violet surface with 19 to 97px to spare, discs square, and the note never
clipped.** 32 of 32.

## The colour, after somebody leaves

**What was wrong.** `newChip(index)` wrote `--m8-person` when the element was
created and `updateChip` never refreshed it. Chip elements are reused — that is
what the arrival animation rests on — so the television kept every survivor's
original colour while the phones recomputed from the array index:

```
four seated, TV:   a→1  b→2  c→3  d→4
b leaves,    TV:   a→1  c→3  d→4
b leaves, phones:  a→1  c→2  d→3        ← already disagreeing
e joins,     TV:   a→1  c→3  d→4  e→4   ← two people, one colour
e joins,  phones:  a→1  c→2  d→3  e→4
```

`packages/tokens/src/person-color.ts` states the shift on departure is
deliberate, and that the alternative "lets two people at one table land on the
same colour, and two identical colours in the room breaks the one thing this is
for". Only the phone implemented the shift, so the design produced exactly the
failure it was written to prevent — and it produced it on the milestone's own
definition of done: somebody leaves for good and a third person scans the QR.

**What was done.** The property write moved out of `newChip` and into
`updateChip`, which now takes the arrival index and is called on every render.
`newChip` no longer takes an index at all, so there is nowhere left to write a
colour that could go stale.

**The covering test.** Nothing in the suite covered what a departure does to
colour; the existing test covered a join, which is the one case where writing
once happens to be right. `apps/tv/src/render.test.ts` gained
`when somebody leaves`: that everybody behind a departure shifts one colour
along, that the next person to join is not handed a colour somebody is already
wearing (asserted as four distinct values, not only as a list), and that the
television's colours equal `personColor(index)` over the same snapshot — which
is literally what the phone computes.

**The evidence.** Run against the container, with real Socket.IO clients and
the real page:

```
four seated, TV:   Ana→1  Bia→2  Caio→3  Duda→4
Bia leaves, TV:    Ana→1  Caio→2  Duda→3
Eva joins,  TV:    Ana→1  Caio→2  Duda→3  Eva→4
distinct colours:  4 of 4
```

And with a real phone page in the same room, at 390×844, joining third and then
watching the first person leave: the television read `--m8-person-3` and the
phone's computed `--m8-person` was `#c6f24e`; after the departure the television
read `--m8-person-2` and the phone read `#2bd9e4`. The two screens agree, before
and after.

## A departure no longer replays the arrival animation

**What was wrong.** Chips were placed by comparing each against whatever
occupied its index. When the person at index *i* left, every survivor behind
them failed that comparison and was `insertBefore`-d — which in Blink is a
remove and an insert, so each one restarted its CSS animation. The one signal in
this product, "your phone connected", fired for three people at the moment a
fourth left.

**What was done.** Two changes in `syncPeople`, and the order of them is the
fix:

1. **Whoever left is removed first, before anybody is placed.** Placing against
   a row that still holds a departed chip is what made the survivors look
   misplaced.
2. **Each chip is compared against the one that should precede it**, not
   against its index. An index comparison reads a row mid-rearrangement and
   disagrees with itself; the previous sibling is the only neighbour already
   known to be in its final place.

Either alone is insufficient: with the removal left until last, the
previous-sibling comparison still finds the departed chip in the way.

**The covering test.** jsdom runs no animations, so the test asserts the cause
rather than the effect: with four people seated and the second leaving,
`insertBefore` is not called on the row at all, and the three survivors are the
same three elements as before. A genuine reorder still moves elements, which is
correct and is still covered by the existing row-order test.

## A guard now reads the emitted stylesheet

**What was wrong.** Nothing did. The syntax guard parses the JavaScript and the
size guard weighs bytes; the stylesheet — the one artefact on this screen
containing rules nobody in this repository wrote — was checked by hand, once.
Tailwind emits `::backdrop`, `::-ms-backdrop`, `.transform` and `.outline` from
words it found in the source, and its own preflight emits
`[hidden]:where(:not([hidden=until-found]))`. Preflight is switched off for
exactly that reason, but that switch was a *comment* in
`apps/tv/tailwind.config.js`, and a comment does not fail.

**What was done.** `scripts/check-tv-css.mjs`, in the shape of
`scripts/check-tv-syntax.mjs`: pure logic (`stripCssComments`,
`findUnsupportedCss`, `assertTvCss`) separated from disk access, a `.d.mts`
beside it so a TypeScript test can call it, a CLI entrypoint whose target
directory is overridable so tests can point it at a fixture, and
`npm run guard:css` wired into `npm run guards` — which is what CI runs.

It rejects 23 constructs, each with the Chromium version it needs: `:is()`,
`:where()`, `:has()`, `:focus-visible`, `clamp()`, `min()`, `max()`,
`color-mix()`, `oklch()`, `oklab()`, `lch()`, `lab()`, `aspect-ratio`,
`backdrop-filter`, `gap`, `row-gap`, `column-gap`, `inset`, `overflow: clip`,
`@layer`, `@container`, `@property`, and viewport-relative units. The Tailwind
v4 spellings are there deliberately: v4 needs Chrome 111, and `@layer`,
`oklch()`, `color-mix()` and `@property` are how it would announce itself if
`apps/tv` were ever moved onto it by a well-meaning dependency update.

Three things in it are worth reading twice, because each is a false positive
that was found and fixed rather than imagined:

- **Comments are stripped first.** `apps/tv/src/styles.css` explains at length,
  in prose, that it uses no `clamp()`, no `:where()`, no `aspect-ratio` and no
  `gap`. A guard reading an unminified stylesheet would fail the build on the
  paragraph explaining why the build should pass.
- **A property is matched at the start of a declaration**, after `{` or `;`,
  never merely "preceded by whitespace". `--m8-safe-inset`, `--m8-piece-gap`,
  `--m8-chip-gap`, `--m8-row-gap` and `--tw-ring-inset` are all real custom
  property *names* in the emitted stylesheet, and every one of them ends in the
  spelling of a banned property. A looser guard fails on the names invented to
  avoid the properties.
- **A function is matched only where it is a function.** `minmax(` is not
  `max(`. And a functional pseudo-class is anchored by its own colon, because
  the character before `:is(` in `.a:is(.b)` belongs to the selector.

**The covering tests.** `scripts/check-tv-css.test.ts`: one rejection case per
construct, nine acceptance cases taken verbatim from the stylesheet the
television is actually sent, the comment-stripping case, the multiple-findings
case, and four subprocess runs proving the CLI accepts a clean fixture (asserted
on stdout, not only on exit 0 — a broken Windows entrypoint exits 0 having read
nothing), rejects a missing directory, rejects a directory with no CSS, and
rejects the preflight rule. Plus a check of whatever build is on disk, skipped
when there is none.

`scripts/tv-tailwind-config.test.ts` asserts `corePlugins.preflight === false`
directly. The CSS guard would catch the emitted selector; this catches the
decision, which is a better error message.

## Three smaller things, folded in

**Two preflight gaps that were leaning on a browser default.**
`body { font-family: var(--m8-font-text) }`, which the phone already had, and
`*, ::before, ::after { border: 0 solid }`. Neither changed anything visible
today, which is exactly what made them worth writing down: with preflight off,
anything added without a `font-family` inherits the browser's default serif on a
screen that has no serif in it, and `border-width: 3px` alone draws nothing,
because the initial `border-style` is `none`.

**The display face is `[A-Z0-9 ]`, not merely "uppercase".** The subset has no
hyphen, no full stop and no apostrophe. The comment in `apps/tv/src/render.ts`
said "uppercase Latin and digits", which reads as permissive about punctuation
that is not in the file. The five strings are now one exported object,
`DISPLAY_FACE_STRINGS`, with the pattern beside them, and `render.test.ts`
asserts every member matches — plus, guarding the guard from the other side,
that `TIC-TAC-TOE` and `Reconnecting` do *not*. This is about to matter rather
than being theoretical: the first game is tic-tac-toe, and an eyebrow reading
`TIC-TAC-TOE` would drop two hyphens into a fallback face and say nothing about
it. A further test renders all three screens and finds each string on the one
that draws it, so the set stays the whole set.

**The Tailwind content glob no longer scans the tests.** Tailwind finds
candidate class names in raw text and cannot tell a class from any other word:
`p-1`, `p-2` and `p-3` are participant ids in `render.test.ts`, and `contents`
and `lowercase` came out of prose in the tests. All of them shipped to the
television as real rules — bytes off the budget, and selectors on the new
guard's surface, for classes nothing renders. `'!./src/**/*.test.ts'` removes
`.p-1`, `.p-2`, `.p-3`, `.lowercase` and `.filter` (and with `.filter` gone, the
`::-ms-backdrop` variable block it dragged in — `::backdrop` itself is still in
the shipped stylesheet, one occurrence, harmless in itself since it is
Chromium 37, but worth stating correctly in a document that is the record of a
correction round).
`scripts/tv-tailwind-config.test.ts` resolves the patterns with `fast-glob` —
the same library Tailwind resolves them with, now a declared root
devDependency rather than a borrowed transitive one — and asserts that
`src/render.ts` is scanned, that no `.test.ts` is, and that there are test files
there to be excluded in the first place.

## The numbers

|  | Before this pass | After |
|---|---|---|
| Tests | 374 in 30 files | **475 in 33 files** |
| Guards | 2 | **3** |
| Ceiling | 42,000 B | **42,000 B — unchanged** |
| Measured | 37,990 B | **38,165 B** |
| Headroom | 4,010 B | 3,835 B |

The 175 bytes are the stylesheet growing by 50 B gzipped (the cap, the text
column, the relaxed caps, the two reset rules, less what excluding the tests
removed) and the bundle by 125 B gzipped (`DISPLAY_FACE_STRINGS`, the
`data-abreast` attribute, and the reordered `syncPeople`). The ceiling did not
move.

## Verified

- `npm test` — **475 passed, 33 files**, through PowerShell. (Under the
  sandboxed Bash tool every vitest worker still dies and reports zero tests: a
  known environment defect, not a suite failure. Every figure here comes from
  PowerShell.)
- `npm run typecheck` — clean across all three projects.
- `npm run guards` — ES2017 syntax check passed; **Chromium 68 CSS check
  passed**; size 38,165 B against 42,000 B.
- `docker compose up --build -d` — built and running, serving the large screen.
- The container driven with headless Chromium and real Socket.IO clients: the
  32-case layout sweep described above, the four-person departure sequence, and
  a real phone page at 390×844 confirming both screens name the same colour
  before and after a departure.

## Not verified, and still open

- **Still nothing has been on a real television.** Everything above was
  measured in Chromium on a PC. `docs/tv-smoke-test.md` steps 10 to 13 remain
  unrun.
- **The CSS guard is a closed list, not a parse.** It matches roughly two
  dozen named constructs; anything not on the list passes regardless of how
  ordinarily it is spelled. `margin-inline-start` (Chromium 87 — precisely
  what Tailwind v3's `ms-*` and `me-*` utilities emit) and `text-wrap:
  balance` (114, from v3.4's `text-balance`) both pass clean today, and so do
  `inset-inline`, `content-visibility`, `accent-color`, `translate`,
  `::marker`, unprefixed `appearance` and `grid-gap`. The first two are
  exactly the "a Tailwind minor bump arrives and nothing in the diff looks
  wrong" route this guard exists to close. Parsing would not fix this — the
  problem is not tokenising CSS (that is why the syntax guard beside it needs
  a real parser: JavaScript text is genuinely ambiguous, which is why a naive
  search for `?.` trips over `?.5`) but coverage of what to look for. If this
  is ever strengthened, the direction is a browser-support database
  (browserslist, doiuse, postcss-preset-env), not a parser. It is a floor,
  not a proof.
- **The safe-area test models boxes, not glyphs.** It cannot know how wide a
  word is. The layout was made content-independent so that it does not have to,
  and the one place a glyph width still matters — whether `RECONNECTING` fits
  its column — is checked in a browser and recorded here, not in CI.
- **`prefers-reduced-motion` still does nothing on the oldest supported sets**,
  and **nicknames outside Latin-1** still fall back to a system font. Both are
  properties of the target, unchanged.
- **The baton still has no visual mark.** Unchanged, and still waiting for the
  first game.
- **Colour contrast is still judged by eye**, not measured against a ratio.
- **The size guard is still blind to a future image asset**, the
  table-stays-square test still cannot see a real transform under jsdom, and the
  historical plan document still names the old budget key. All three were
  carried deliberately and are not touched here.

## A second correction round, closing the review's residual findings

Five small findings from the review that approved the previous round for
pushing, addressed here. At the moment of writing, the working tree is clean
against `8d221e2` other than the changes below.

**1. `README.md` claimed the CSS guard parses.** It scans stripped text — the
guard's own file says so, and this document now says so above. "Parses" is
now "scans" on the line that names all three guards.

**2. The CSS guard's stated limitation named the wrong axis.** It said a
selector spelled unusually could slip past — the small hole. The real one is
that the guard is a closed list of roughly two dozen named constructs, and
anything not on the list passes regardless of spelling. Checked against the
list in `scripts/check-tv-css.mjs`: `margin-inline-start` (Chromium 87,
exactly what Tailwind v3's `ms-*`/`me-*` utilities emit), `text-wrap: balance`
(114, from v3.4's `text-balance`), `inset-inline`, `content-visibility`,
`accent-color`, `translate`, `::marker`, unprefixed `appearance` and
`grid-gap` all pass the guard as it stands today — confirmed by reading the
pattern list rather than assumed. The docstring above `UNSUPPORTED_CSS` in
`scripts/check-tv-css.mjs` and the "Not verified" entry above now both say
this honestly, name `margin-inline-start` and `text-wrap` as the two that
matter most (the "nothing in the diff looks wrong" route), and record that a
browser-support database — browserslist, doiuse, postcss-preset-env — is the
direction if this is ever strengthened, not a parser: the guard's problem is
coverage, not tokenising, which is the opposite of why the syntax guard beside
it needs a real parser. No database was added; that is a larger piece of work
than a correction round carries.

**3. Two stale sentences.** `.github/workflows/ci.yml` said "both guards" in
a comment; there are three now, so it says "all three guards". This document
said excluding tests from the Tailwind content glob removed both the
`::backdrop` and `::-ms-backdrop` blocks; only the second is true.
`::-ms-backdrop` is gone. `::backdrop` is still in the shipped stylesheet —
one occurrence, confirmed with a grep against
`apps/tv/dist/assets/index-*.css` after a fresh build. Harmless in itself
(Chromium 37), but this document is the record of a correction round, so the
paragraph now says so correctly.

**4. `.m8-chip-disc`'s `flex: 0 0 auto` shipped without a guard.** Every other
fix in the previous round pinned the regression it repaired; this one did
not, because the safe-area model is height-only and cannot see a width-only
shrink. `scripts/tv-safe-area.test.ts` gained
`'keeps the disc a fixed square rather than letting the cap shrink it'`,
asserting `flex: 0 0 auto` and that `width` and `height` both read
`var(--m8-disc-size)` — reading the declaration text the same way every other
stylesheet-facts test in that file already does, not attempting layout in
jsdom.

**5. The sub-pixel wrap risk was real, and worth removing.** Four chips at
exactly `max-width: 25%` sum to exactly the width of the line. At a screen
width where the 5% inset and a quarter of what remains do not divide into
whole pixels — 1366×768 is the plausible member of the old target set —
per-item rounding could push the fourth chip's rendered width a fraction over
budget, which is the three-line overflow this cap exists to prevent. Both
design resolutions (1152px and 1728px safe width) divide by four exactly, and
the safe-area arithmetic reasons in exact percentages, so neither would show
it. Changed `.m8-chip`'s cap to `calc(25% - 1px)`, with a comment in
`apps/tv/src/styles.css` recording why. `calc()` is unconditionally safe on
the Chromium 68 floor and is already used elsewhere in the same file.

The test needed adjusting, not just re-running: `chipCapPercent` was read
with a bare `Number.parseFloat` on the `max-width` declaration, which returns
`NaN` against `calc(25% - 1px)` because the value no longer starts with a
digit. Added a `percent()` helper beside the existing `pixels()` one that
pulls the percentage out of either a bare `25%` or a `calc()` expression by
regex, and used it in place of the direct parse. The exact-value assertion in
`'caps the chip and clips what will not fit'` was tightened from `` `${chipCapPercent}%` ``
to `` `calc(${chipCapPercent}% - 1px)` ``, so the test pins the one-pixel
shave itself rather than merely surviving it. `chipsPerRow`'s own model
still reasons in the nominal 25% — the 1px is a rendering safety margin
invisible to a model that works in exact percentages, and it only tightens
the real cap relative to the model, never loosens it, so nothing the model
already proved stops holding.

**Verified**, through PowerShell (the sandboxed Bash tool still kills vitest
workers and reports zero tests, per the known environment defect):

- `npm test` — **476 passed, 33 files** (475 plus the new disc-square test).
- `npm run typecheck` — clean across all three projects. (One intermediate
  failure while writing the new test: a `RegExpExecArray` index access typed
  as `string | undefined` without the same guard the neighbouring
  `declaration()` helper already carries. Fixed by adding the same
  `match[1] === undefined` check before use; typecheck was clean before this
  round and is clean again now.)
- `npm run guards` — ES2017 syntax check passed; Chromium 68 CSS check
  passed; size **38,172 B** against the 42,000 B ceiling (up 7 B from 38,165 B
  — the `calc(25% - 1px)` bytes, gzipped).
