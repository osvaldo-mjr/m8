# M8 Milestone 1, Plan 1 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A large screen opens a table on the LAN and shows its code and QR; a phone scans it, picks a nickname and avatar, and appears on the large screen — all through the real server, verified on an actual Samsung or LG television.

**Architecture:** An npm-workspaces monorepo. `packages/core` holds the domain with zero I/O and is driven in tests by a fake transport. `packages/protocol` holds wire types with no runtime cost for the browser. `packages/transport` defines the `Transport` interface with a Socket.IO implementation and an in-memory fake. `apps/server` is wiring only. `apps/tv` is vanilla TypeScript compiled to ES2017; `apps/phone` is React. No game exists yet.

**Tech Stack:** Node 26, TypeScript, Vitest, Fastify, Socket.IO, Vite, Tailwind v3 (TV) and v4 (phone), React, Docker, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-20-m8-platform-design.md`

## Why this plan stops where it stops

The spec names its largest risk explicitly: the design is calibrated for Chromium 68-79 from documentation, not from experiment, and the mitigation is **to open it on the real television in the first week, before any game exists**. This plan is that experiment, made useful — it delivers the smallest thing that exercises the whole chain (server, transport, two screen roles, LAN, QR, Docker, CI) and proves the TV can run it.

Planning the seat and game work in detail before that experiment would be planning on assumptions. Plans 2-4 are outlined at the end and get written as we reach them.

## Global Constraints

Copied verbatim from the spec; every task inherits them.

- **Repository language is English** — code, identifiers, comments, commit messages, docs. No exceptions.
- **Claude is never named in anything git records** — no co-author trailer, no mention in commit messages, branch names or tags.
- **`packages/core` performs no I/O** — no Fastify, no Socket.IO, no timers, no clock reads. Time and randomness arrive as inputs.
- **The TV bundle compiles to ES2017** — no optional chaining (`?.`), no nullish coalescing (`??`) in emitted output. CI parses the output to enforce this.
- **No flexbox `gap` in `apps/tv`** (Chromium 84+). No CSS newer than Chromium 68 supports.
- **Tailwind v4 must never appear in `apps/tv`** — it requires Chrome 111+. `apps/tv` uses v3; `apps/phone` uses v4.
- **The TV has exactly one outbound message** (`helloTable`) and no interactive elements — no hover, no focus, no click handlers.
- **The server sends full state, never diffs.**
- **Design tokens live in one place** as CSS custom properties, consumed by both Tailwind configurations.
- **5% safe margins on the large screen** (overscan). Readable at 3 metres.
- **All platform code talks to the `Transport` interface**, never to Socket.IO directly.
- **Table codes are 4 characters** from the alphabet `ABCDEFGHJKMNPQRSTVWXYZ23456789` (no `I`, `L`, `O`, `U`, `0`, `1`). The first character is the routing shard.
- **`git config --global` is never touched.** This repository is configured with `--local` only.

---

### Task 1: Monorepo scaffolding and the deterministic RNG

The RNG comes first because everything downstream that needs randomness — table codes now, seat assignment later — must be reproducible, and the spec requires randomness to enter as an input rather than being read from the environment.

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `tsconfig.json`
- Create: `.nvmrc`
- Create: `vitest.config.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/rng.ts`
- Test: `packages/core/src/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Rng` (`{ readonly seed: number; readonly cursor: number }`), `createRng(seed: number): Rng`, `rngInt(rng: Rng, maxExclusive: number): readonly [number, Rng]`, `rngShuffle<T>(rng: Rng, items: readonly T[]): readonly [T[], Rng]`. All exported from `@m8/core`.

- [ ] **Step 1: Create the workspace root**

`package.json`:

```json
{
  "name": "m8",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=26 <27"
  },
  "workspaces": [
    "packages/*",
    "packages/games/*",
    "apps/*"
  ],
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

`.nvmrc`:

```
26
```

- [ ] **Step 2: Install the toolchain**

Do not hand-write version ranges; let npm record what is current in the lockfile.

Run:

```bash
npm install -D typescript vitest @types/node
```

- [ ] **Step 3: Create the TypeScript configuration**

`tsconfig.base.json` — the settings every package shares:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`tsconfig.json` — the root project used by `npm run typecheck`, carrying the workspace aliases:

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@m8/core": ["packages/core/src/index.ts"],
      "@m8/protocol": ["packages/protocol/src/index.ts"],
      "@m8/transport": ["packages/transport/src/index.ts"]
    }
  },
  "include": ["packages/**/*.ts", "apps/**/*.ts", "apps/**/*.tsx", "*.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@m8/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
      '@m8/protocol': fileURLToPath(new URL('./packages/protocol/src/index.ts', import.meta.url)),
      '@m8/transport': fileURLToPath(new URL('./packages/transport/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create the core package manifest**

`packages/core/package.json`:

```json
{
  "name": "@m8/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 5: Write the failing test**

`packages/core/src/rng.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRng, rngInt, rngShuffle } from './rng.js'

describe('rngInt', () => {
  it('returns a value inside the requested range', () => {
    let rng = createRng(1)
    for (let i = 0; i < 200; i += 1) {
      const [value, next] = rngInt(rng, 6)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(6)
      rng = next
    }
  })

  it('produces the same sequence for the same seed', () => {
    const take = (seed: number): number[] => {
      let rng = createRng(seed)
      const out: number[] = []
      for (let i = 0; i < 10; i += 1) {
        const [value, next] = rngInt(rng, 100)
        out.push(value)
        rng = next
      }
      return out
    }

    expect(take(42)).toEqual(take(42))
  })

  it('produces different sequences for different seeds', () => {
    const [a] = rngInt(createRng(1), 1_000_000)
    const [b] = rngInt(createRng(2), 1_000_000)
    expect(a).not.toEqual(b)
  })

  it('advances the cursor without changing the seed', () => {
    const rng = createRng(7)
    const [, next] = rngInt(rng, 10)
    expect(next.seed).toBe(7)
    expect(next.cursor).toBe(rng.cursor + 1)
  })
})

describe('rngShuffle', () => {
  it('returns a permutation of the input', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    const [shuffled] = rngShuffle(createRng(3), items)
    expect([...shuffled].sort()).toEqual([...items].sort())
  })

  it('does not mutate the input', () => {
    const items = ['a', 'b', 'c']
    rngShuffle(createRng(3), items)
    expect(items).toEqual(['a', 'b', 'c'])
  })

  it('is deterministic for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f']
    const [first] = rngShuffle(createRng(9), items)
    const [second] = rngShuffle(createRng(9), items)
    expect(first).toEqual(second)
  })
})
```

- [ ] **Step 6: Run the test and confirm it fails**

Run: `npx vitest run packages/core/src/rng.test.ts`

Expected: FAIL — `Failed to resolve import "./rng.js"`.

- [ ] **Step 7: Write the implementation**

`packages/core/src/rng.ts`:

```ts
/**
 * A seeded, serializable pseudo-random source.
 *
 * The value is plain data so it can live inside match state and travel with it.
 * Every draw returns the next Rng rather than mutating, which is what makes a
 * match reproducible from its seed and its sequence of actions.
 */
export interface Rng {
  readonly seed: number
  readonly cursor: number
}

export function createRng(seed: number): Rng {
  return { seed: seed >>> 0, cursor: 0 }
}

/** mulberry32, keyed on seed and cursor so any draw is addressable. */
function sample(rng: Rng): number {
  let t = (rng.seed + rng.cursor * 0x6d2b79f5) >>> 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
}

function advance(rng: Rng): Rng {
  return { seed: rng.seed, cursor: rng.cursor + 1 }
}

export function rngInt(rng: Rng, maxExclusive: number): readonly [number, Rng] {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
    throw new RangeError(`maxExclusive must be a positive integer, got ${maxExclusive}`)
  }
  return [Math.floor(sample(rng) * maxExclusive), advance(rng)]
}

export function rngShuffle<T>(rng: Rng, items: readonly T[]): readonly [T[], Rng] {
  const out = [...items]
  let current = rng
  for (let i = out.length - 1; i > 0; i -= 1) {
    const [j, next] = rngInt(current, i + 1)
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
    current = next
  }
  return [out, current]
}
```

`packages/core/src/index.ts`:

```ts
export { createRng, rngInt, rngShuffle } from './rng.js'
export type { Rng } from './rng.js'
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 7 tests.

- [ ] **Step 9: Confirm typechecking passes**

Run: `npm run typecheck`

Expected: no output, exit code 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.base.json vitest.config.ts .nvmrc packages/core
git commit -m "Add workspace scaffolding and seeded RNG

Randomness enters the domain as a serializable value so a match can be
reproduced from its seed and its sequence of actions."
```

---

### Task 2: Table code generation and normalization

**Files:**
- Create: `packages/core/src/table-code.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/table-code.test.ts`

**Interfaces:**
- Consumes: `Rng`, `rngInt` from Task 1.
- Produces: `CODE_ALPHABET: string`, `CODE_LENGTH: 4`, `generateTableCode(rng: Rng, shard: string): readonly [string, Rng]`, `normalizeTableCode(input: string): string | null`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/table-code.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRng } from './rng.js'
import { CODE_ALPHABET, CODE_LENGTH, generateTableCode, normalizeTableCode } from './table-code.js'

describe('CODE_ALPHABET', () => {
  it('excludes every visually ambiguous character', () => {
    for (const char of ['I', 'L', 'O', 'U', '0', '1']) {
      expect(CODE_ALPHABET).not.toContain(char)
    }
  })

  it('has no duplicates', () => {
    expect(new Set(CODE_ALPHABET).size).toBe(CODE_ALPHABET.length)
  })
})

describe('generateTableCode', () => {
  it('produces a code of the declared length', () => {
    const [code] = generateTableCode(createRng(1), 'A')
    expect(code).toHaveLength(CODE_LENGTH)
  })

  it('places the shard character first', () => {
    const [code] = generateTableCode(createRng(1), 'K')
    expect(code.charAt(0)).toBe('K')
  })

  it('uses only alphabet characters', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const [code] = generateTableCode(createRng(seed), 'A')
      for (const char of code) {
        expect(CODE_ALPHABET).toContain(char)
      }
    }
  })

  it('is deterministic for the same seed', () => {
    const [first] = generateTableCode(createRng(11), 'A')
    const [second] = generateTableCode(createRng(11), 'A')
    expect(first).toBe(second)
  })

  it('rejects a shard character outside the alphabet', () => {
    expect(() => generateTableCode(createRng(1), 'O')).toThrow(/shard/i)
  })
})

describe('normalizeTableCode', () => {
  it('uppercases valid input', () => {
    expect(normalizeTableCode('kxtp')).toBe('KXTP')
  })

  it('strips surrounding whitespace', () => {
    expect(normalizeTableCode('  KXTP \n')).toBe('KXTP')
  })

  it('rejects the wrong length', () => {
    expect(normalizeTableCode('KXT')).toBeNull()
    expect(normalizeTableCode('KXTPQ')).toBeNull()
  })

  it('rejects ambiguous characters rather than guessing', () => {
    expect(normalizeTableCode('KXTO')).toBeNull()
    expect(normalizeTableCode('KXT0')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(normalizeTableCode('')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run packages/core/src/table-code.test.ts`

