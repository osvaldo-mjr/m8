# Twelve carried gaps — closing report

Working note, not a spec. Branch `main`.

Written in two passes: the first section covers the twelve carried gaps, the
second the review that followed it. Anything it says about the state of the
working tree describes the moment of writing, not the moment of reading — the
branch is expected to be pushed once the review is closed, and a note whose
subject is claims that stopped being true should not add one.

## Starting and finishing state

| | Before | After |
|---|---|---|
| Tests | 267 in 22 files | 294 in 25 files |
| Typecheck | clean (`tsc --noEmit`) | clean (`tsc --noEmit && tsc -p apps/tv`) |
| Syntax guard | passing | passing, 1 file |
| Size guard | 15 995 B gzipped / 18 900 B | 15 995 B gzipped / 18 900 B |
| Runtime image | 350 MB | 222 MB |
| Container | built and ran | built, ran under compose, routes checked |

The large-screen bundle did not move: 14 118 → 14 119 B of JavaScript and
1 877 → 1 876 B of CSS, for the same 15 995 B total. The only bundle-visible
change was a Tailwind token rename, and it renamed a class of the same length.

One note on the environment before anything else: `npm test` and `npm run
typecheck` had to be driven through PowerShell. Run through this session's
sandboxed Bash tool, every vitest worker died with `Vitest failed to find the
runner` before collecting a single test — an artefact of the sandbox, not of
the repository. Every figure quoted here comes from a PowerShell run.

`CLAUDE.md` records that there is no linter, so the "lint" step named in the
brief has no counterpart to run; typecheck, tests and both guards are the
whole gate.

## Commits

| SHA | Subject |
|---|---|
| `b02ebf5` | Refuse a message from a connection the fake has already closed |
| `348e3f4` | Let the server be silenced, so tests are not drowned in request JSON |
| `a276092` | Stop the environment from raising the large-screen size ceiling |
| `06709ba` | Ship a runtime image that holds only what the server runs |
| `ef4a83d` | Rename the large screen's slate token so it stops deleting a palette |
| `190ec55` | Refuse to open a table instead of taking the server down with it |
| `6b88278` | Publish the nickname limit on the wire so the phone stops guessing it |
| `99a5221` | Check the large screen against the libraries its televisions have |
| `9b0f53f` | Correct the design document where it contradicts the compose file |
| `e757757` | Carry tsconfig.base.json into the image, which the screen's build now needs |

The last one is a consequence of item 12 rather than an item of its own; see
that section.

---

## 1. The Dockerfile omitted `packages/avatars`

**Done.** `COPY packages/avatars/package.json ./packages/avatars/package.json`
added, and the comment above the block rewritten so it says why every
workspace has to be there rather than merely asserting that they are.

**Covering test:** `scripts/dockerfile-manifests.test.ts`. It reads the
workspace list off disk — every directory under `packages/` and `apps/` that
holds a `package.json` — and asserts a matching `COPY` line, so adding a
workspace and forgetting the Dockerfile fails in the ordinary suite. It also
carries a guard-the-guard assertion, since a broken directory scan would make
every case vacuously true.

**Evidence:** with the `packages/avatars` line temporarily deleted, the test
fails with `× copies the manifest of packages/avatars before npm ci`, and
passes with it restored.

## 2. `TableCodeExhaustedError` had no catcher

**Done, and the error class is gone.** The mechanism chosen:

- `DomainError` in `packages/core/src/views.ts` gains `table-unavailable`.
- `TableRegistry.openTable` now returns `OpenTableResult` — `{ table }` or
  `{ error }` — instead of a `Table`, mirroring the existing `JoinResult`.
- `createTable` is no longer public. Code minting moved to a private
  `#mintCode()` that returns `string | undefined`. There is now exactly one
  way to obtain a table and it cannot throw, so the foot-gun is not merely
  unused but absent.
- `TableCodeExhaustedError` is deleted along with its export. Nothing threw it
  any more, and an exported error class that nothing can produce is worse
  documentation than none.
- `Session` answers a refusal with `{ type: 'error', code: 'table-unavailable' }`
  and attaches nothing, so the screen is never left displaying a code nobody
  can join. The large screen already renders an error code on its face
  (`renderError`), which is the only diagnostic surface a television has.

