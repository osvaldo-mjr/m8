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
6. Join from a phone and confirm the nickname appears on the television
   within about a second.
7. Reload the television page and confirm it rejoins the same table code
   with the participant still listed.
8. Turn the phone Wi-Fi off and on; confirm the television marks the
   participant disconnected and then connected again.

## What to record on failure

- The set's model and firmware year.
- Whether the page rendered at all, or rendered with wrong colours or
  layout (screenshot or photograph if possible).
- Whether the connection established. If it did not, check the server log:
  it shows whether the Socket.IO transport fell back to long polling before
  giving up entirely. **This is the single most diagnostic fact
  available** — a television stuck on long-polling is a very different
  problem (proxying, WebSocket support) from one that never reaches the
  server at all (network profile, firewall, wrong URL).

A failure at step 2 or step 6 is the risk the design document flagged as the
largest unknown in the whole platform. It is survivable either way: the
`Transport` interface exists precisely so that replacing Socket.IO with
something the set's browser tolerates better is writing one class, not
redesigning the platform.