Expected: FAIL — `Failed to resolve import "./table-code.js"`.

- [ ] **Step 3: Write the implementation**

`packages/core/src/table-code.ts`:

```ts
import { rngInt, type Rng } from './rng.js'

/**
 * Thirty symbols with no visually ambiguous pairs: no I/L/1, no O/0, no U.
 * A player reads this off a television from three metres away and types it on a
 * phone, so a character that can be misread is a character that cannot be used.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

export const CODE_LENGTH = 4

/**
 * The first character identifies the instance that owns the table, so routing
 * can be a pure function of the code the player scanned. With a single
 * instance it is constant and nobody notices.
 */
export function generateTableCode(rng: Rng, shard: string): readonly [string, Rng] {
  if (shard.length !== 1 || !CODE_ALPHABET.includes(shard)) {
    throw new RangeError(`shard must be a single character from CODE_ALPHABET, got ${shard}`)
  }

  let current = rng
  let code = shard
  for (let i = 1; i < CODE_LENGTH; i += 1) {
    const [index, next] = rngInt(current, CODE_ALPHABET.length)
    code += CODE_ALPHABET.charAt(index)
    current = next
  }
  return [code, current]
}

/** Returns the canonical code, or null when the input cannot be one. */
export function normalizeTableCode(input: string): string | null {
  const candidate = input.trim().toUpperCase()
  if (candidate.length !== CODE_LENGTH) return null
  for (const char of candidate) {
    if (!CODE_ALPHABET.includes(char)) return null
  }
  return candidate
}
```

Add to `packages/core/src/index.ts`:

```ts
export { CODE_ALPHABET, CODE_LENGTH, generateTableCode, normalizeTableCode } from './table-code.js'
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "Add table code generation and normalization

Codes avoid visually ambiguous characters because players read them off a
television and type them on a phone. The first character is the routing
shard, constant while a single instance runs."
```

---

### Task 3: The wire protocol

The protocol package carries **types only** for anything the browser imports, so it costs the TV bundle nothing. The runtime validator lives in a separate entry point that only the server imports.

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/src/index.ts`
- Create: `packages/protocol/src/messages.ts`
- Create: `packages/protocol/src/validate.ts`
- Test: `packages/protocol/src/validate.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PROTOCOL_VERSION: number`; types `ClientToServer`, `ScreenToServer`, `ServerToClient`, `TableSnapshot`, `ParticipantSnapshot`, `ErrorCode`; and `parseInbound(raw: unknown): ClientToServer | ScreenToServer | null` from `@m8/protocol/validate`.

- [ ] **Step 1: Create the package manifest**

`packages/protocol/package.json`:

```json
{
  "name": "@m8/protocol",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./validate": "./src/validate.ts"
  }
}
```

- [ ] **Step 2: Write the message types**

`packages/protocol/src/messages.ts`:

```ts
/**
 * Bumped whenever the shape on the wire changes. A client whose version does
 * not match is told to reload, which turns "the server was updated while a
 * phone held a stale page" from a phantom bug into a clear message.
 */
export const PROTOCOL_VERSION = 1

export type ErrorCode =
  | 'unknown-table'
  | 'table-full'
  | 'invalid-code'
  | 'invalid-message'
  | 'not-allowed'

export interface ParticipantSnapshot {
  readonly id: string
  readonly nickname: string
  readonly avatarId: string
  readonly connected: boolean
  readonly hasBaton: boolean
}

/**
 * The complete table state. The server never sends diffs, so reconnecting is
 * receiving one of these like any other message.
 */
export interface TableSnapshot {
  readonly code: string
  readonly phase: 'awaiting-host' | 'choosing-game'
  readonly participants: readonly ParticipantSnapshot[]
}

export type ScreenToServer = {
  readonly type: 'helloTable'
  readonly protocolVersion: number
  /** A code stored locally by the screen, so a refresh rejoins the same table. */
  readonly code?: string
}

export type ClientToServer =
  | {
      readonly type: 'hello'
      readonly protocolVersion: number
      readonly code: string
      /** Persisted on the device; this is what makes "the same phone" answerable. */
      readonly token?: string
    }
  | {
      readonly type: 'setProfile'
      readonly nickname: string
      readonly avatarId: string
    }
  | { readonly type: 'leave' }

export type ServerToClient =
  | { readonly type: 'welcome'; readonly participantId: string; readonly token: string }
  | { readonly type: 'tableReady'; readonly code: string }
  | { readonly type: 'tableState'; readonly table: TableSnapshot }
  | { readonly type: 'error'; readonly code: ErrorCode }
  | { readonly type: 'reload'; readonly reason: 'protocol-version' }
```

`packages/protocol/src/index.ts`:

```ts
export { PROTOCOL_VERSION } from './messages.js'
export type {
  ClientToServer,
  ErrorCode,
  ParticipantSnapshot,
  ScreenToServer,
  ServerToClient,
  TableSnapshot,
} from './messages.js'
```

- [ ] **Step 3: Write the failing validator test**

`packages/protocol/src/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from './messages.js'
import { parseInbound } from './validate.js'