**The exhaustiveness guarantee held, and did the work.** Adding the member to
`DomainError` broke the build in exactly the places it should:
`apps/server/src/translate.ts` and its test both hold a
`Record<DomainError, ErrorCode>`, and `apps/phone/src/screen.ts` holds a
`Record<ErrorCode, string>`. The compiler reported
`TS2741: Property '"table-unavailable"' is missing … but required in type
'Record<DomainError, ErrorCode>'` before any of them were touched.

**Covering tests:**

- `packages/core/src/table-registry.test.ts`, `TableRegistry code exhaustion`:
  refuses with `table-unavailable` rather than looping; refuses by returning
  across a thousand further calls rather than throwing; and still reopens an
  existing table once the space is crowded.
- `apps/server/src/session.test.ts`: the screen is told
  `table-unavailable`, the `helloTable` handling does not throw, and the
  screen receives **only** that error — no `tableReady`, no `tableState`.

**One finding worth recording.** The first version of the session test filled
the registry by calling `openTable` until it refused, then asserted the next
call would refuse too. It did not. Refusal is a bound on *effort*, not proof
that the space is full: the registry gives up after 100 redraws, which at
25 123 of 27 000 codes taken happens roughly once in fourteen hundred calls
purely by luck, and the very next call succeeds. Measured directly — first
refusal at iteration 25 123, next call returned table `AVZN`. The session test
now drives a `FullRegistry` subclass whose `openTable` always refuses, which is
deterministic and tests the thing actually under test: what the session does
with a refusal. The registry's own tests cover reaching the state for real, and
the comment on the helper now states the "bound on effort" property explicitly,
because it is a genuinely surprising thing about this code.

## 3. `M8_TV_BUDGET_BYTES`

**Done.** The environment path is removed from `scripts/check-tv-size.mjs`; the
second CLI argument stays, so the test can still drive the rejection path. The
comment now explains the asymmetry: a CLI argument is written at the call site
and visible in the command that ran, an environment variable is invisible there.

**Covering test:** `scripts/check-tv-size.test.ts`, `cannot be loosened by an
environment variable`. It builds a fixture larger than the real budget, runs
the guard as a subprocess with `M8_TV_BUDGET_BYTES=999999999` and *no* CLI
override, and asserts a non-zero exit, an `over budget` message, and that
`999999999` never appears in the output.

**Evidence:** the test failed (`expected +0 not to be +0` — the guard exited
zero) against the old script and passes against the new one.

Sub-finding: the fixture needs bytes that gzip badly, and the first generator I
wrote — a textbook LCG — overflows JavaScript's safe integer range, degenerates
into a short cycle and compresses to nothing, so the fixture came in under
budget and the test passed for the wrong reason. It now uses xorshift32 kept in
32-bit arithmetic throughout: 60 000 characters, 45 220 B gzipped against an
18 900 B budget. The reason is written into the test.

## 4. Design document contradicted `compose.yaml`

**Done.** §4.23 of `docs/superpowers/specs/2026-08-20-m8-platform-design.md`
mandated a named `node_modules` volume. The code is right and the document was
stale, so the document changed. It now states the absence as a decision with
its reasoning — Docker auto-populates a named volume from the image on first
creation and never refreshes it, so a later dependency change would be masked
by that stale copy, silently, in the one artefact that is meant to be
production-equivalent — and names the condition that reverses it: the moment a
source bind mount exists, and not before.

## 5. The phone's duplicated nickname limit

**Done, as suggested.** `@m8/protocol` publishes `NICKNAME_MAX_LENGTH`;
`apps/phone/src/App.tsx` reads it; `packages/core` keeps its own constant,
which is the one that truncates. Both are commented to point at each other and
at the test.

I considered and rejected the alternatives. Having the phone import `@m8/core`
pulls the domain into a browser bundle. Having core import `@m8/protocol`
reverses a deliberate ruling. A third package for shared constants is a package
for one number. The suggested resolution is the right one.

**Covering test:** `apps/server/src/limits.test.ts` — the server is the
translator and the one place that legitimately sees both packages. It asserts
the two are equal, plus a guard-the-guard assertion that the limit is greater
than zero, since two `undefined`s would satisfy the equality and break every
nickname.

**Evidence:** with the wire copy temporarily set to 17, the test fails with
`expected 17 to be 16`.

## 6. The Tailwind `slate` token

