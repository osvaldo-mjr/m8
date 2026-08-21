import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { UNSUPPORTED_CSS, assertTvCss, findUnsupportedCss, stripCssComments } from './check-tv-css.mjs'

/**
 * The third guard. The syntax guard parses the JavaScript, the size guard
 * weighs the bytes, and until this one existed nothing looked at the
 * stylesheet at all — which is the one artefact on this screen that contains
 * rules nobody in this repository wrote.
 */
describe('findUnsupportedCss', () => {
  it('passes a stylesheet that stays inside the target', () => {
    expect(findUnsupportedCss('.a{display:flex;margin-right:8px;width:calc(100% - 4px)}')).toEqual([])
  })

  it('rejects the preflight selector that switched preflight off', () => {
    // The actual rule Tailwind v3's preflight emits. `:where()` is Chromium
    // 88 against a floor of 68, and an old set discards the whole rule rather
    // than the part it cannot parse.
    const found = findUnsupportedCss('[hidden]:where(:not([hidden=until-found])){display:none}')
    expect(found.map((item) => item.what)).toContain(':where()')
  })

  it.each([
    ['.a{width:clamp(1px,2vw,3px)}', 'clamp()'],
    ['.a{width:min(50%,10px)}', 'min()'],
    ['.a{width:max(50%,10px)}', 'max()'],
    ['.a:is(.b){color:red}', ':is()'],
    ['.a:has(.b){color:red}', ':has()'],
    ['.a:focus-visible{color:red}', ':focus-visible'],
    ['.a{aspect-ratio:1}', 'aspect-ratio'],
    ['.a{backdrop-filter:blur(2px)}', 'backdrop-filter'],
    ['.a{display:flex;gap:8px}', 'gap'],
    ['.a{row-gap:8px}', 'row-gap'],
    ['.a{column-gap:8px}', 'column-gap'],
    ['.a{position:absolute;inset:0}', 'inset'],
    ['.a{overflow:clip}', 'overflow: clip'],
    ['@layer base{.a{color:red}}', '@layer'],
    ['@container (min-width:1px){.a{color:red}}', '@container'],
    ['@property --x{syntax:"*"}', '@property'],
    ['.a{color:oklch(70% .1 20)}', 'oklch()'],
    ['.a{color:color-mix(in srgb,red,blue)}', 'color-mix()'],
    ['.a{height:50dvh}', 'viewport-relative units (dvh, svh, lvh and their kind)'],
  ])('rejects %s', (source, what) => {
    expect(findUnsupportedCss(source).map((item) => item.what)).toContain(what)
  })

  /**
   * Every one of these is a real string from the stylesheet this guard reads.
   * They are the reason the property matcher anchors to the start of a
   * declaration rather than to whitespace: the custom properties invented so
   * that the television never needs `gap` or `inset` all end in the spelling
   * of the thing they exist to avoid, and a looser guard fails the build on
   * the workaround.
   */
  it.each([
    ':root{--m8-piece-gap:20px;--m8-chip-gap:44px;--m8-row-gap:32px}',
    ':root{--m8-safe-inset:5%}',
    '.a{--tw-ring-inset: }',
    '.m8-people{min-height:calc(var(--m8-disc-size) + var(--m8-row-gap))}',
    '.a{max-width:25%;min-width:0}',
    '.a{grid-template-columns:repeat(2,minmax(0,1fr))}',
    '.a{transform:translate(-50%)}',
    '::backdrop{--tw-blur: }',
    '::-ms-backdrop{--tw-blur: }',
  ])('accepts %s, which is really in the emitted stylesheet', (source) => {
    expect(findUnsupportedCss(source)).toEqual([])
  })

  it('reports every finding, not only the first', () => {
    const found = findUnsupportedCss('.a:is(.b){gap:8px;aspect-ratio:1}')
    expect(found.map((item) => item.what).sort()).toEqual([':is()', 'aspect-ratio', 'gap'])
  })

  it('names the Chromium version each finding needs', () => {
    expect(findUnsupportedCss('.a{gap:8px}')[0]?.since).toBe(84)
  })

  it('finds the constructs it is meant to check', () => {
    // Guards the guard: an empty list would make every assertion above about
    // acceptance vacuous.
    expect(UNSUPPORTED_CSS.length).toBeGreaterThan(0)
  })
})