describe('parseInbound', () => {
  it('accepts a well-formed hello', () => {
    const message = { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'KXTP' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts hello with a token', () => {
    const message = {
      type: 'hello',
      protocolVersion: PROTOCOL_VERSION,
      code: 'KXTP',
      token: 'abc',
    }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts helloTable without a code', () => {
    const message = { type: 'helloTable', protocolVersion: PROTOCOL_VERSION }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts a well-formed setProfile', () => {
    const message = { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' }
    expect(parseInbound(message)).toEqual(message)
  })

  it('accepts leave', () => {
    expect(parseInbound({ type: 'leave' })).toEqual({ type: 'leave' })
  })

  it('rejects a message with no type', () => {
    expect(parseInbound({ code: 'KXTP' })).toBeNull()
  })

  it('rejects an unknown type', () => {
    expect(parseInbound({ type: 'launchMissiles' })).toBeNull()
  })

  it('rejects hello with a non-string code', () => {
    expect(parseInbound({ type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 42 })).toBeNull()
  })

  it('rejects setProfile with a missing field', () => {
    expect(parseInbound({ type: 'setProfile', nickname: 'Ana' })).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(parseInbound(null)).toBeNull()
    expect(parseInbound('hello')).toBeNull()
    expect(parseInbound(7)).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx vitest run packages/protocol/src/validate.test.ts`

Expected: FAIL — `Failed to resolve import "./validate.js"`.

- [ ] **Step 5: Write the validator**

`packages/protocol/src/validate.ts`:

```ts
import type { ClientToServer, ScreenToServer } from './messages.js'

type Inbound = ClientToServer | ScreenToServer

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Hand-written on purpose: this file is imported by the server only, so no
 * validation library reaches the TV bundle, where every kilobyte is budgeted.
 * Returns null for anything that is not a message we recognize; the caller
 * answers with an `invalid-message` error.
 */
export function parseInbound(raw: unknown): Inbound | null {
  if (!isRecord(raw) || !isString(raw['type'])) return null

  switch (raw['type']) {
    case 'helloTable': {
      if (!isNumber(raw['protocolVersion'])) return null
      const code = raw['code']
      if (code !== undefined && !isString(code)) return null
      return code === undefined
        ? { type: 'helloTable', protocolVersion: raw['protocolVersion'] }
        : { type: 'helloTable', protocolVersion: raw['protocolVersion'], code }
    }

    case 'hello': {
      if (!isNumber(raw['protocolVersion']) || !isString(raw['code'])) return null
      const token = raw['token']
      if (token !== undefined && !isString(token)) return null
      return token === undefined
        ? { type: 'hello', protocolVersion: raw['protocolVersion'], code: raw['code'] }
        : { type: 'hello', protocolVersion: raw['protocolVersion'], code: raw['code'], token }
    }

    case 'setProfile': {
      if (!isString(raw['nickname']) || !isString(raw['avatarId'])) return null
      return { type: 'setProfile', nickname: raw['nickname'], avatarId: raw['avatarId'] }
    }

    case 'leave':
      return { type: 'leave' }

    default:
      return null
  }
}
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 28 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/protocol
git commit -m "Add wire protocol types and server-side validator

Types carry no runtime cost, so the TV bundle pays nothing for them. The
validator lives behind a separate entry point that only the server imports."
```

---

### Task 4: The transport boundary and its fake

This is the task that makes the rest of the domain testable without a network. Everything the platform sends or receives goes through here.

**Files:**
- Create: `packages/transport/package.json`
- Create: `packages/transport/src/index.ts`
- Create: `packages/transport/src/transport.ts`
- Create: `packages/transport/src/fake.ts`
- Test: `packages/transport/src/fake.test.ts`

**Interfaces:**
- Consumes: `ServerToClient` from `@m8/protocol`.
- Produces: interfaces `Connection` (`id`, `send`, `close`) and `Transport` (`onConnect`, `onMessage`, `onDisconnect`); class `FakeTransport` with test controls `connect(id): Connection`, `receive(id, raw)`, `disconnect(id)`, `sentTo(id): ServerToClient[]`, `isOpen(id): boolean`.

- [ ] **Step 1: Create the package manifest**

`packages/transport/package.json`:

```json
{
  "name": "@m8/transport",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

- [ ] **Step 2: Define the interface**

`packages/transport/src/transport.ts`:

```ts
import type { ServerToClient } from '@m8/protocol'

/** One connected device. The platform never learns what carries it. */
export interface Connection {
  readonly id: string
  send(message: ServerToClient): void
  close(): void
}

/**
 * The single seam between the platform and the network.
 *
 * Socket.IO implements this in production; FakeTransport implements it in
 * tests, which is what lets the whole table lifecycle — including drops and
 * reconnections — be tested with no ports, no sleeps and no flakiness.
 */
export interface Transport {
  onConnect(handler: (connection: Connection) => void): void
  onMessage(handler: (connection: Connection, raw: unknown) => void): void
  onDisconnect(handler: (connection: Connection) => void): void
}
```

- [ ] **Step 3: Write the failing test**

`packages/transport/src/fake.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { FakeTransport } from './fake.js'

describe('FakeTransport', () => {
  it('notifies the connect handler with the new connection', () => {
    const transport = new FakeTransport()
    const seen: string[] = []
    transport.onConnect((connection) => seen.push(connection.id))

    transport.connect('tv-1')

    expect(seen).toEqual(['tv-1'])
  })

  it('records what was sent to each connection', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')

    connection.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('phone-1')).toEqual([{ type: 'tableReady', code: 'KXTP' }])
  })

  it('keeps each connection inbox separate', () => {
    const transport = new FakeTransport()
    const a = transport.connect('a')
    transport.connect('b')

    a.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('b')).toEqual([])
  })

  it('delivers inbound messages with their connection', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onMessage(handler)
    const connection = transport.connect('phone-1')

    transport.receive('phone-1', { type: 'leave' })

    expect(handler).toHaveBeenCalledWith(connection, { type: 'leave' })
  })

  it('notifies the disconnect handler and marks the connection closed', () => {
    const transport = new FakeTransport()
    const handler = vi.fn()
    transport.onDisconnect(handler)
    transport.connect('phone-1')

    transport.disconnect('phone-1')

    expect(handler).toHaveBeenCalledOnce()
    expect(transport.isOpen('phone-1')).toBe(false)
  })

  it('marks the connection closed when the platform closes it', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')

    connection.close()

    expect(transport.isOpen('phone-1')).toBe(false)
  })

  it('silently drops sends to a closed connection', () => {
    const transport = new FakeTransport()
    const connection = transport.connect('phone-1')
    transport.disconnect('phone-1')

    connection.send({ type: 'tableReady', code: 'KXTP' })

    expect(transport.sentTo('phone-1')).toEqual([])
  })

  it('throws when a test drives an unknown connection', () => {
    const transport = new FakeTransport()
    expect(() => transport.receive('ghost', { type: 'leave' })).toThrow(/ghost/)
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx vitest run packages/transport/src/fake.test.ts`

Expected: FAIL — `Failed to resolve import "./fake.js"`.

- [ ] **Step 5: Write the fake**

`packages/transport/src/fake.ts`:

```ts
import type { ServerToClient } from '@m8/protocol'
import type { Connection, Transport } from './transport.js'

interface Entry {
  readonly connection: Connection
  readonly sent: ServerToClient[]
  open: boolean
}

/**
 * An in-memory Transport with test controls. Nothing here is asynchronous, so
 * a test reads like the scene it describes and finishes in microseconds.
 */
export class FakeTransport implements Transport {
  readonly #entries = new Map<string, Entry>()
  #onConnect: (connection: Connection) => void = () => {}
  #onMessage: (connection: Connection, raw: unknown) => void = () => {}
  #onDisconnect: (connection: Connection) => void = () => {}

  onConnect(handler: (connection: Connection) => void): void {
    this.#onConnect = handler
  }

  onMessage(handler: (connection: Connection, raw: unknown) => void): void {
    this.#onMessage = handler
  }

  onDisconnect(handler: (connection: Connection) => void): void {
    this.#onDisconnect = handler
  }

  // --- test controls -------------------------------------------------------

  connect(id: string): Connection {
    const entry: Entry = {
      connection: {
        id,
        send: (message) => {
          if (entry.open) entry.sent.push(message)
        },
        close: () => {
          entry.open = false
        },
      },
      sent: [],
      open: true,
    }
    this.#entries.set(id, entry)
    this.#onConnect(entry.connection)
    return entry.connection
  }

  receive(id: string, raw: unknown): void {
    this.#onMessage(this.#require(id).connection, raw)
  }

  disconnect(id: string): void {
    const entry = this.#require(id)
    entry.open = false
    this.#onDisconnect(entry.connection)
  }

  sentTo(id: string): readonly ServerToClient[] {
    return this.#require(id).sent
  }

  isOpen(id: string): boolean {
    return this.#require(id).open
  }

  #require(id: string): Entry {
    const entry = this.#entries.get(id)
    if (!entry) throw new Error(`No such connection: ${id}`)
    return entry
  }
}
```

`packages/transport/src/index.ts`:

```ts
export { FakeTransport } from './fake.js'
export type { Connection, Transport } from './transport.js'
```

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 36 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/transport
git commit -m "Add Transport interface and in-memory fake

The single seam between platform and network. The fake is what lets the
table lifecycle be tested without ports, sleeps or flakiness."
```

---

### Task 5: The table, its participants, and the baton

The first real domain task. It handles table creation, a screen attaching, participants joining with a token, and the baton going to the first arrival. Seats and games arrive in Plan 2.

**Files:**
- Create: `packages/core/src/clock.ts`
- Create: `packages/core/src/ids.ts`
- Create: `packages/core/src/table.ts`
- Create: `packages/core/src/events.ts`
- Create: `packages/core/src/table-registry.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/table-registry.test.ts`

**Interfaces:**
- Consumes: `Rng`, `generateTableCode`, `normalizeTableCode` from Tasks 1-2; `TableSnapshot`, `ParticipantSnapshot` from `@m8/protocol`.
- Produces:
  - `interface Clock { now(): number }` and `class FixedClock implements Clock` with `advance(ms: number): void`.
  - `type IdSource = () => string`
  - `interface Participant { id, token, nickname, avatarId, connected, joinedAt }`
  - `interface Table { code, phase, participants, batonHolderId, createdAt }`
  - `type DomainEvent` — a discriminated union, described in Step 3.
  - `class TableRegistry` with `createTable(): Table`, `getTable(code: string): Table | undefined`, `joinParticipant(code, token): { table, participant, events } | { error: ErrorCode }`, `disconnectParticipant(code, participantId): DomainEvent[]`, `setProfile(code, participantId, nickname, avatarId): DomainEvent[]`, `removeParticipant(code, participantId): DomainEvent[]`, `snapshot(table): TableSnapshot`.

- [ ] **Step 1: Write the clock and id source**

`packages/core/src/clock.ts`:

```ts
/**
 * Core reads no clock of its own. Time is an input, which is what makes an
 * expiry window testable without waiting for one.
 */
export interface Clock {
  now(): number
}

export class SystemClock implements Clock {
  now(): number {
    return Date.now()
  }
}

export class FixedClock implements Clock {
  #now: number

  constructor(start = 0) {
    this.#now = start
  }

  now(): number {
    return this.#now
  }

  advance(ms: number): void {
    this.#now += ms
  }
}
```

`packages/core/src/ids.ts`:

```ts
/** Injected so tests get predictable identifiers. */
export type IdSource = () => string

export function sequentialIds(prefix: string): IdSource {
  let n = 0
  return () => {
    n += 1
    return `${prefix}-${n}`
  }
}
```

- [ ] **Step 2: Write the domain entities**

`packages/core/src/table.ts`:

```ts
export type TablePhase = 'awaiting-host' | 'choosing-game'

export interface Participant {
  readonly id: string
  /** Persisted on the device. This, not the connection, is the identity. */
  readonly token: string
  nickname: string
  avatarId: string
  connected: boolean
  readonly joinedAt: number
}

export interface Table {
  readonly code: string
  phase: TablePhase
  readonly participants: Participant[]
  /** The participant holding control of the session. Transferable. */
  batonHolderId: string | null
  readonly createdAt: number
}
```

- [ ] **Step 3: Write the domain events**

`packages/core/src/events.ts`:

```ts
/**
 * Core speaks its own language. apps/server translates these into wire
 * messages, so the domain never learns that a network exists.
 */
export type DomainEvent =
  | { readonly type: 'table-created'; readonly code: string }
  | { readonly type: 'participant-joined'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-rejoined'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-left'; readonly code: string; readonly participantId: string }
  | { readonly type: 'participant-disconnected'; readonly code: string; readonly participantId: string }
  | { readonly type: 'profile-changed'; readonly code: string; readonly participantId: string }
  | { readonly type: 'baton-granted'; readonly code: string; readonly participantId: string }
  | { readonly type: 'baton-migrated'; readonly code: string; readonly participantId: string }
  | { readonly type: 'table-emptied'; readonly code: string }
```

- [ ] **Step 4: Write the failing test**

`packages/core/src/table-registry.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { FixedClock } from './clock.js'
import { sequentialIds } from './ids.js'
import { createRng } from './rng.js'
import { TableRegistry } from './table-registry.js'

function makeRegistry(): TableRegistry {
  return new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
}

describe('TableRegistry.createTable', () => {
  let registry: TableRegistry

  beforeEach(() => {
    registry = makeRegistry()
  })

  it('creates a table awaiting a host', () => {
    const table = registry.createTable()
    expect(table.phase).toBe('awaiting-host')
    expect(table.participants).toEqual([])
    expect(table.batonHolderId).toBeNull()
  })

  it('creates tables with distinct codes', () => {
    const first = registry.createTable()
    const second = registry.createTable()
    expect(first.code).not.toBe(second.code)
  })

  it('finds a table by its code', () => {
    const table = registry.createTable()
    expect(registry.getTable(table.code)).toBe(table)
  })

  it('finds a table by a lowercase code', () => {
    const table = registry.createTable()
    expect(registry.getTable(table.code.toLowerCase())).toBe(table)
  })

  it('returns undefined for an unknown code', () => {
    expect(registry.getTable('ZZZZ')).toBeUndefined()
  })
})

describe('TableRegistry.joinParticipant', () => {
  let registry: TableRegistry
  let code: string

  beforeEach(() => {
    registry = makeRegistry()
    code = registry.createTable().code
  })

  it('rejects an unknown table', () => {
    const result = registry.joinParticipant('ZZZZ', undefined)
    expect(result).toEqual({ error: 'unknown-table' })
  })

  it('rejects a malformed code', () => {
    const result = registry.joinParticipant('nope!', undefined)
    expect(result).toEqual({ error: 'invalid-code' })
  })

  it('gives the baton to the first participant', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)

    expect(result.table.batonHolderId).toBe(result.participant.id)
    expect(result.events).toContainEqual({
      type: 'baton-granted',
      code,
      participantId: result.participant.id,
    })
  })

  it('moves the table to choosing-game once a host arrives', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)
    expect(result.table.phase).toBe('choosing-game')
  })

  it('does not give the baton to the second participant', () => {
    const first = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in first || 'error' in second) throw new Error('join failed')

    expect(second.table.batonHolderId).toBe(first.participant.id)
  })

  it('issues a token the device can present later', () => {
    const result = registry.joinParticipant(code, undefined)
    if ('error' in result) throw new Error(result.error)
    expect(result.participant.token).toBe('t-1')
  })

  it('recognizes a returning token as the same participant', () => {
    const first = registry.joinParticipant(code, undefined)
    if ('error' in first) throw new Error(first.error)
    registry.disconnectParticipant(code, first.participant.id)

    const again = registry.joinParticipant(code, first.participant.token)
    if ('error' in again) throw new Error(again.error)

    expect(again.participant.id).toBe(first.participant.id)
    expect(again.table.participants).toHaveLength(1)
    expect(again.events).toContainEqual({
      type: 'participant-rejoined',
      code,
      participantId: first.participant.id,
    })
  })

  it('treats an unrecognized token as a new participant', () => {
    const result = registry.joinParticipant(code, 'not-a-real-token')
    if ('error' in result) throw new Error(result.error)
    expect(result.participant.token).toBe('t-1')
  })
})

describe('TableRegistry.disconnectParticipant', () => {
  it('marks the participant disconnected without removing them', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    const events = registry.disconnectParticipant(code, joined.participant.id)

    expect(events).toContainEqual({
      type: 'participant-disconnected',
      code,
      participantId: joined.participant.id,
    })
    expect(registry.getTable(code)?.participants).toHaveLength(1)
    expect(registry.getTable(code)?.participants[0]?.connected).toBe(false)
  })
})

describe('TableRegistry.removeParticipant', () => {
  it('migrates the baton to the longest-present survivor', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    const second = registry.joinParticipant(code, undefined)
    if ('error' in host || 'error' in second) throw new Error('join failed')

    const events = registry.removeParticipant(code, host.participant.id)

    expect(registry.getTable(code)?.batonHolderId).toBe(second.participant.id)
    expect(events).toContainEqual({
      type: 'baton-migrated',
      code,
      participantId: second.participant.id,
    })
  })

  it('returns the table to awaiting-host when the last participant leaves', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const host = registry.joinParticipant(code, undefined)
    if ('error' in host) throw new Error(host.error)

    const events = registry.removeParticipant(code, host.participant.id)

    const table = registry.getTable(code)
    expect(table?.phase).toBe('awaiting-host')
    expect(table?.batonHolderId).toBeNull()
    expect(events).toContainEqual({ type: 'table-emptied', code })
  })
})