**Done.** Renamed to `ash` — chosen because it is not a Tailwind palette name
and sits with the existing register of `felt`, `chalk`, `brass`, `clay`. Three
files: `packages/tokens/tokens.css` (`--m8-slate` → `--m8-ash`),
`apps/tv/tailwind.config.js`, and both uses in `apps/tv/src/render.ts`
(`text-slate` → `text-ash`). No other use existed anywhere, phone included.

**Covering test:** `scripts/tv-tailwind-colors.test.ts` imports the actual
config and Tailwind's own `colors` module and fails on any token that shadows a
built-in palette — not just `slate`. A new `apps/tv/tailwind.config.d.ts`
declares the config's shape so it can be imported and asserted on rather than
trusted, the same pattern as the existing `scripts/check-tv-syntax.d.mts`.

**Evidence:** `× does not shadow a built-in Tailwind palette with slate` before
the rename; six passing cases after.

## 7. `FakeTransport.receive` on a closed connection

**Done.** `receive` now throws `Connection is closed and cannot receive: <id>`
once the entry is closed, whether it was closed by `disconnect` or by the
platform calling `close()`. The comment states the reason: Socket.IO stops
delivering the moment a socket disconnects, so this is not a state production
code can meet, and a fake that allows it is a fake the platform can tell apart
from the real thing.

**Covering tests:** two in `packages/transport/src/fake.test.ts` — one for each
way of closing — each asserting both the throw and that the message handler was
never called.

## 8. Unconditional `Fastify({ logger: true })`

**Done.** `AppOptions` gains `logger?: boolean`, defaulting to on; the two
existing `buildApp` calls in the test suite pass `logger: false`.

**Covering tests:** `buildApp logging` in `apps/server/src/app.test.ts`. A real
pino instance reports `log.level === 'info'`; Fastify's no-op logger has no
level. The silenced case also asserts `typeof app.log.info === 'function'`,
because `buildApp` calls `app.log.info` itself from the Socket.IO negotiation
callback — silencing must not mean removing.

## 9. `npx` without `--no`, and SIGTERM as PID 1

**Done, both with one change.** `CMD ["node", "--import", "tsx",
"apps/server/src/main.ts"]`.

`--no` would have fixed the first half only. The second half is that `npx` runs
the server as its *child*, and `docker stop` signals PID 1 alone: the SIGTERM
handler in `main.ts` would never have fired, and every stop would have waited
out the ten-second timeout before the kill. Started this way the server is
PID 1 itself, which the container logs confirm (`"pid":1`).

**Evidence:** `docker stop` took **0.27 s** and the container exited **0**.
`docker compose down` took 0.75 s including network teardown.

## 10. Dev dependencies in the runtime image

**Done, and it did not cascade far.** Three changes:

- `tsx` moves from `devDependencies` to `dependencies` in `apps/server`. This
  is the point the brief flagged, and it is not a workaround: the server runs
  TypeScript source, so its loader is part of how the server runs, not part of
  how it is developed.
- A new `prod-deps` stage runs `npm ci --omit=dev` from the same manifest
  layer. Its own stage rather than a prune in place, because `npm ci` wipes
  `node_modules` first — that is what removes the *nested* installs, such as
  the second copy of Tailwind under `apps/phone/node_modules`, which a
  top-level prune leaves untouched.
- The runtime stage copies file by file instead of whole directories, so
  neither a development `node_modules` nor the large screen's and phone's
  TypeScript sources ride along. The server ships its source; the two browser
  apps ship only their `dist`, which is all that is ever served. Each manifest
  comes too, so the workspace links under `node_modules` point at something.

**Evidence,** probing the built image directly: `vite`, `typescript`,
`tailwindcss`, `vitest`, `concurrently` and `acorn` are all absent; `tsx`,
`fastify`, `qrcode` and `socket.io` are present; `find /app/apps /app/packages
-name node_modules` returns nothing. 350 MB → 222 MB.

**What I deliberately left.** `esbuild` is still there, now as `tsx`'s own
dependency — that is a genuine runtime dependency, not a leftover. `react` and
`socket.io-client` survive because the phone and the large screen declare them
as production dependencies, which they are; both are already inside the built
bundles and neither is loaded by the server. Removing them would mean
reclassifying a browser app's real dependencies to flatter the server's image,
which is a worse lie than a few unused megabytes. The reasoning is written into
the Dockerfile.