describe('stripCssComments', () => {
  it('ignores a comment that describes what the stylesheet avoids', () => {
    // Not a nicety. `apps/tv/src/styles.css` explains in prose that it uses
    // no `clamp()`, no `:where()`, no `aspect-ratio` and no `gap`, so a guard
    // that read an unminified stylesheet would fail the build on the very
    // paragraph explaining why the build should pass.
    const source = '/* no clamp(), no :where(), no aspect-ratio, no gap: here */ .a{color:red}'
    expect(stripCssComments(source)).not.toContain('clamp(')
    expect(findUnsupportedCss(source)).toEqual([])
  })
})

describe('assertTvCss', () => {
  it('says nothing about a stylesheet the target can run', () => {
    expect(() => assertTvCss('.a{color:red}', 'ok.css')).not.toThrow()
  })

  it('names the file, the construct and the version it needs', () => {
    expect(() => assertTvCss('.a{gap:8px}', 'bad.css')).toThrow(/bad\.css/)
    expect(() => assertTvCss('.a{gap:8px}', 'bad.css')).toThrow(/gap/)
    expect(() => assertTvCss('.a{gap:8px}', 'bad.css')).toThrow(/Chromium 84/)
  })
})

/**
 * Run as a real subprocess, the way `npm run guard:css` does. The two
 * existing guards are tested this way for a reason worth repeating: a
 * main-module check that can never be true on Windows makes the process exit
 * 0 having inspected nothing, and calling the exported function directly
 * cannot see that. The passing case therefore asserts on stdout, not only on
 * the exit code, because exit 0 with no output is exactly what that bug
 * produces.
 */
describe('the guard script (subprocess)', () => {
  const scriptPath = fileURLToPath(new URL('./check-tv-css.mjs', import.meta.url))
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))

  function runGuard(targetDir?: string) {
    const args = targetDir === undefined ? [scriptPath] : [scriptPath, targetDir]
    return spawnSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8' })
  }

  function makeFixtureDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-css-'))
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content)
    }
    return dir
  }

  it('exits 0 against a stylesheet the target can run, and says how many it read', () => {
    const dir = makeFixtureDir({ 'index.css': '.a{display:flex;margin-right:8px}' })
    try {
      const result = runGuard(dir)
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/CSS check passed for 1 file\(s\)\./)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the target directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm8-tv-css-'))
    rmSync(dir, { recursive: true, force: true })
    const result = runGuard(dir)
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/ENOENT/)
    expect(result.stderr).toContain(dir)
  })

  it('exits non-zero when the target directory exists but has no CSS', () => {
    const dir = makeFixtureDir({})
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/No CSS found/)
      expect(result.stderr).toContain('Run the build first')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exits non-zero on the preflight rule that would come back with preflight', () => {
    const dir = makeFixtureDir({
      'index.css': '[hidden]:where(:not([hidden=until-found])){display:none}',
    })
    try {
      const result = runGuard(dir)
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/:where\(\)/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/**
 * The stylesheet the television is actually sent, checked here as well as in
 * CI. `npm run guards` runs the guard against the built bundle; this reads
 * whatever build is on disk and skips when there is none, so a developer who
 * has built once gets the answer from `npm test` too.
 */
describe('the built stylesheet', () => {
  const repoRoot = fileURLToPath(new URL('..', import.meta.url))
  const distAssets = join(repoRoot, 'apps/tv/dist/assets')

  it('is inside the target, if it has been built', () => {
    let names: string[]
    try {
      names = readFileSync(join(repoRoot, 'apps/tv/dist/index.html'), 'utf8').match(/[\w-]+\.css/g) ?? []
    } catch {
      return // not built here; `npm run guards` is where this is mandatory
    }
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      expect(() => assertTvCss(readFileSync(join(distAssets, name), 'utf8'), name)).not.toThrow()
    }
  })
})