describe('TableRegistry.setProfile', () => {
  it('stores the nickname and avatar', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, 'Ana', 'fox')

    const table = registry.getTable(code)
    expect(table?.participants[0]?.nickname).toBe('Ana')
    expect(table?.participants[0]?.avatarId).toBe('fox')
  })

  it('trims and truncates an over-long nickname', () => {
    const registry = makeRegistry()
    const code = registry.createTable().code
    const joined = registry.joinParticipant(code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    registry.setProfile(code, joined.participant.id, `   ${'x'.repeat(50)}   `, 'fox')

    expect(registry.getTable(code)?.participants[0]?.nickname).toHaveLength(16)
  })
})

describe('TableRegistry.snapshot', () => {
  it('reports the baton holder', () => {
    const registry = makeRegistry()
    const table = registry.createTable()
    const joined = registry.joinParticipant(table.code, undefined)
    if ('error' in joined) throw new Error(joined.error)

    const snapshot = registry.snapshot(joined.table)

    expect(snapshot.code).toBe(table.code)
    expect(snapshot.phase).toBe('choosing-game')
    expect(snapshot.participants).toHaveLength(1)
    expect(snapshot.participants[0]?.hasBaton).toBe(true)
  })

  it('never exposes the participant token', () => {
    const registry = makeRegistry()
    const table = registry.createTable()
    registry.joinParticipant(table.code, undefined)

    const serialized = JSON.stringify(registry.snapshot(table))

    expect(serialized).not.toContain('t-1')
  })
})
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npx vitest run packages/core/src/table-registry.test.ts`

Expected: FAIL — `Failed to resolve import "./table-registry.js"`.

- [ ] **Step 6: Write the registry**

`packages/core/src/table-registry.ts`:

```ts
import type { ErrorCode, ParticipantSnapshot, TableSnapshot } from '@m8/protocol'
import type { Clock } from './clock.js'
import type { DomainEvent } from './events.js'
import type { IdSource } from './ids.js'
import { generateTableCode, normalizeTableCode } from './table-code.js'
import type { Rng } from './rng.js'
import type { Participant, Table } from './table.js'

export const NICKNAME_MAX_LENGTH = 16

const DEFAULT_NICKNAME = ''
const DEFAULT_AVATAR = 'unset'

export interface TableRegistryOptions {
  readonly clock: Clock
  readonly rng: Rng
  readonly newParticipantId: IdSource
  readonly newToken: IdSource
  /** The instance character that opens every code this process issues. */
  readonly shard: string
}

export type JoinResult =
  | { readonly table: Table; readonly participant: Participant; readonly events: DomainEvent[] }
  | { readonly error: ErrorCode }

/**
 * Holds every live table. Deliberately in memory: a table lives while its
 * screen is on, and persisting match state would mean migrating each game's
 * saved shape whenever its rules change.
 *
 * Access goes through this class rather than a bare map, so replacing it with
 * a persistent store later is a new implementation and not a rewrite.
 */
export class TableRegistry {
  readonly #tables = new Map<string, Table>()
  readonly #clock: Clock
  readonly #newParticipantId: IdSource
  readonly #newToken: IdSource
  readonly #shard: string
  #rng: Rng

  constructor(options: TableRegistryOptions) {
    this.#clock = options.clock
    this.#rng = options.rng
    this.#newParticipantId = options.newParticipantId
    this.#newToken = options.newToken
    this.#shard = options.shard
  }

  createTable(): Table {
    let code: string
    do {
      const [candidate, nextRng] = generateTableCode(this.#rng, this.#shard)
      this.#rng = nextRng
      code = candidate
    } while (this.#tables.has(code))

    const table: Table = {
      code,
      phase: 'awaiting-host',
      participants: [],
      batonHolderId: null,
      createdAt: this.#clock.now(),
    }
    this.#tables.set(code, table)
    return table
  }

  getTable(code: string): Table | undefined {
    const normalized = normalizeTableCode(code)
    return normalized === null ? undefined : this.#tables.get(normalized)
  }

  joinParticipant(code: string, token: string | undefined): JoinResult {
    const normalized = normalizeTableCode(code)
    if (normalized === null) return { error: 'invalid-code' }

    const table = this.#tables.get(normalized)
    if (!table) return { error: 'unknown-table' }

    const returning = token === undefined
      ? undefined
      : table.participants.find((p) => p.token === token)

    if (returning) {
      returning.connected = true
      return {
        table,
        participant: returning,
        events: [{ type: 'participant-rejoined', code: table.code, participantId: returning.id }],
      }
    }

    const participant: Participant = {
      id: this.#newParticipantId(),
      token: this.#newToken(),
      nickname: DEFAULT_NICKNAME,
      avatarId: DEFAULT_AVATAR,
      connected: true,
      joinedAt: this.#clock.now(),
    }
    table.participants.push(participant)

    const events: DomainEvent[] = [
      { type: 'participant-joined', code: table.code, participantId: participant.id },
    ]

    if (table.batonHolderId === null) {
      table.batonHolderId = participant.id
      table.phase = 'choosing-game'
      events.push({ type: 'baton-granted', code: table.code, participantId: participant.id })
    }

    return { table, participant, events }
  }

  disconnectParticipant(code: string, participantId: string): DomainEvent[] {
    const table = this.getTable(code)
    const participant = table?.participants.find((p) => p.id === participantId)
    if (!table || !participant) return []

    participant.connected = false
    return [{ type: 'participant-disconnected', code: table.code, participantId }]
  }

  removeParticipant(code: string, participantId: string): DomainEvent[] {
    const table = this.getTable(code)
    if (!table) return []

    const index = table.participants.findIndex((p) => p.id === participantId)
    if (index === -1) return []

    table.participants.splice(index, 1)
    const events: DomainEvent[] = [
      { type: 'participant-left', code: table.code, participantId },
    ]

    if (table.batonHolderId !== participantId) return events

    // The baton is leased to the table, not carried by the person, so it moves
    // to whoever has been here longest rather than ending the session.
    const successor = table.participants[0]
    if (successor) {
      table.batonHolderId = successor.id
      events.push({ type: 'baton-migrated', code: table.code, participantId: successor.id })
    } else {
      table.batonHolderId = null
      table.phase = 'awaiting-host'
      events.push({ type: 'table-emptied', code: table.code })
    }

    return events
  }

  setProfile(code: string, participantId: string, nickname: string, avatarId: string): DomainEvent[] {
    const table = this.getTable(code)
    const participant = table?.participants.find((p) => p.id === participantId)
    if (!table || !participant) return []

    participant.nickname = nickname.trim().slice(0, NICKNAME_MAX_LENGTH)
    participant.avatarId = avatarId
    return [{ type: 'profile-changed', code: table.code, participantId }]
  }

  /** The full public view of a table. Tokens never appear here. */
  snapshot(table: Table): TableSnapshot {
    const participants: ParticipantSnapshot[] = table.participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      avatarId: p.avatarId,
      connected: p.connected,
      hasBaton: table.batonHolderId === p.id,
    }))

    return { code: table.code, phase: table.phase, participants }
  }
}
```

- [ ] **Step 7: Export the new surface**

Add to `packages/core/src/index.ts`:

```ts
export { FixedClock, SystemClock } from './clock.js'
export type { Clock } from './clock.js'
export { sequentialIds } from './ids.js'
export type { IdSource } from './ids.js'
export { NICKNAME_MAX_LENGTH, TableRegistry } from './table-registry.js'
export type { JoinResult, TableRegistryOptions } from './table-registry.js'
export type { DomainEvent } from './events.js'
export type { Participant, Table, TablePhase } from './table.js'
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 55 tests.

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "Add table registry with participants and baton

A participant is identified by a device token rather than a connection,
which is what makes reconnection answerable. The baton is leased to the
table, so it migrates instead of ending the session."
```

---

### Task 6: The server

Wiring only. Fastify serves the two apps and the QR image; a Socket.IO adapter implements `Transport`; a translator turns domain events into wire messages.

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/src/socket-transport.ts`
- Create: `apps/server/src/session.ts`
- Create: `apps/server/src/network.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/main.ts`
- Test: `apps/server/src/session.test.ts`
- Test: `apps/server/src/network.test.ts`
- Modify: `tsconfig.json` (add the `@m8/server` path is not needed; add nothing)

**Interfaces:**
- Consumes: `TableRegistry`, `SystemClock`, `createRng` from `@m8/core`; `Transport`, `Connection`, `FakeTransport` from `@m8/transport`; `parseInbound` from `@m8/protocol/validate`; `PROTOCOL_VERSION` from `@m8/protocol`.
- Produces: `class Session` with `constructor(transport: Transport, registry: TableRegistry)` and no public methods (it wires handlers on construction); `lanUrls(port: number, interfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string[]`; `buildApp(options): Promise<FastifyInstance>`.

- [ ] **Step 1: Create the package manifest and install dependencies**

`apps/server/package.json`:

```json
{
  "name": "@m8/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/main.ts",
  "dependencies": {
    "@m8/core": "*",
    "@m8/protocol": "*",
    "@m8/transport": "*"
  }
}
```

Run:

```bash
npm install -w @m8/server fastify @fastify/static socket.io qrcode
npm install -w @m8/server -D socket.io-client @types/qrcode tsx esbuild
```

- [ ] **Step 2: Write the failing session test**

`apps/server/src/session.test.ts`:

```ts
import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { FixedClock, TableRegistry, createRng, sequentialIds } from '@m8/core'
import { FakeTransport } from '@m8/transport'
import { beforeEach, describe, expect, it } from 'vitest'
import { Session } from './session.js'

let transport: FakeTransport
let registry: TableRegistry

beforeEach(() => {
  transport = new FakeTransport()
  registry = new TableRegistry({
    clock: new FixedClock(1_000),
    rng: createRng(2026),
    newParticipantId: sequentialIds('p'),
    newToken: sequentialIds('t'),
    shard: 'A',
  })
  new Session(transport, registry)
})

function firstOfType<T extends ServerToClient['type']>(
  id: string,
  type: T,
): Extract<ServerToClient, { type: T }> {
  const found = transport.sentTo(id).find((m) => m.type === type)
  if (!found) throw new Error(`No ${type} sent to ${id}: ${JSON.stringify(transport.sentTo(id))}`)
  return found as Extract<ServerToClient, { type: T }>
}

describe('a screen connecting', () => {
  it('creates a table and reports its code', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    const ready = firstOfType('tv', 'tableReady')
    expect(registry.getTable(ready.code)).toBeDefined()
  })

  it('sends the table state right after creating it', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })

    const state = firstOfType('tv', 'tableState')
    expect(state.table.phase).toBe('awaiting-host')
  })

  it('rejoins the same table when the screen presents a known code', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    const code = firstOfType('tv', 'tableReady').code

    transport.connect('tv-2')
    transport.receive('tv-2', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code })

    expect(firstOfType('tv-2', 'tableReady').code).toBe(code)
  })

  it('creates a fresh table when the presented code is gone', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code: 'ZZZZ' })

    expect(firstOfType('tv', 'tableReady').code).not.toBe('ZZZZ')
  })

  it('tells a client with the wrong protocol version to reload', () => {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION + 1 })

    expect(transport.sentTo('tv')).toContainEqual({ type: 'reload', reason: 'protocol-version' })
  })
})

describe('a phone joining', () => {
  function openTable(): string {
    transport.connect('tv')
    transport.receive('tv', { type: 'helloTable', protocolVersion: PROTOCOL_VERSION })
    return firstOfType('tv', 'tableReady').code
  }

  it('receives a welcome carrying a token', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    expect(firstOfType('phone', 'welcome').token).toBe('t-1')
  })

  it('errors on an unknown table', () => {
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code: 'ZZZZ' })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'unknown-table' })
  })

  it('pushes the new state to the screen as well', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants).toHaveLength(1)
  })

  it('broadcasts the profile to the screen', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'setProfile', nickname: 'Ana', avatarId: 'fox' })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants[0]?.nickname).toBe('Ana')
  })

  it('marks the participant disconnected when the socket drops', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.disconnect('phone')

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants[0]?.connected).toBe(false)
  })

  it('removes the participant when they leave deliberately', () => {
    const code = openTable()
    transport.connect('phone')
    transport.receive('phone', { type: 'hello', protocolVersion: PROTOCOL_VERSION, code })
    transport.receive('phone', { type: 'leave' })

    const states = transport.sentTo('tv').filter((m) => m.type === 'tableState')
    const latest = states[states.length - 1]
    expect(latest?.type === 'tableState' && latest.table.participants).toHaveLength(0)
  })

  it('rejects a malformed message without crashing', () => {
    transport.connect('phone')
    transport.receive('phone', { type: 'launchMissiles' })

    expect(transport.sentTo('phone')).toContainEqual({ type: 'error', code: 'invalid-message' })
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run apps/server/src/session.test.ts`

Expected: FAIL — `Failed to resolve import "./session.js"`.

- [ ] **Step 4: Write the session**

`apps/server/src/session.ts`:

```ts
import { PROTOCOL_VERSION, type ServerToClient } from '@m8/protocol'
import { parseInbound } from '@m8/protocol/validate'
import type { DomainEvent, Table, TableRegistry } from '@m8/core'
import type { Connection, Transport } from '@m8/transport'

interface Attachment {
  readonly role: 'screen' | 'phone'
  readonly code: string
  readonly participantId?: string
}

/**
 * Translates between the transport and the domain.
 *
 * The domain speaks DomainEvent; the wire speaks ServerToClient. This class is
 * the only place that knows both, which is what keeps packages/core free of
 * any notion that a network exists.
 */
export class Session {
  readonly #transport: Transport
  readonly #registry: TableRegistry
  readonly #attachments = new Map<string, Attachment>()
  readonly #connections = new Map<string, Connection>()

  constructor(transport: Transport, registry: TableRegistry) {
    this.#transport = transport
    this.#registry = registry

    this.#transport.onConnect((connection) => {
      this.#connections.set(connection.id, connection)
    })

    this.#transport.onMessage((connection, raw) => {
      this.#handle(connection, raw)
    })

    this.#transport.onDisconnect((connection) => {
      this.#handleDisconnect(connection)
    })
  }

  #handle(connection: Connection, raw: unknown): void {
    const message = parseInbound(raw)
    if (message === null) {
      connection.send({ type: 'error', code: 'invalid-message' })
      return
    }

    switch (message.type) {
      case 'helloTable': {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const existing = message.code === undefined ? undefined : this.#registry.getTable(message.code)
        const table = existing ?? this.#registry.createTable()
        this.#attachments.set(connection.id, { role: 'screen', code: table.code })
        connection.send({ type: 'tableReady', code: table.code })
        this.#broadcast(table)
        return
      }

      case 'hello': {
        if (message.protocolVersion !== PROTOCOL_VERSION) {
          connection.send({ type: 'reload', reason: 'protocol-version' })
          return
        }
        const result = this.#registry.joinParticipant(message.code, message.token)
        if ('error' in result) {
          connection.send({ type: 'error', code: result.error })
          return
        }
        this.#attachments.set(connection.id, {
          role: 'phone',
          code: result.table.code,
          participantId: result.participant.id,
        })
        connection.send({
          type: 'welcome',
          participantId: result.participant.id,
          token: result.participant.token,
        })
        this.#applyEvents(result.events)
        this.#broadcast(result.table)
        return
      }

      case 'setProfile': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.participantId === undefined) {
          connection.send({ type: 'error', code: 'not-allowed' })
          return
        }
        const events = this.#registry.setProfile(
          attachment.code,
          attachment.participantId,
          message.nickname,
          message.avatarId,
        )
        this.#applyEvents(events)
        this.#broadcastCode(attachment.code)
        return
      }

      case 'leave': {
        const attachment = this.#attachments.get(connection.id)
        if (!attachment || attachment.participantId === undefined) return
        const events = this.#registry.removeParticipant(attachment.code, attachment.participantId)
        this.#attachments.delete(connection.id)
        this.#applyEvents(events)
        this.#broadcastCode(attachment.code)
        return
      }
    }
  }

  #handleDisconnect(connection: Connection): void {
    const attachment = this.#attachments.get(connection.id)
    this.#attachments.delete(connection.id)
    this.#connections.delete(connection.id)
    if (!attachment || attachment.participantId === undefined) return

    const events = this.#registry.disconnectParticipant(attachment.code, attachment.participantId)
    this.#applyEvents(events)
    this.#broadcastCode(attachment.code)
  }

  /**
   * Reserved for events that need a message of their own. Today every event is
   * already reflected in the snapshot that follows it, because the server
   * sends full state rather than diffs.
   */
  #applyEvents(_events: readonly DomainEvent[]): void {}

  #broadcastCode(code: string): void {
    const table = this.#registry.getTable(code)
    if (table) this.#broadcast(table)
  }

  #broadcast(table: Table): void {
    const snapshot = this.#registry.snapshot(table)
    const message: ServerToClient = { type: 'tableState', table: snapshot }

    for (const [connectionId, attachment] of this.#attachments) {
      if (attachment.code !== table.code) continue
      this.#connections.get(connectionId)?.send(message)
    }
  }
}
```

- [ ] **Step 5: Run the session tests and confirm they pass**

Run: `npx vitest run apps/server/src/session.test.ts`

Expected: PASS, 12 tests.

- [ ] **Step 6: Write the failing LAN-address test**

`apps/server/src/network.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lanUrls } from './network.js'

describe('lanUrls', () => {
  it('lists external IPv4 addresses', () => {
    const urls = lanUrls(3000, {
      'Wi-Fi': [
        { address: '192.168.0.12', family: 'IPv4', internal: false } as never,
      ],
    })
    expect(urls).toEqual(['http://192.168.0.12:3000'])
  })

  it('skips loopback', () => {
    const urls = lanUrls(3000, {
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
    })
    expect(urls).toEqual([])
  })

  it('skips IPv6', () => {
    const urls = lanUrls(3000, {
      'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false } as never],
    })
    expect(urls).toEqual([])
  })

  it('tolerates an interface with no addresses', () => {
    expect(lanUrls(3000, { Ghost: undefined })).toEqual([])
  })
})
```

- [ ] **Step 7: Write the network helper**

`apps/server/src/network.ts`:

```ts
import type { NetworkInterfaceInfo } from 'node:os'

/**
 * Printed at boot so the owner does not have to hunt for the machine address
 * before opening the table on a television.
 *
 * Note this is a convenience only: the QR code is built from the host the
 * screen used to request the page, so it is correct without any of this.
 */
export function lanUrls(
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] {
  const urls: string[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4') continue
      urls.push(`http://${entry.address}:${port}`)
    }
  }
  return urls
}
```

- [ ] **Step 8: Write the Socket.IO adapter and the Fastify app**

`apps/server/src/socket-transport.ts`:

```ts
import type { ServerToClient } from '@m8/protocol'
import type { Connection, Transport } from '@m8/transport'
import type { Server as SocketServer, Socket } from 'socket.io'

const CHANNEL = 'm8'

/**
 * The only file in the repository that knows Socket.IO exists.
 *
 * Socket.IO was chosen for its automatic fall back to long polling: the target
 * is a television browser whose devtools cannot be opened, where a WebSocket
 * that silently fails would present as a black screen with no way to diagnose
 * it.
 */
export class SocketIoTransport implements Transport {
  readonly #io: SocketServer
  #onConnect: (connection: Connection) => void = () => {}
  #onMessage: (connection: Connection, raw: unknown) => void = () => {}
  #onDisconnect: (connection: Connection) => void = () => {}

  constructor(io: SocketServer) {
    this.#io = io
    this.#io.on('connection', (socket: Socket) => {
      const connection = this.#wrap(socket)
      this.#onConnect(connection)
      socket.on(CHANNEL, (raw: unknown) => this.#onMessage(connection, raw))
      socket.on('disconnect', () => this.#onDisconnect(connection))
    })
  }

  onConnect(handler: (connection: Connection) => void): void {
    this.#onConnect = handler
  }

  onMessage(handler: (connection: Connection, raw: unknown) => void): void {
    this.#onMessage = handler
  }

  onDisconnect(handler: (connection: Connection) => void): void {
    this.#onDisconnect = handler
  }

  #wrap(socket: Socket): Connection {
    return {
      id: socket.id,
      send: (message: ServerToClient) => socket.emit(CHANNEL, message),
      close: () => socket.disconnect(true),
    }
  }
}
```

`apps/server/src/app.ts`:

```ts
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { Server as SocketServer } from 'socket.io'
import { SystemClock, TableRegistry, createRng, normalizeTableCode } from '@m8/core'
import { SocketIoTransport } from './socket-transport.js'
import { Session } from './session.js'

export interface AppOptions {
  /** Directory holding the built large-screen bundle. */
  readonly tvRoot: string
  /** Directory holding the built phone bundle. */
  readonly phoneRoot: string
  /** Instance character opening every table code this process issues. */
  readonly shard?: string
  readonly seed?: number
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })

  const registry = new TableRegistry({
    clock: new SystemClock(),
    rng: createRng(options.seed ?? Date.now()),
    newParticipantId: () => crypto.randomUUID(),
    newToken: () => crypto.randomUUID(),
    shard: options.shard ?? 'A',
  })

  await app.register(fastifyStatic, { root: options.tvRoot, prefix: '/' })
  await app.register(fastifyStatic, {
    root: options.phoneRoot,
    prefix: '/phone/',
    decorateReply: false,
  })

  app.get<{ Params: { code: string } }>('/qr/:code.svg', async (request, reply) => {
    const code = normalizeTableCode(request.params.code)
    if (code === null) return reply.code(404).send()

    // Built from the host the screen used, so it can never say localhost.
    const target = `${request.protocol}://${request.headers.host}/${code}`
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1 })
    return reply.type('image/svg+xml').send(svg)
  })

  app.get<{ Params: { code: string } }>('/:code', async (request, reply) => {
    if (normalizeTableCode(request.params.code) === null) return reply.code(404).send()
    return reply.sendFile('index.html', options.phoneRoot)
  })

  const io = new SocketServer(app.server, { serveClient: false })
  new Session(new SocketIoTransport(io), registry)

  app.addHook('onClose', async () => {
    await io.close()
  })

  return app
}