## 11. Unused `esbuild` in `apps/server`

**Done.** Removed from `devDependencies`; `package-lock.json` regenerated. The
lock diff shows the esbuild platform binaries losing their `"dev": true` flag,
which is the visible consequence of `tsx` becoming a production dependency —
the same packages, arriving by a different and honest route.

## 12. ES2017 syntax but ES2022 libraries

**Done, and it surfaced no errors in the app itself.**

`apps/tv/tsconfig.json` is new: `target: ES2017`, `lib: ["ES2017", "DOM",
"DOM.Iterable"]`, `types: []`, including `src/**/*.ts` only, with `paths` for
`@m8/avatars` and `@m8/protocol` so the two packages the screen actually
bundles are checked under the same libraries. The root `tsconfig.json` excludes
`apps/tv/src` — restating the default exclusions, since naming the key replaces
them — and `npm run typecheck` is now `tsc --noEmit && tsc -p apps/tv`. The
large screen is checked exactly once, under the narrower libraries.

**The existing code was clean.** No suppressions were needed anywhere; both
projects typecheck with zero errors.

**Evidence that the narrowing bites,** probing five APIs in `apps/tv/src`:

| API | Root program (ES2022 lib) | TV project (ES2017 lib) |
|---|---|---|
| `Object.fromEntries` | silent | `TS2550` |
| `Array.prototype.flat` | silent | `TS2550` |
| `String.prototype.matchAll` | silent | `TS2550` |
| `String.prototype.replaceAll` | silent | `TS2550` |
| `Array.prototype.at` | silent | `TS2550` |

**Two gaps that remain, both recorded in the new file's comment.**
`globalThis` is *not* caught — TypeScript supplies it regardless of `lib`, and
it stayed silent under both configurations. And `lib.dom.d.ts` has no version
axis, so a DOM API newer than Chromium 68 is still invisible to the compiler.
The bundle that exists today uses neither, but the guarantee is "ECMAScript
builtins", not "everything a 2020 television lacks", and it should not be
described more widely than that.

**This item cascaded once, into the container.** Vite's bundler reads
`apps/tv/tsconfig.json` and resolves its `extends`, and the image never copied
`tsconfig.base.json`, so the TV build began failing inside the container —
`Tsconfig not found /app/tsconfig.base.json` — while passing on the host. Found
by building the image, fixed by copying the file into the build stage (commit
`e757757`). Worth noting how it was caught: nothing in the test suite or either
guard would have found it. Only the CI Docker job, or building the image by
hand, will.

## Verification actually run

- `npm run typecheck` — clean, both projects.
- `npm test` — 294 passed, 25 files, 0 failed.
- `npm run guards` — build, then `ES2017 syntax check passed for 1 file(s)`,
  then `Total: 15995 B gzipped. Budget: 18900 B.`
- `docker build` — image built, 222 MB.
- `docker compose up --build -d` — served, on real requests:
  `/` 200 with the TV `<title>M8</title>`; the hashed JS and CSS assets 200;
  `/KXTP` 200 serving the phone index; `/qr/kxtp.svg` 200 `image/svg+xml`
  (lowercase code normalised); `/socket.io/?EIO=4&transport=polling` 200 with a
  real handshake; `/nope` 404.
- `docker stop` — 0.27 s, exit code 0.

At the time of writing: nothing pushed, `git status` clean.

---

# Review follow-up — seven findings

Second pass, after review of the batch above. Same rules: nothing pushed at the
time of writing.

State after this pass: **329 tests in 28 files**, typecheck clean across all
three projects, both large-screen guards green, bundle unchanged at
**15 995 B gzipped** against an 18 900 B budget, image 222 MB, container built
and served.

## 1. `apps/tv/tsconfig.json` claimed a guarantee it does not provide

**The finding is correct and it was the worst thing in the batch.** The comment
listed `globalThis` among the APIs `lib` closes, and confined the "does not
cover" paragraph to the DOM. `globalThis` arrived in Chrome 71; the declared
floor is Chromium 68. The file written to close a class of gap asserted it had
closed an instance it had not.

**Reproduced independently** rather than taken on trust, with the repository's
own compiler and a scratch file outside the project:

