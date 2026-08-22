import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseJsonc } from './jsonc.js'
import { statesNumber, uncoveredWorkspaces } from './readme.js'
import { expandWorkspacePatterns } from './workspaces.js'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')

function childrenOf(directory: string): string[] {
  const absolute = join(repoRoot, directory)
  if (!existsSync(absolute)) return []
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
}

const manifest = parseJsonc(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  workspaces?: string[]
  scripts?: Record<string, string>
}

const patterns = manifest.workspaces ?? []
const workspaces = expandWorkspacePatterns(patterns, childrenOf).filter((workspace) =>
  existsSync(join(repoRoot, workspace, 'package.json')),
)

describe('the README layout table', () => {
  /**
   * `packages/contract` and the four game workspaces were the most interesting
   * thing the catalogue plan built — the boundary that keeps the platform from
   * ever learning what a game is — and the table that exists to explain the
   * architecture did not mention any of them. Nothing said so, because nothing
   * was looking.
   */
  it('accounts for every workspace the repository declares', () => {
    expect(uncoveredWorkspaces(readme, workspaces, patterns)).toEqual([])
  })

  it('has workspaces to check in the first place', () => {
    // Guards the guard: an empty list would satisfy the check above while
    // proving nothing at all.
    expect(workspaces.length).toBeGreaterThan(5)
  })
})

describe('the README build guards', () => {
  /**
   * The README described three guards after a fourth had shipped. Naming them
   * is more useful to a reader than counting them, and it is the half that can
   * be held true: a guard added without a word here now fails.
   */
  it('names every guard the repository runs', () => {
    const guards = Object.keys(manifest.scripts ?? {}).filter((name) => name.startsWith('guard:'))

    expect(guards.length).toBeGreaterThan(0)
    for (const guard of guards) {
      expect(readme).toContain(guard)
    }
  })
})

describe('the README bundle budget', () => {
  /**
   * The budget, not a measurement of the moment. The figure the README used to
   * quote was whatever the bundle happened to weigh the week it was written,
   * which nothing could keep true and which was wrong within one plan. The
   * budget is a decision, it lives in `budget.json`, and `guard:size` fails
   * the build when it is exceeded — so it is worth stating, and this is what
   * keeps the stated one and the enforced one the same number.
   */
  it('quotes the budget the size guard actually enforces', () => {
    const budget = JSON.parse(readFileSync(join(repoRoot, 'budget.json'), 'utf8')) as {
      tvBundleTransferBytes: number
    }

    expect(statesNumber(readme, budget.tvBundleTransferBytes)).toBe(true)
  })
})

describe('uncoveredWorkspaces', () => {
  it('accepts a workspace the table names outright', () => {
    expect(uncoveredWorkspaces('`packages/core` | The domain.', ['packages/core'], [])).toEqual([])
  })

  it('reports a workspace nothing in the table mentions', () => {
    expect(uncoveredWorkspaces('`packages/core`', ['packages/contract'], [])).toEqual([
      'packages/contract',
    ])
  })

  it('accepts a family of workspaces covered by the pattern that declares them', () => {
    expect(
      uncoveredWorkspaces('`packages/games/*` | One workspace per game.', ['packages/games/chess'], [
        'packages/games/*',
      ]),
    ).toEqual([])
  })

  it('does not let a pattern the table never mentions cover anything', () => {
    expect(
      uncoveredWorkspaces('nothing here', ['packages/games/chess'], ['packages/games/*']),
    ).toEqual(['packages/games/chess'])
  })

  it('does not let a pattern cover a workspace outside it', () => {
    expect(uncoveredWorkspaces('`packages/games/*`', ['apps/server'], ['packages/games/*'])).toEqual([
      'apps/server',
    ])
  })
})

describe('statesNumber', () => {
  it('finds the number written as the machine holds it', () => {
    expect(statesNumber('under 42000 bytes', 42000)).toBe(true)
  })

  it('finds the number written as a sentence reads it', () => {
    expect(statesNumber('under a 42,000-byte budget', 42000)).toBe(true)
  })

  it('is not satisfied by a different number that merely contains it', () => {
    expect(statesNumber('142,000 bytes', 42000)).toBe(false)
    expect(statesNumber('420000 bytes', 42000)).toBe(false)
  })

  it('is not satisfied by a prefix of it', () => {
    expect(statesNumber('4200 bytes', 42000)).toBe(false)
  })
})
