import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * These run the guard as a real subprocess, the way `npm run guard:size`
 * does. `check-tv-size.mjs` had the same main-module bug as the syntax
 * guard — `import.meta.url === \`file://${process.argv[1]}\`` never matches
 * on Windows, so `main()` silently never ran and the process exited 0 having
 * measured nothing. A subprocess test asserting on real output is what
 * catches that; calling internal functions in-process would skip the CLI
 * entrypoint entirely and miss it.
 *
 * The "passes" case asserts on stdout content (a byte total), not just exit
 * code 0, for the same reason: exit 0 with no output is exactly what the
 * broken entrypoint produced.
 */
describe('the guard script (subprocess)', () => {
  const scriptPath = fileURLToPath(new URL('./check-tv-size.mjs', import.meta.url))
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))

  function runGuard(targetDir?: string) {
    const args = targetDir === undefined ? [scriptPath] : [scriptPath, targetDir]
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  }

  function makeFixtureDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-size-'))
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content)
    }
    return dir
  }

  it('exits 0 against a valid build and reports the gzipped byte total', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")', 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir)
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/Total: \d+ B gzipped\. Budget: \d+ B\./)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the target directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-size-'))
    rmSync(dir, { recursive: true, force: true }) // now a guaranteed-unused, guaranteed-missing path
    const result = runGuard(dir)
    expect(result.status).not.toBe(0)
    // Depend on output, not only the exit code, so a crash for an unrelated
    // reason cannot masquerade as correctly rejecting a missing build.
    expect(result.stderr).toMatch(/ENOENT/)
    expect(result.stderr).toContain(dir)
  })

  it('exits non-zero when the target directory exists but is empty', () => {
    const dir = makeFixtureDir({})
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript and no CSS found/)
      expect(result.stderr).toContain('Run the build first')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when CSS built but JavaScript did not — one asset kind is not a build', () => {
    const dir = makeFixtureDir({ 'main.css': 'body { color: red }' })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No JavaScript found/)
      // Must not also claim CSS is missing — CSS is right there.
      expect(result.stderr).not.toMatch(/No CSS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when JavaScript built but CSS did not', () => {
    const dir = makeFixtureDir({ 'main.js': 'console.log("tv")' })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No CSS found/)
      expect(result.stderr).not.toMatch(/No JavaScript/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