export const defaultRoots = {
  tv: fileURLToPath(new URL('../../tv/dist/', import.meta.url)),
  phone: fileURLToPath(new URL('../../phone/dist/', import.meta.url)),
}
```

`apps/server/src/main.ts`:

```ts
import { networkInterfaces } from 'node:os'
import { buildApp, defaultRoots } from './app.js'
import { lanUrls } from './network.js'

const port = Number(process.env['PORT'] ?? 3000)
const host = process.env['HOST'] ?? '0.0.0.0'

const app = await buildApp({ tvRoot: defaultRoots.tv, phoneRoot: defaultRoots.phone })
await app.listen({ port, host })

for (const url of lanUrls(port, networkInterfaces())) {
  app.log.info(`Large screen: ${url}`)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Draining, not killing: deploys bring up a new instance and stop routing
    // new connections here, so this only fires once the table is empty.
    void app.close().then(() => process.exit(0))
  })
}
```

- [ ] **Step 9: Run the full suite and confirm it passes**

Run: `npm test`

Expected: PASS, 71 tests.

- [ ] **Step 10: Commit**

```bash
git add apps/server package.json package-lock.json
git commit -m "Add server wiring, Socket.IO adapter and QR endpoint

The adapter is the only file that knows Socket.IO exists. The QR target is
built from the host the screen requested, so it can never say localhost."
```

---

### Task 7: Design tokens and the large-screen app

**Files:**
- Create: `packages/tokens/package.json`
- Create: `packages/tokens/tokens.css`
- Create: `apps/tv/package.json`
- Create: `apps/tv/index.html`
- Create: `apps/tv/vite.config.ts`
- Create: `apps/tv/tailwind.config.js`
- Create: `apps/tv/postcss.config.js`
- Create: `apps/tv/src/styles.css`
- Create: `apps/tv/src/client.ts`
- Create: `apps/tv/src/render.ts`
- Create: `apps/tv/src/main.ts`
- Test: `apps/tv/src/render.test.ts`

**Interfaces:**
- Consumes: `ServerToClient`, `TableSnapshot`, `PROTOCOL_VERSION` from `@m8/protocol`.
- Produces: `renderTable(root: HTMLElement, view: TvView): void` where `TvView = { code: string; participants: readonly ParticipantSnapshot[] }`; `connectScreen(onMessage: (m: ServerToClient) => void): { send(m: ScreenToServer): void }`.

- [ ] **Step 1: Create the shared design tokens**

`packages/tokens/package.json`:

```json
{
  "name": "@m8/tokens",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./tokens.css": "./tokens.css"
  }
}
```

`packages/tokens/tokens.css` — one source of truth, consumed by both Tailwind configurations so the palette cannot drift between the two screens:

```css
:root {
  --m8-felt-900: #0d2018;
  --m8-felt-700: #14332a;
  --m8-felt-500: #1d4a3c;
  --m8-chalk: #f4f1e8;
  --m8-brass: #d8a657;
  --m8-clay: #c3524a;
  --m8-slate: #7a8b85;

  --m8-safe-inset: 5%;
}
```

- [ ] **Step 2: Create the app manifest and install dependencies**

`apps/tv/package.json`:

```json
{
  "name": "@m8/tv",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@m8/protocol": "*",
    "@m8/tokens": "*"
  }
}
```

Run:

```bash
npm install -w @m8/tv socket.io-client
npm install -w @m8/tv -D vite tailwindcss@3 postcss autoprefixer jsdom
```

The `tailwindcss@3` pin is deliberate and load-bearing: v4 requires Chrome 111+ and would break visually on the target television.

- [ ] **Step 3: Configure the ES2017 build**

`apps/tv/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@m8/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
    },
  },
  build: {
    // Chromium 68-79 on 2020-2021 Tizen and webOS. No optional chaining, no
    // nullish coalescing may survive into the output; CI parses the bundle.
    target: 'es2017',
    modulePreload: { polyfill: false },
  },
  esbuild: {
    target: 'es2017',
  },
})
```

`apps/tv/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.ts'],
  theme: {
    extend: {
      colors: {
        felt: {
          900: 'var(--m8-felt-900)',
          700: 'var(--m8-felt-700)',
          500: 'var(--m8-felt-500)',
        },
        chalk: 'var(--m8-chalk)',
        brass: 'var(--m8-brass)',
        clay: 'var(--m8-clay)',
        slate: 'var(--m8-slate)',
      },
    },
  },
  plugins: [],
}
```

`apps/tv/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`apps/tv/src/styles.css`:

```css
@import '@m8/tokens/tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

/*
 * Overscan: many televisions crop the outer edge of the picture, so nothing
 * may live in the outer 5%.
 *
 * Margins are used rather than flexbox gap, which needs Chromium 84.
 */
.m8-safe {
  padding: var(--m8-safe-inset);
}
```

`apps/tv/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>M8</title>
  </head>
  <body class="bg-felt-900 text-chalk">
    <main id="app" class="m8-safe"></main>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Write the failing render test**

`apps/tv/src/render.test.ts`:

```ts
// @vitest-environment jsdom
import type { ParticipantSnapshot } from '@m8/protocol'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderTable } from './render.js'

let root: HTMLElement

beforeEach(() => {
  root = document.createElement('div')
})

function participant(overrides: Partial<ParticipantSnapshot> = {}): ParticipantSnapshot {
  return {
    id: 'p-1',
    nickname: 'Ana',
    avatarId: 'fox',
    connected: true,
    hasBaton: false,
    ...overrides,
  }
}

describe('renderTable', () => {
  it('shows the table code', () => {
    renderTable(root, { code: 'KXTP', participants: [] })
    expect(root.textContent).toContain('KXTP')
  })

  it('points the QR image at the server endpoint for that code', () => {
    renderTable(root, { code: 'KXTP', participants: [] })
    const image = root.querySelector('img')
    expect(image?.getAttribute('src')).toBe('/qr/KXTP.svg')
  })

  it('lists each participant nickname', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ nickname: 'Bia' })] })
    expect(root.textContent).toContain('Bia')
  })

  it('marks the baton holder', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ hasBaton: true })] })
    expect(root.querySelector('[data-baton="true"]')).not.toBeNull()
  })

  it('marks a disconnected participant', () => {
    renderTable(root, { code: 'KXTP', participants: [participant({ connected: false })] })
    expect(root.querySelector('[data-connected="false"]')).not.toBeNull()
  })

  it('replaces previous content instead of appending', () => {
    renderTable(root, { code: 'KXTP', participants: [participant()] })
    renderTable(root, { code: 'KXTP', participants: [] })
    expect(root.textContent).not.toContain('Ana')
  })

  it('renders nothing interactive', () => {
    renderTable(root, { code: 'KXTP', participants: [participant()] })
    expect(root.querySelectorAll('button, a, input, [tabindex]')).toHaveLength(0)
  })
})
```

- [ ] **Step 5: Run the test and confirm it fails**

Run: `npx vitest run apps/tv/src/render.test.ts`

Expected: FAIL — `Failed to resolve import "./render.js"`.

- [ ] **Step 6: Write the renderer**

`apps/tv/src/render.ts`:

```ts
import type { ParticipantSnapshot } from '@m8/protocol'

export interface TvView {
  readonly code: string
  readonly participants: readonly ParticipantSnapshot[]
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/**
 * The large screen displays and nothing else: no buttons, no links, no focus.
 * Written against the DOM directly because this tree is structurally almost
 * static, and because a framework runtime is weight the target hardware should
 * not have to carry.
 */
export function renderTable(root: HTMLElement, view: TvView): void {
  root.textContent = ''

  const header = element('div', 'mb-16')
  header.appendChild(element('p', 'text-3xl uppercase tracking-widest text-slate', 'Join the table'))
  header.appendChild(element('p', 'text-9xl font-black tracking-widest text-brass', view.code))
  root.appendChild(header)

  const qr = document.createElement('img')
  qr.setAttribute('src', `/qr/${view.code}.svg`)
  qr.setAttribute('alt', '')
  qr.className = 'h-96 w-96 bg-chalk p-6'
  root.appendChild(qr)

  const list = element('ul', 'mt-16')
  for (const person of view.participants) {
    const item = element('li', 'mb-6 text-5xl')
    item.setAttribute('data-baton', String(person.hasBaton))
    item.setAttribute('data-connected', String(person.connected))
    item.textContent = person.nickname === '' ? '…' : person.nickname
    list.appendChild(item)
  }
  root.appendChild(list)
}
```

- [ ] **Step 7: Write the client and entry point**

`apps/tv/src/client.ts`:

```ts
import { PROTOCOL_VERSION, type ScreenToServer, type ServerToClient } from '@m8/protocol'
import { io } from 'socket.io-client'

const CHANNEL = 'm8'
const STORED_CODE_KEY = 'm8.table.code'

export interface ScreenClient {
  send(message: ScreenToServer): void
}

/**
 * The screen stores its table code, so a refresh or a Wi-Fi blip rejoins the
 * same table with everyone still seated.
 */
export function connectScreen(onMessage: (message: ServerToClient) => void): ScreenClient {
  const socket = io({ transports: ['websocket', 'polling'] })

  const hello = (): void => {
    const stored = window.localStorage.getItem(STORED_CODE_KEY)
    const message: ScreenToServer = stored === null
      ? { type: 'helloTable', protocolVersion: PROTOCOL_VERSION }
      : { type: 'helloTable', protocolVersion: PROTOCOL_VERSION, code: stored }
    socket.emit(CHANNEL, message)
  }

  socket.on('connect', hello)
  socket.on(CHANNEL, (message: ServerToClient) => {
    if (message.type === 'tableReady') {
      window.localStorage.setItem(STORED_CODE_KEY, message.code)
    }
    if (message.type === 'reload') {
      window.location.reload()
      return
    }
    onMessage(message)
  })

  return {
    send: (message) => socket.emit(CHANNEL, message),
  }
}
```

`apps/tv/src/main.ts`:

```ts
import './styles.css'
import { connectScreen } from './client.js'
import { renderTable } from './render.js'

const root = document.getElementById('app')
if (root === null) throw new Error('Missing #app element')

let code = ''

connectScreen((message) => {
  if (message.type === 'tableReady') {
    code = message.code
    return
  }
  if (message.type === 'tableState') {
    renderTable(root, { code, participants: message.table.participants })
  }
})
```

- [ ] **Step 8: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 78 tests.

- [ ] **Step 9: Build and eyeball the output target**

Run: `npm run build -w @m8/tv`

Expected: build succeeds and writes `apps/tv/dist/`.

- [ ] **Step 10: Commit**

```bash
git add packages/tokens apps/tv package.json package-lock.json
git commit -m "Add design tokens and the large-screen app

Tokens live once and both Tailwind configurations point at them, so the
palette cannot drift between screens. The large screen renders through the
DOM directly and contains nothing interactive."
```

---

### Task 8: The phone app

**Files:**
- Create: `apps/phone/package.json`
- Create: `apps/phone/index.html`
- Create: `apps/phone/vite.config.ts`
- Create: `apps/phone/src/styles.css`
- Create: `apps/phone/src/client.ts`
- Create: `apps/phone/src/avatars.ts`
- Create: `apps/phone/src/App.tsx`
- Create: `apps/phone/src/main.tsx`
- Test: `apps/phone/src/client.test.ts`

**Interfaces:**
- Consumes: `ClientToServer`, `ServerToClient`, `PROTOCOL_VERSION` from `@m8/protocol`.
- Produces: `codeFromLocation(pathname: string): string | null`; `AVATARS: readonly { id: string; glyph: string }[]`; React component `App`.

- [ ] **Step 1: Create the app manifest and install dependencies**

`apps/phone/package.json`:

```json
{
  "name": "@m8/phone",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@m8/protocol": "*",
    "@m8/tokens": "*"
  }
}
```

Run:

```bash
npm install -w @m8/phone react react-dom socket.io-client
npm install -w @m8/phone -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite @types/react @types/react-dom
```

Unpinned `tailwindcss` here resolves to v4, which is correct: the phone has no old-browser constraint.

- [ ] **Step 2: Configure the build**

`apps/phone/vite.config.ts`:

```ts
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/phone/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@m8/protocol': fileURLToPath(new URL('../../packages/protocol/src/index.ts', import.meta.url)),
    },
  },
})
```

`apps/phone/src/styles.css`:

```css
@import '@m8/tokens/tokens.css';
@import 'tailwindcss';

