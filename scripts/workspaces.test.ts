import { describe, expect, it } from 'vitest'
import { expandWorkspacePatterns, lockfileWorkspacePaths } from './workspaces.js'

describe('expandWorkspacePatterns', () => {
  const tree: Record<string, string[]> = {
    packages: ['core', 'protocol'],
    'packages/games': ['tic-tac-toe'],
    apps: ['server'],
  }
  const childrenOf = (directory: string): string[] => tree[directory] ?? []

  it('expands a star pattern into its children', () => {
    expect(expandWorkspacePatterns(['apps/*'], childrenOf)).toEqual(['apps/server'])
  })

  it('expands a nested star pattern, which is where the first game will live', () => {
    expect(expandWorkspacePatterns(['packages/games/*'], childrenOf)).toEqual([
      'packages/games/tic-tac-toe',
    ])
  })

  it('contributes nothing for a parent that does not exist yet', () => {
    expect(expandWorkspacePatterns(['packages/nothing/*'], childrenOf)).toEqual([])
  })

  it('keeps a literal path as it is', () => {
    expect(expandWorkspacePatterns(['apps/server'], childrenOf)).toEqual(['apps/server'])
  })

  it('sorts and de-duplicates across overlapping patterns', () => {
    expect(expandWorkspacePatterns(['apps/*', 'apps/server', 'packages/*'], childrenOf)).toEqual([
      'apps/server',
      'packages/core',
      'packages/protocol',
    ])
  })
})

describe('lockfileWorkspacePaths', () => {
  it('reads the workspace directories off the packages map', () => {
    const lock = { packages: { '': {}, 'apps/server': {}, 'packages/core': {} } }
    expect(lockfileWorkspacePaths(lock)).toEqual(['apps/server', 'packages/core'])
  })

  it('drops nested installs, which are not workspaces', () => {
    const lock = {
      packages: {
        '': {},
        'apps/phone': {},
        'apps/phone/node_modules/tailwindcss': {},
        'node_modules/react': {},
      },
    }
    expect(lockfileWorkspacePaths(lock)).toEqual(['apps/phone'])
  })

  it('is empty for a lockfile with no packages map at all', () => {
    expect(lockfileWorkspacePaths({})).toEqual([])
  })
})