```
tsc --ignoreConfig --noEmit --target ES2017 --lib ES2017,DOM,DOM.Iterable --strict probe.ts
```

- `export const a = globalThis`, `export type G = typeof globalThis`, and
  `globalThis` in a cast: **silent**, as a value and as a type.
- Control, same flags, `Object.fromEntries`: `TS2550`.

**Changed.** `globalThis` is out of the closed list. The file now carries an
explicit "what this does not cover, and what no automated check in this
repository covers" section naming `globalThis` first, with the Chrome 71
against Chromium 68 arithmetic, the fact that it is silent here exactly as it
is under the root configuration, and the plain sentence that nothing catches it
— review does. DOM APIs follow it. The list of what `lib` *does* close now
names only the five verified against it.

## 2. Nothing pinned `tsc -p apps/tv`

**Correct, and the consequence was worse than the state before the split.**
With `apps/tv/src` excluded from the root program, deleting `&& tsc -p apps/tv`
leaves the large screen typechecked by nothing: `vite build` does not
typecheck, and neither does vitest.

**New:** `scripts/typecheck-projects.ts` (pure) and
`scripts/typecheck-projects.test.ts`, following the `scripts/node-version.ts`
precedent — parsing separated from disk, then the real files asserted to agree.
`projectsIn` reads `tsc -p` and `tsc --project` out of a command;
`runsRootProgram` distinguishes a bare `tsc`; `newestEcmaScriptLib` reduces a
`lib` list to a year, handling `ESNext` as infinity and `ES6` as 2015.

Rather than pinning the TV alone, the real-file assertions generalise: every
app that has its own `tsconfig.json` is discovered on disk, and each must be
both **run by the typecheck script** and **excluded from the root program**.
Item 7's new phone project was picked up by it without a line being added.

**Evidence,** each restored afterwards:

- `typecheck` set to `tsc --noEmit && tsc -p apps/phone` gives
  `× runs apps/tv from the typecheck script`.
- `apps/tv` `lib` widened to `ES2022` gives
  `× names no ECMAScript library newer than ES2017`,
  `AssertionError: expected 2022 to be 2017`.

**A dependency I had to write rather than borrow.** These files are JSONC —
they carry the comments that explain them — so the test cannot use
`JSON.parse`. TypeScript used to expose `parseConfigFileTextToJson` for exactly
this, but the native compiler in this repository (7.0.2) publishes only
`version` and `versionMajorMinor` from its JavaScript package; there is no
parser to borrow. So `scripts/jsonc.ts` is a hand-written comment stripper,
about twenty lines, in the spirit of the hand-written wire validator, with its
own tests covering the cases that make it worth writing: a double slash inside
a string value, a block-comment opener inside a string value, and an escaped
quote not ending a string. Trailing commas are deliberately *not* handled, and
the file says so — none of the files it reads use them, and quietly accepting
more than is tested is how a parser starts lying.

## 3. Nothing proved the container starts

**Correct, and the exposure is real.** Nothing in `apps/server/src` imports
`tsx`, so moving it back to `devDependencies` reads as a correct tidy-up.

**Measured, by actually doing it.** With `tsx` in `devDependencies` and the
lock regenerated:

