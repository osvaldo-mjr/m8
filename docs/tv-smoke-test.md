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

1. The screen encoded connection state in a  attribute and
   styled nothing, so a participant who had left rendered identically to one
   who was present. The test guarding it asserted the attribute existed —
   true, and invisible to anyone in the room.
2. The heartbeat still used the library defaults, so a device that vanished
   without closing its socket took up to forty-five seconds to register.

Still open:

- The set model and firmware year.
- The screen still gives no visual sign of who holds the baton — the same
  defect as the first one above, in the same function, on an attribute
  nobody can see. Left deliberately: no baton-only action exists yet, and
  how it should look belongs to the visual identity pass.

