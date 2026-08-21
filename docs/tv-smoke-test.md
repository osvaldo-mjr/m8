# Television smoke test

Run this on a real Samsung (Tizen) or LG (webOS) set at the end of every
milestone, and the first time as early as possible. No automated test can
replace it: Playwright would drive a recent Chromium and could never catch a
syntax feature the television lacks. Every decision about the large screen
(ES2017 output, no flexbox `gap`, Tailwind v3 rather than v4) is calibrated
from documentation about Chromium 68-79, not from experiment — the set's
browser is the only place that can confirm the calibration was right.

Record the set's model and firmware year with the result, whether the test
passes or fails.

## Before you start: the Windows network profile and firewall

The server binds `0.0.0.0`, but Windows will not let another device on the
network reach it unless the network is trusted and the port is open. Do both
before running `npm run lan`. Open PowerShell **as Administrator** for these.

1. Confirm the network profile is Private (not Public):

   ```powershell
   Get-NetConnectionProfile
   ```

   If `NetworkCategory` shows `Public` for the active adapter, set it to
   Private:

   ```powershell
   Set-NetConnectionProfile -InterfaceAlias "<your adapter name>" -NetworkCategory Private
   ```

2. Allow inbound TCP on the server port (3000 by default) for the Private
   profile:

   ```powershell
   New-NetFirewallRule -DisplayName "M8 LAN (port 3000)" -Direction Inbound `
     -Protocol TCP -LocalPort 3000 -Profile Private -Action Allow
   ```

Windows may also prompt with its own "allow this app on private networks"
dialog the first time `npm run lan` opens a listening socket — accept it.
Without both of these, phones and the television will time out trying to
reach the printed LAN address, and it will look like an application failure
when it is a network-profile problem.

## Steps

1. Run `npm run lan` on the PC and note the printed LAN URL (the log line
   reads `Large screen: http://192.168.x.x:3000`, or similar). If more than
   one `Large screen:` line prints, use the one on the same network as the
   phone (usually the Wi-Fi or Ethernet adapter) and ignore the rest.
2. Open that URL in the television browser.
3. Confirm the table code renders and is legible from three metres.
4. Confirm the QR code renders and scans from a phone.
5. Confirm nothing is cropped: the code and the QR are fully inside the
   screen (the 5% safe-margin budget exists for exactly this).
6. Join from a phone and confirm the nickname and the chosen avatar appear
   on the television within about a second, and that the avatar is
   recognizable from three metres.
7. While a second phone joins, watch the QR: it must stay put. A QR that
   blinks each time somebody arrives is the image being refetched.
8. Reload the television page and confirm it rejoins the same table code
   with the participant still listed.
9. Turn the phone Wi-Fi off and on; confirm the television marks the
   participant disconnected and then connected again.

The steps below arrived with the visual identity and **have not been run on a
real set yet**. Two self-hosted `woff2` files, a CSS `transform` and a
`box-shadow` are new demands on this browser generation; all are documented as
supported on Chromium 68, and none has an experiment behind it.

10. Confirm the four code characters render in the wide, heavy face — they
    should be visibly wider and blacker than the address line beneath them. If
    they look like ordinary system type, the self-hosted font did not load and
    the fallback stack is drawing them.
11. Confirm each code tile and the QR sit turned — noticeably, from three
    metres, not subtly — and at different heights, with unequal gaps between
    the tiles, while the wooden table itself and the row of people are
    square. If everything is square, `transform: rotate()` is not being
    applied; if the tiles are turned but all sit on one line, the
    `translateY(calc(var(--m8-scatter-step) * N))` half is not.
12. Watch the row of people while a phone joins: the arriving chip should pop
    once, and no chip already on screen should move or re-animate.
13. With three or more people seated, confirm each has a visibly different
    colour, and that the colour on somebody's phone is the same as the colour
    of their chip on the television.
14. Confirm each tile and the QR cast a soft shadow onto the wood, and that
    the table carries a darker band along its lower edge. Both are what make
    it a table rather than a coloured rectangle; a set that drops
    `box-shadow` would leave the tilt reading as a layout mistake, and one
    that drops the `border-bottom` would leave the table flat. Confirm the
    shadows fall *away from the middle of the table* — the leftmost tile
    throws left, the QR throws right, the middle of the row throws straight
    down — because that is what says there is one lamp above the table
    rather than five.
15. On the phone, before joining, tap through the avatar picker (`YOUR FACE`)
    and confirm the chosen tile is marked by a visible border, not only by a
    change of fill colour. `apps/phone` has no DOM test, so this step is the
    only guard against the selection cue going quiet again: it already
    happened once, silently, when the palette changed and the chosen tile's
    fill dropped as low as 1.65:1 against an unchosen one for three of eight
    avatars — caught only because the owner looked at a phone.