@theme {
  --color-felt-900: var(--m8-felt-900);
  --color-felt-700: var(--m8-felt-700);
  --color-chalk: var(--m8-chalk);
  --color-brass: var(--m8-brass);
  --color-clay: var(--m8-clay);
}
```

`apps/phone/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>M8</title>
  </head>
  <body class="bg-felt-900 text-chalk">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the failing test**

`apps/phone/src/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { codeFromLocation } from './client.js'

describe('codeFromLocation', () => {
  it('reads the code from the root path', () => {
    expect(codeFromLocation('/KXTP')).toBe('KXTP')
  })

  it('uppercases a lowercase code', () => {
    expect(codeFromLocation('/kxtp')).toBe('KXTP')
  })

  it('tolerates a trailing slash', () => {
    expect(codeFromLocation('/KXTP/')).toBe('KXTP')
  })

  it('returns null for the bare root', () => {
    expect(codeFromLocation('/')).toBeNull()
  })

  it('returns null for a path that is not a code', () => {
    expect(codeFromLocation('/assets/main.js')).toBeNull()
  })

  it('returns null for an ambiguous character', () => {
    expect(codeFromLocation('/KXT0')).toBeNull()
  })
})
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npx vitest run apps/phone/src/client.test.ts`

Expected: FAIL — `Failed to resolve import "./client.js"`.

- [ ] **Step 5: Write the client**

`apps/phone/src/client.ts`:

```ts
import { PROTOCOL_VERSION, type ClientToServer, type ServerToClient } from '@m8/protocol'
import { io } from 'socket.io-client'

const CHANNEL = 'm8'
const TOKEN_KEY = 'm8.participant.token'
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
const CODE_LENGTH = 4

/** The QR carries the whole destination, so the code arrives in the path. */
export function codeFromLocation(pathname: string): string | null {
  const candidate = pathname.replace(/^\/+|\/+$/g, '').toUpperCase()
  if (candidate.length !== CODE_LENGTH) return null
  for (const char of candidate) {
    if (!CODE_ALPHABET.includes(char)) return null
  }
  return candidate
}

export interface PhoneClient {
  send(message: ClientToServer): void
}

export function connectPhone(
  code: string,
  onMessage: (message: ServerToClient) => void,
): PhoneClient {
  const socket = io({ transports: ['websocket', 'polling'] })

  socket.on('connect', () => {
    const token = window.localStorage.getItem(TOKEN_KEY)
    const hello: ClientToServer = token === null
      ? { type: 'hello', protocolVersion: PROTOCOL_VERSION, code }
      : { type: 'hello', protocolVersion: PROTOCOL_VERSION, code, token }
    socket.emit(CHANNEL, hello)
  })

  socket.on(CHANNEL, (message: ServerToClient) => {
    if (message.type === 'welcome') {
      window.localStorage.setItem(TOKEN_KEY, message.token)
    }
    if (message.type === 'reload') {
      window.location.reload()
      return
    }
    onMessage(message)
  })

  return {
    send: (message) => socket.emit(CHANNEL, message),
  }
}
```

- [ ] **Step 6: Write the avatars and the UI**

`apps/phone/src/avatars.ts`:

```ts
/**
 * A fixed set, no uploads. Each has to be told apart from three metres away on
 * a television, which rules out anything detailed.
 */
export const AVATARS = [
  { id: 'fox', glyph: '🦊' },
  { id: 'owl', glyph: '🦉' },
  { id: 'cat', glyph: '🐱' },
  { id: 'frog', glyph: '🐸' },
  { id: 'bear', glyph: '🐻' },
  { id: 'crab', glyph: '🦀' },
] as const
```

`apps/phone/src/App.tsx`:

```tsx
import type { ServerToClient, TableSnapshot } from '@m8/protocol'
import { useEffect, useRef, useState } from 'react'
import { AVATARS } from './avatars.js'
import { codeFromLocation, connectPhone, type PhoneClient } from './client.js'

export function App() {
  const code = codeFromLocation(window.location.pathname)
  const [table, setTable] = useState<TableSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nickname, setNickname] = useState('')
  const [avatarId, setAvatarId] = useState<string>(AVATARS[0].id)
  const [joined, setJoined] = useState(false)
  const client = useRef<PhoneClient | null>(null)

  useEffect(() => {
    if (code === null) return
    client.current = connectPhone(code, (message: ServerToClient) => {
      if (message.type === 'tableState') setTable(message.table)
      if (message.type === 'error') setError(message.code)
    })
  }, [code])

  if (code === null) {
    return <p className="p-6 text-lg">Scan the code shown on the screen.</p>
  }

  if (error !== null) {
    return <p className="p-6 text-lg text-clay">{error}</p>
  }

  if (!joined) {
    return (
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          client.current?.send({ type: 'setProfile', nickname, avatarId })
          setJoined(true)
        }}
      >
        <label className="text-lg" htmlFor="nickname">
          Your name
        </label>
        <input
          id="nickname"
          className="rounded-lg bg-felt-700 p-4 text-xl"
          maxLength={16}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
        />

        <div className="grid grid-cols-3 gap-3">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              aria-pressed={avatar.id === avatarId}
              className={
                avatar.id === avatarId
                  ? 'rounded-lg bg-brass p-4 text-4xl'
                  : 'rounded-lg bg-felt-700 p-4 text-4xl'
              }
              onClick={() => setAvatarId(avatar.id)}
            >
              {avatar.glyph}
            </button>
          ))}
        </div>

        <button className="rounded-lg bg-brass p-4 text-xl text-felt-900" type="submit">
          Take a place
        </button>
      </form>
    )
  }

  return (
    <div className="p-6">
      <p className="text-2xl">You are at table {table?.code ?? code}</p>
      <p className="mt-2 text-lg opacity-70">{table?.participants.length ?? 0} here</p>
    </div>
  )
}
```

`apps/phone/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import { App } from './App.js'

const root = document.getElementById('root')
if (root === null) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 7: Run the tests and confirm they pass**

Run: `npm test`

Expected: PASS, 84 tests.

- [ ] **Step 8: Build both apps**

Run: `npm run build -w @m8/tv && npm run build -w @m8/phone`

Expected: both succeed.

- [ ] **Step 9: Commit**

```bash
git add apps/phone package.json package-lock.json
git commit -m "Add the phone app with profile entry

