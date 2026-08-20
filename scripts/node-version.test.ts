import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDockerfileNodeVersion, parseNvmrc } from './node-version.js'

describe('parseNvmrc', () => {
  it('trims the trailing newline editors leave behind', () => {
    expect(parseNvmrc('26\n')).toBe('26')
  })

  it('trims surrounding whitespace generally', () => {
    expect(parseNvmrc('  26  \r\n')).toBe('26')
  })
})

describe('parseDockerfileNodeVersion', () => {
  it('reads the value off the ARG NODE_VERSION default', () => {
    const dockerfile = ['ARG NODE_VERSION=26', 'FROM node:${NODE_VERSION}-alpine AS deps'].join('\n')
    expect(parseDockerfileNodeVersion(dockerfile)).toBe('26')
  })

  it('returns undefined when the Dockerfile stops declaring the ARG', () => {
    expect(parseDockerfileNodeVersion('FROM node:26-alpine\n')).toBeUndefined()
  })

  it('does not match the ARG when it appears mid-line, only at line start', () => {
    const dockerfile = '# see ARG NODE_VERSION=26 above\n'
    expect(parseDockerfileNodeVersion(dockerfile)).toBeUndefined()
  })
})

// The two real files must actually agree — this is what makes the claim
// "the Node version is declared once and cannot drift" true rather than
// aspirational. Runs as part of the normal test suite, not only when
// `npm run docker` is invoked.
describe('.nvmrc and Dockerfile agree on the Node version', () => {
  it('matches the real repository files', () => {
    const nvmrc = parseNvmrc(readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8'))
    const dockerfile = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
    const dockerfileVersion = parseDockerfileNodeVersion(dockerfile)

    expect(dockerfileVersion).toBe(nvmrc)
  })
})