16. The room, which is the whole of the round that added this step. Confirm,
    from three metres:
    - the floor behind the table reads as a grid of square tiles, with a
      darker joint between them. The joints are fifteen code values below the
      tile at their strongest, which is inside the range a set with an
      aggressive contrast or "dynamic contrast" setting can crush to a flat
      black. If the floor reads as one flat colour, say so and say what the
      set's picture mode was — that is the finding, not a defect in the page.
    - the tabletop reads as **boards**: five horizontal joints across it, and
      the boards either side of a joint at slightly different tones. Same
      crush risk in the other direction, and the same thing to record.
    - the light is a **pool over the middle of the table**, brightest in the
      centre and falling off towards the ends, with a warmer band of floor
      hugging the table's top edge.
    - **and this is the one this step exists for: look for stripes.** The
      light pool and the boards are drawn as flat steps with hard edges
      precisely so that a set's picture processing has no ramp to quantise
      into bands. If any of it comes back as a stack of stripes rather than
      as two or three flat regions, the argument in
      `docs/notes/visual-identity-report.md` is wrong on real hardware and
      needs to know.

## What to record on failure

- The set's model and firmware year.
- Whether the page rendered at all, or rendered with wrong colours or
  layout (screenshot or photograph if possible).
- Whether the connection established, and on which transport. The server
  writes a `socket transport negotiated` line for every device, carrying
  `transport` (`polling` or `websocket`) and `upgraded`. A device that
  stays on `polling` never upgraded — that is the fallback doing its job,
  and worth knowing. **This is the single most diagnostic fact
  available** — a television stuck on long-polling is a very different
  problem (proxying, WebSocket support) from one that never reaches the
  server at all (network profile, firewall, wrong URL).

A failure at step 2 or step 6 is the risk the design document flagged as the
largest unknown in the whole platform. It is survivable either way: the
`Transport` interface exists precisely so that replacing Socket.IO with
something the set's browser tolerates better is writing one class, not
redesigning the platform.

## Results

### 2026-08-21 — Samsung (model and year still pending) — PASSED, with one observation

The room round on real hardware: floor, wooden table, lamp pool and directional
shadows. The owner validated it.

**Observed, not fixed:** on some sets the table looks more stretched than on
others — noticeable, not bad enough to act on yet.

The likely cause is worth writing down before somebody rediscovers it. The
table has no locked proportion: it is a flex child whose width comes from the
stage and whose height comes from its content and the space left over, so its
aspect follows the viewport. `aspect-ratio` would pin it declaratively and is
**Chromium 88** — above the floor this project targets, so the one obvious tool
is unavailable. The workaround is the percentage-padding trick, which fights
the column flex layout the safe-area model is built on, so it is not a small
change.

Two things to establish before anyone attempts it: whether the stretch tracks
the *panel* (a set running its browser at a non-16:9 internal resolution and
scaling up) or the *viewport* (the layout genuinely getting a different aspect
and the table following it). They need different fixes, and only a second set
tells them apart. Record the model, the reported viewport size, and a
photograph next time.



Record every run here, passed or failed. An unrecorded pass is a risk nobody
can prove was retired.

### 2026-08-20 — Samsung (model and year pending) — PASSED

Run over `npm run docker`, container publishing port 3000, two phones joining
from the house network.

Confirmed by the operator:

- The page rendered on the television.
- The QR code rendered and scanned from a phone.
- Two phones joined and appeared on the screen.
- Avatars rendered as glyphs, not as missing-character boxes — the one thing
  no automated test can check, since emoji coverage on this browser generation
  is not guaranteed.
- The QR did not flicker when participants joined or changed their profile,
  confirming the reuse fix rather than the rebuild-every-message behaviour.
- The screen updated promptly as phones acted.

**This retires the design document's largest named risk.** The large-screen
target was calibrated for Chromium 68-79 from documentation rather than
experiment; it now has one confirming experiment behind it.

Exercised in a follow-up run the same day, after the findings below were
fixed:

- Step 5, overscan — the code and the QR sit well inside the frame on this
  set, with margin to spare. Photographed.
- Step 8, reloading the television — it came back to the same table, same
  code, with the seated phone still listed. The stored code survives a
  reload, which is the behaviour the design promises.
- Step 9, dropping a phone off the network — after the fixes, the screen dims
  the participant and labels them within about ten seconds, and restores them
  when the network returns.
- Transport: **WebSocket, negotiated directly, no upgrade and no fallback**,
  on every connection this set made. The long-polling fallback that motivated
  choosing Socket.IO over a raw WebSocket was not needed here. It remains
  insurance for the rest of the catalogue rather than something this set
  depends on.

**Two defects were found by this run that no automated test had caught**, both
worth recording because they justify the existence of this checklist:

1. The screen encoded connection state in a `data-connected` attribute and
   styled nothing, so a participant who had left rendered identically to one
   who was present. The test guarding it asserted the attribute existed —
   true, and invisible to anyone in the room.
2. The heartbeat still used the library defaults, so a device that vanished
   without closing its socket took up to forty-five seconds to register.

Still open:

- The set model and firmware year.
- The screen still gives no visual sign of who holds the baton — the same
  defect as the first one above, in the same function, on an attribute
  nobody can see. This was left for the visual identity pass, which has now
  happened and did not settle it: the approved direction describes the code
  tiles, the QR, the per-person colour and the row of people, and says
  nothing about the baton. Inventing a mark for it would have been the one
  thing that pass was told not to do. It stays open, and it is now a
  question for whoever specifies the first game, where a baton-only action
  finally exists to justify a mark.
- Steps 10 to 13 (typography, tilt, the arrival pop, the per-person colour)
  have never been run on a television.