The code arrives in the path because the QR carries the whole destination,
so nobody types anything but a nickname."
```

---

### Task 9: The run scripts and the real-television smoke test

This is the task the whole plan exists for. It ends with the design's largest risk either retired or exposed, in week one.

**Files:**
- Modify: `package.json`
- Create: `docs/tv-smoke-test.md`

**Interfaces:**
- Consumes: build scripts from Tasks 7-8, `apps/server/src/main.ts` from Task 6.
- Produces: `npm run dev`, `npm run lan`, `npm run build`.

- [ ] **Step 1: Add the scripts**

Replace the `scripts` block in the root `package.json`:

```json
{
  "scripts": {
    "dev": "npm run dev -w @m8/tv & npm run dev -w @m8/phone & npx tsx watch apps/server/src/main.ts",
    "build": "npm run build -w @m8/tv && npm run build -w @m8/phone",
    "lan": "npm run build && npx tsx apps/server/src/main.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

`dev` runs natively for speed: file-change events do not cross the Windows and container boundary, and polling costs latency exactly where iteration matters. `lan` builds with the real television target and is the artifact that gets opened on the TV.

- [ ] **Step 2: Run it on the LAN**

Run: `npm run lan`

Expected: the log prints one or more `Large screen: http://192.168.x.x:3000` lines. Windows will ask about the firewall on first run — allow private networks, or no phone can reach it.

- [ ] **Step 3: Verify on the PC first**

Open the printed URL in Chrome on the PC. Expected: the table code and a QR code appear. Scan it with a phone on the same network. Expected: the phone opens the profile screen; after submitting, the nickname appears on the large screen.

- [ ] **Step 4: Write the smoke-test checklist**

`docs/tv-smoke-test.md`:

```markdown
# Television smoke test

Run this on a real Samsung (Tizen) or LG (webOS) set at the end of every
milestone, and the first time as early as possible. No automated test can
replace it: Playwright would drive a recent Chromium and could never catch a
syntax feature the television lacks.

Record the set's model and year with the result.

## Steps

1. Run `npm run lan` on the PC and note the printed LAN URL.
2. Open that URL in the television browser.
3. Confirm the table code renders and is legible from three metres.
4. Confirm the QR code renders and scans from a phone.
5. Confirm nothing is cropped: the code and the QR are fully inside the screen.
6. Join from a phone and confirm the nickname appears on the television within
   about a second.
7. Reload the television page and confirm it rejoins the same table code with
   the participant still listed.
8. Turn the phone Wi-Fi off and on; confirm the television marks the
   participant disconnected and then connected again.

## What to record on failure

- The model and firmware year of the set.
- Whether the page rendered at all, or rendered with wrong colours or layout.
- Whether the connection established. If it did not, whether the Socket.IO
  transport fell back to polling (visible in the server log).

A failure at step 2 or 6 is the risk the spec flagged. The `Transport`
boundary exists so that replacing Socket.IO is writing one class.
```

- [ ] **Step 5: Run the checklist on the real television**

Follow `docs/tv-smoke-test.md` end to end. Record the outcome in the commit message.

- [ ] **Step 6: Commit**

```bash
git add package.json docs/tv-smoke-test.md
git commit -m "Add run scripts and the television smoke test

The inner loop runs natively because file-change events do not cross the
container boundary. The checklist retires the largest risk in the design
before any game exists."
```

---

### Task 10: Docker

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Modify: `package.json`

**Interfaces:**
- Consumes: the build scripts from Task 9.
- Produces: `npm run docker`.

- [ ] **Step 1: Write the ignore file**

`.dockerignore`:

```
node_modules
**/node_modules
**/dist
.git
docs
*.log
```

- [ ] **Step 2: Write the image**

`Dockerfile`:

```dockerfile
# The Node version is declared once, in .nvmrc, and read here so the container
# and the developer machine cannot drift apart.
ARG NODE_VERSION=26
FROM node:${NODE_VERSION}-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci

FROM deps AS build
WORKDIR /app
RUN npm run build

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps ./apps
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
CMD ["npx", "tsx", "apps/server/src/main.ts"]
```

- [ ] **Step 3: Write the compose file**

`compose.yaml`:

```yaml
# Shaped now so postgres (M3) and traefik (M2) slot in without a rewrite.
services:
  server:
    build:
      context: .
      args:
        NODE_VERSION: 26
    ports:
      # Published on all interfaces so the television and phones on the LAN
      # can reach the container.
      - "0.0.0.0:3000:3000"
    environment:
      HOST: 0.0.0.0
      PORT: 3000
    volumes:
      # node_modules is a named volume, never a bind mount: Linux-built
      # binaries must not mix with Windows-built ones.
      - node_modules:/app/node_modules

volumes:
  node_modules:
```

- [ ] **Step 4: Add the script**

Add to the root `package.json` scripts:

```json
{
  "docker": "docker compose up --build"
}
```

- [ ] **Step 5: Verify the clean-machine promise**

Run: `npm run docker`

Expected: the image builds and the server logs its listen address. Open `http://localhost:3000` and confirm the table and QR render.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore compose.yaml package.json
git commit -m "Add Docker image and compose stack

node_modules is a named volume so Linux and Windows binaries never mix.
The compose file is shaped for postgres and traefik to slot in later."
```

---

### Task 11: The two CI guards

The spec turns "the large screen is light" from an intention into a number, and turns old-browser compatibility from a hope into a parse. This task builds both.

**Files:**
- Create: `scripts/check-tv-syntax.mjs`
- Create: `scripts/check-tv-size.mjs`
- Create: `budget.json`
- Modify: `package.json`
- Test: `scripts/check-tv-syntax.test.ts`

**Interfaces:**
- Consumes: `apps/tv/dist` produced by Task 7.
- Produces: `npm run guard:syntax`, `npm run guard:size`, and `assertEs2017(source: string, label: string): void` exported from `scripts/check-tv-syntax.mjs`.

- [ ] **Step 1: Install the parser**

Run:

```bash
npm install -D acorn gzip-size
```

- [ ] **Step 2: Write the failing guard test**

`scripts/check-tv-syntax.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertEs2017 } from './check-tv-syntax.mjs'

describe('assertEs2017', () => {
  it('accepts ES2017 syntax', () => {
    expect(() => assertEs2017('async function f() { await 1 }', 'ok.js')).not.toThrow()
  })

  it('rejects optional chaining', () => {
    expect(() => assertEs2017('const x = a?.b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects nullish coalescing', () => {
    expect(() => assertEs2017('const x = a ?? b', 'bad.js')).toThrow(/bad\.js/)
  })

  it('rejects class private fields', () => {
    expect(() => assertEs2017('class A { #x = 1 }', 'bad.js')).toThrow(/bad\.js/)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run scripts/check-tv-syntax.test.ts`

Expected: FAIL — cannot resolve `./check-tv-syntax.mjs`.

- [ ] **Step 4: Write the syntax guard**

`scripts/check-tv-syntax.mjs`:

```js
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'acorn'

const TV_DIST = 'apps/tv/dist'

/**
 * Parses with an ES2017 grammar. Anything newer is a syntax error, which is
 * exactly the signal we want: a 2020 television would fail the same way, but
 * in a living room instead of in CI.
 */
export function assertEs2017(source, label) {
  try {
    parse(source, { ecmaVersion: 2017, sourceType: 'module' })
  } catch (error) {
    throw new Error(`${label} is not ES2017: ${error.message}`)
  }
}

function jsFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...jsFiles(path))
    else if (entry.name.endsWith('.js')) found.push(path)
  }
  return found
}

function main() {
  const files = jsFiles(TV_DIST)
  if (files.length === 0) {
    throw new Error(`No JavaScript found in ${TV_DIST}. Run the build first.`)
  }
  for (const file of files) {
    assertEs2017(readFileSync(file, 'utf8'), file)
  }
  console.log(`ES2017 syntax check passed for ${files.length} file(s).`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
```

- [ ] **Step 5: Write the size guard**

`budget.json`:

```json
{
  "tvBundleGzipBytes": 120000
}
```

The number is a starting ceiling, not a measurement. Step 7 replaces it with the real figure plus headroom, as the spec requires.

`scripts/check-tv-size.mjs`:

```js
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSizeSync } from 'gzip-size'

const TV_DIST = 'apps/tv/dist'
const budget = JSON.parse(readFileSync('budget.json', 'utf8'))

function assetFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...assetFiles(path))
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.css')) found.push(path)
  }
  return found
}

const files = assetFiles(TV_DIST)
let total = 0
for (const file of files) {
  const size = gzipSizeSync(readFileSync(file))
  total += size
  console.log(`${file}: ${size} B gzipped`)
}

const limit = budget.tvBundleGzipBytes
console.log(`Total: ${total} B gzipped. Budget: ${limit} B.`)

if (total > limit) {
  console.error(`Large-screen bundle is ${total - limit} B over budget.`)
  process.exit(1)
}
```

- [ ] **Step 6: Add the scripts**

Add to the root `package.json` scripts:

```json
{
  "guard:syntax": "node scripts/check-tv-syntax.mjs",
  "guard:size": "node scripts/check-tv-size.mjs",
  "guards": "npm run build && npm run guard:syntax && npm run guard:size"
}
```

- [ ] **Step 7: Measure and set the real budget**

Run: `npm run guards`

Read the printed total. Set `budget.tvBundleGzipBytes` to that total plus roughly 20% headroom, and record the measured figure in the commit message. This is the number the spec left open.

- [ ] **Step 8: Run the guards again and confirm they pass**

Run: `npm run guards`

Expected: both guards pass, exit code 0.

- [ ] **Step 9: Commit**

```bash
git add scripts budget.json package.json package-lock.json
git commit -m "Add large-screen syntax and size guards

The syntax guard parses the built bundle with an ES2017 grammar, so a
feature the target television lacks fails in CI instead of in a living
room. The size budget is set from a measurement, not an estimate."
```

---

### Task 12: Continuous integration and the README

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: every script defined so far.
- Produces: a CI workflow running on every push.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Build and guard the large-screen bundle
        run: npm run guards

  docker:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # Proves the clone-and-run promise on a machine that has nothing
      # installed, which is the only place that promise can be verified.
      - name: Build the image
        run: docker build -t m8:ci .
```

- [ ] **Step 2: Write the README**

`README.md`:

```markdown
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

Milestone 1, in progress. The foundation runs: a table opens on the local
network, phones join by scanning a QR code and appear on the large screen. No
game is playable yet.

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
machine; scan the QR with a phone.

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
| `packages/transport` | The `Transport` seam, plus an in-memory fake. |
| `packages/tokens` | Design tokens shared by both screens. |
| `apps/server` | Wiring: Fastify, Socket.IO, QR. |
| `apps/tv` | The large screen. Vanilla TypeScript, ES2017. |
| `apps/phone` | The phone. React. |
```

- [ ] **Step 3: Verify the workflow file parses**

Run: `npm run guards && npm test && npm run typecheck`

Expected: all pass locally, which is what the workflow runs.

- [ ] **Step 4: Commit and push**

```bash
git add .github README.md
git commit -m "Add continuous integration and README

CI runs typecheck, tests, both large-screen guards and the Docker build, so
the clone-and-run promise is verified on a machine with nothing installed."
git push
```

- [ ] **Step 5: Confirm CI is green**

Open the Actions tab on GitHub. Expected: both jobs pass. If the Docker job
fails, that is the clone-and-run promise being false — fix it before Plan 2.

---

## Self-review notes

**Spec coverage for this plan's slice.** Table code alphabet and shard
character (Task 2, §4.19, §6); server-derived QR target (Task 6, §6);
`core` free of I/O with injected clock and RNG (Tasks 1, 5, §4.9, §7);
`Transport` seam with a fake (Task 4, §4.13); domain events translated by the
server (Tasks 5-6, §8); full-state broadcast, never diffs (Task 6, §8);
protocol version mismatch triggering reload (Tasks 3, 6, §8); the screen having
exactly one outbound message and nothing interactive (Tasks 6-7, §4.3, §10);
ES2017 target and no Tailwind v4 on the large screen (Tasks 7, 11, §4.1,
§4.15); shared design tokens (Task 7, §4.15); token-based participant identity
(Task 5, §5.1); baton migration to the longest-present survivor (Task 5, §4.8);
LAN bind and printed addresses (Tasks 6, 9, §6); native inner loop with Docker
for the artifact (Tasks 9-10, §4.23); named volume for `node_modules` (Task 10,
§4.23); both CI guards (Task 11, §4.1, §4.22); Docker build in CI (Task 12,
§4.23); the real-television smoke test as the risk mitigation (Task 9, §13).

**Deferred to later plans, deliberately:** seats, the catalogue, game loading,
game rules, i18n, the 60-second window, `PAUSED` and `AWAITING_SEAT`. These are
Plans 2-4.

**Known gap accepted for this slice:** `TablePhase` carries only
`awaiting-host` and `choosing-game`, and `TableSnapshot` has no seats. Plan 2
widens both. The protocol version exists so widening is a version bump rather
than a silent break.

---

## The plans that follow

Written when we reach them, each informed by what the previous one taught —
particularly whatever the television reveals in Task 9.

**Plan 2 — Seats, catalogue and the full lifecycle.** The game manifest and
`GameRegistry`; seats created from the chosen game; joining that fills seats and
refuses when full; the baton starting a match once minimum seats are occupied;
the 60-second disconnect window; `PAUSED` and `AWAITING_SEAT`; seat handover to
a newcomer; the screen's tolerance window. Almost entirely `packages/core` on
the fake transport, which is where the design's most interesting tests live.

**Plan 3 — The game contract and tic-tac-toe.** `packages/contract`; the `Match`
class in the platform; rules written with Immer under TDD; `projectTable` and
`projectSeat`; on-demand loading by script injection on the screen and dynamic
import on the phone; contract version checking; the transition animation.

**Plan 4 — Internationalization and finish.** The typed dictionaries for pt-BR
and en with per-device locale detection; the visual identity pass with the
`frontend-design` skill; the README video recorded from the real television and
real phones.