- `npm run typecheck` — clean.
- `npm test` — **329 passed**.
- `docker build` — succeeded.
- The container — died at start:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'tsx' imported from /app/`.

Every gate green, artifact dead.

**New CI step,** in the `docker` job after the build: run the image, poll `/`
for up to thirty seconds, print the container's logs and fail if it never
serves, and `grep` the body for the large screen's own title — asserting the
screen was built into the image and is being served, not merely that something
answered the port.

**Evidence.** The step's logic was run locally against both images. Against the
`devDependencies` build: never served, logs showing `Cannot find package
'tsx'`. Against the real image: served, 200, title present, and `/KXTP` plus
the phone's own bundle both 200.

**`tsx` was restored to `dependencies`,** and `apps/server/package.json` and
`package-lock.json` are byte-identical to before the experiment — verified with
`git diff`, which reports nothing for either.

## 4. The manifest guard was blind to the next workspace

**Correct on both counts.** It walked a hardcoded `['packages', 'apps']` while
`package.json` declares `packages/games/*`, which is where the design puts the
first game — so the first game workspace would have reopened the very gap the
guard closes. And `toBeGreaterThanOrEqual(7)` against eight workspaces passes
after losing one, which is the entire failure mode.

**Changed.** `scripts/workspaces.ts` derives the list from the declared
`workspaces` patterns: `expandWorkspacePatterns` handles a literal path and a
`parent/*`, and contributes nothing for a parent that does not exist yet,
because `packages/games/*` is declared before any game exists.

The guard-the-guard is no longer a threshold. `lockfileWorkspacePaths` reads
every workspace directory npm itself recorded in `package-lock.json` — a second
source maintained by a different tool, in the repository, needing no
`node_modules` — and the derived list must **equal** it. One workspace going
missing on either side now fails.

**Evidence.** A real `packages/games/tic-tac-toe` workspace was created and
`npm install --package-lock-only` run, so both sources knew about it. Result:
the guard-the-guard passed (the two lists agreed) and exactly one case failed —
`× copies the manifest of packages/games/tic-tac-toe before npm ci`. That is
the failure the old guard could not produce. The workspace and the lockfile
were then removed and restored.

## 5. The README stated two false numbers

**Corrected:** 260 to **329** tests, 15,941 to **15,995** bytes. The sentence
about the image was also updated, since it claimed CI checks the clone-and-run
promise by building — which, as finding 3 established, it did not. It now says
the image is built, started, and requested against.

## 6. The note contradicted itself

**Corrected.** The header now says the note describes the working tree at the
moment of writing and not at the moment of reading, states that the branch is
expected to be pushed once review closes, and gives the reason plainly: a note
whose subject is claims that stopped being true should not add one. The closing
line of the first pass reads "At the time of writing: nothing pushed,
`git status` clean."

## 7. The phone had the TV's host-versus-container divergence

**Correct, and it was not theoretical — it was measurable.** Vite's transform
reads the nearest `tsconfig.json`. The phone had none, so it found the
repository root configuration on a development machine and nothing at all
inside the container, which copies workspace sources but not the root program.

**Evidence, before the fix.** An image built with `apps/phone/tsconfig.json`
temporarily removed produced `apps/phone/dist/assets/index-BSxAXPRy.js`, while
the same commit on the host produced `index-UOnEOO25.js`. Different content
hash, same source: the phone bundle in the production-equivalent artifact was
not the phone bundle anyone had tested. In the same image the *TV* bundle was
`index-DE5f1P8v.js`, identical to the host's, because the TV already had its
own project — the contrast is the finding in one line.

**After the fix,** the container serves `/phone/assets/index-UOnEOO25.js`,
matching the host.

**Changed.** `apps/phone/tsconfig.json` extends the same base, is excluded from
the root program, and is run by `npm run typecheck` like the TV's. Its `lib` is
deliberately *not* narrowed — the phone runs on a phone browser somebody is
holding, not a television from 2020 — and the file says so, so the next reader
does not take the TV's constraint for a house style. No Dockerfile change was
needed: `tsconfig.base.json` already travels with the image from the earlier
fix, and `COPY apps ./apps` brings the new file.

The class rather than the instance: the arrangement test from finding 2
discovers app projects from disk, so a third one will be held to the same two
rules without an edit.

## Carried, by agreement

The remaining Minor findings stay open and unaddressed: the gzip-coincidence
sentence in this note, the `tailwindcss/colors` hoisting assumption, the
duplicated TV aliases between `vite.config.ts` and `tsconfig.json`, the
manifest test's name promising ordering it does not check, test files shipping
in the runtime image, and the absence of a shadowing guard for the phone's
Tailwind v4 theme.

## Verification run for this pass

- `npm run typecheck` — clean; `tsc --noEmit && tsc -p apps/tv && tsc -p apps/phone`.
- `npm test` — **329 passed, 28 files, 0 failed** (was 294 in 25).
- `npm run guards` — `ES2017 syntax check passed for 1 file(s).`,
  `Total: 15995 B gzipped. Budget: 18900 B.` Unmoved.
- `docker build` — 222 MB, unchanged.
- Container started and requested against: `/` 200 with the large screen's
  title, `/KXTP` 200, `/phone/assets/index-UOnEOO25.js` 200.
- Probe images (`m8:tsxprobe`, `m8:nophonetsconfig`) and their containers
  removed.

All seven addressed. Nothing carried out of this pass except the Minor findings
listed above as agreed.
