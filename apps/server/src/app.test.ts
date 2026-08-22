import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { connect, type AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CATALOGUE, coverUrl } from './catalogue.js'
import { buildApp } from './app.js'

/**
 * Exercises the real Fastify app end to end, which the earlier version of
 * this task deliberately avoided because apps/tv/dist and apps/phone/dist
 * did not exist yet. That avoidance is exactly why the route-shadowing bug
 * (Critical 1: a `/:code` route shadowing the static roots) and the
 * shutdown deadlock (Critical 2: onClose queued behind Fastify's own
 * server-closing hook) both reached review instead of being caught here.
 *
 * Fixture directories are created by the test itself — never apps/tv/dist or
 * apps/phone/dist, which still do not exist until Tasks 7 and 8 build them.
 */

function makeFixtureRoot(prefix: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content)
  }
  return dir
}

describe('buildApp routing', () => {
  let tvRoot: string
  let phoneRoot: string
  let app: FastifyInstance

  beforeAll(async () => {
    tvRoot = makeFixtureRoot('m8-tv-', {
      'index.html': '<html><body>tv-index</body></html>',
      'main.js': 'console.log("tv-asset")',
    })
    phoneRoot = makeFixtureRoot('m8-phone-', {
      'index.html': '<html><body>phone-index</body></html>',
    })
    app = await buildApp({ tvRoot, phoneRoot, seed: 2026, logger: false })
  })

  afterAll(async () => {
    await app.close()
    rmSync(tvRoot, { recursive: true, force: true })
    rmSync(phoneRoot, { recursive: true, force: true })
  })

  it('serves the TV index at the root', async () => {
    const res = await app.inject({ method: 'GET', url: '/' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('tv-index')
  })

  it('serves a TV asset by its own path', async () => {
    const res = await app.inject({ method: 'GET', url: '/main.js' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('tv-asset')
  })

  it('serves the phone index for a valid table code', async () => {
    const res = await app.inject({ method: 'GET', url: '/KXTP' })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('phone-index')
  })

  it('404s an invalid single-segment path instead of matching it as a code', async () => {
    const res = await app.inject({ method: 'GET', url: '/not-a-valid-code' })
    expect(res.statusCode).toBe(404)
  })

  it('returns an SVG QR code built from the requesting host', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qr/KXTP.svg',
      headers: { host: 'example.local:4321' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/svg+xml')

    // A QR SVG has no readable text — the target it encodes is only visible
    // by re-rendering the same target and comparing pixel patterns. This
    // proves the requesting host, not a hardcoded address, drove the image.
    const expectedSvg = await QRCode.toString('http://example.local:4321/KXTP', {
      type: 'svg',
      margin: 1,
    })
    expect(res.body).toBe(expectedSvg)
  })

  it('lets the QR image be cached, since the image for a code never changes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/qr/KXTP.svg',
      headers: { host: 'example.local:4321' },
    })

    // Without this the television refetches the QR on every tableState —
    // every join, every rename — and the element people are pointing a
    // camera at blinks.
    expect(res.headers['cache-control']).toContain('immutable')
    expect(res.headers['cache-control']).toMatch(/max-age=\d{5,}/)
  })

  it('serves a game cover', async () => {
    // Derived from the catalogue rather than hard-coded, so this test
    // follows coverUrl if the routing decision it encodes ever changes.
    const manifest = CATALOGUE.find((game) => game.id === 'tic-tac-toe')
    if (manifest === undefined) throw new Error('tic-tac-toe missing from the catalogue')

    const res = await app.inject({ method: 'GET', url: coverUrl(manifest) })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/svg+xml')
  })

  it('serves the phone catalogue with no manual', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/games' })
    expect(res.statusCode).toBe(200)

    const body = JSON.parse(res.body) as Array<{ id: string }>
    expect(body.map((entry) => entry.id).sort()).toEqual([...CATALOGUE.map((game) => game.id)].sort())

    // Structural, not a spot check: the phone entry has no field for manual
    // text at all, so no manual can reach it under any key.
    expect(res.body).not.toContain('manual')
  })

  it('refuses a QR request carrying no Host header rather than encoding one', async () => {
    // HTTP/1.0 permits a request with no Host at all, and `undefined`
    // interpolated into the target would produce a QR encoding
    // `http://undefined/KXTP` — a code that scans and resolves to nothing.
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address() as AddressInfo

    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(address.port, '127.0.0.1', () => {
        socket.write('GET /qr/KXTP.svg HTTP/1.0\r\n\r\n')
      })
      let received = ''
      socket.on('data', (chunk) => {
        received += chunk.toString()
      })
      socket.on('end', () => resolve(received))
      socket.on('error', reject)
    })

    expect(response).toMatch(/^HTTP\/1\.[01] 400/)
    expect(response).not.toContain('svg')
  })
})

describe('buildApp shutdown', () => {
  it(
    'closes promptly with a client connected',
    async () => {
      const tvRoot = makeFixtureRoot('m8-tv-close-', { 'index.html': '<html></html>' })
      const phoneRoot = makeFixtureRoot('m8-phone-close-', { 'index.html': '<html></html>' })
      const app = await buildApp({ tvRoot, phoneRoot, seed: 1, logger: false })

      try {
        await app.listen({ port: 0, host: '127.0.0.1' })
        const address = app.server.address() as AddressInfo

        // Forced to `websocket`: on the default transport list the client is
        // often still on a long-polling connection at the moment `connect`
        // fires, which node:http's server.close() does not wait on. Only an
        // actually-upgraded WebSocket reproduces the deadlock this guards
        // against — confirmed directly: this same test, unforced, passed
        // even against the broken `onClose` hook, because the connection
        // hadn't upgraded yet by the time `app.close()` ran.
        const client: ClientSocket = ioClient(`http://127.0.0.1:${address.port}`, {
          transports: ['websocket'],
        })
        await new Promise<void>((resolve) => client.once('connect', resolve))

        const start = Date.now()
        await app.close()
        const elapsed = Date.now() - start

        // Regression test for the shutdown deadlock: Fastify registers its
        // own server-closing hook internally, after any hook this file adds,
        // and hooks run last-registered-first — so an `onClose` hook here
        // used to queue behind Fastify's, which waits for every open
        // connection (including this upgraded WebSocket) to close on its
        // own. That deadlocked for as long as the socket stayed open,
        // measured at several seconds. `preClose` runs before Fastify closes
        // the server, closing the socket itself instead of waiting on it.
        expect(elapsed).toBeLessThan(2_000)

        client.close()
      } finally {
        rmSync(tvRoot, { recursive: true, force: true })
        rmSync(phoneRoot, { recursive: true, force: true })
      }
    },
    10_000,
  )
})

describe('buildApp logging', () => {
  let tvRoot: string
  let phoneRoot: string

  beforeAll(() => {
    tvRoot = makeFixtureRoot('m8-tv-log-', { 'index.html': '<html></html>' })
    phoneRoot = makeFixtureRoot('m8-phone-log-', { 'index.html': '<html></html>' })
  })

  afterAll(() => {
    rmSync(tvRoot, { recursive: true, force: true })
    rmSync(phoneRoot, { recursive: true, force: true })
  })

  it('logs by default, because a server nobody can see is a server nobody can diagnose', async () => {
    const app = await buildApp({ tvRoot, phoneRoot, seed: 3 })
    try {
      // A real pino instance reports a level; Fastify's no-op logger has none.
      expect(app.log.level).toBe('info')
    } finally {
      await app.close()
    }
  })

  it('can be silenced, so a test suite is not drowned in its own request JSON', async () => {
    const app = await buildApp({ tvRoot, phoneRoot, seed: 3, logger: false })
    try {
      expect(app.log.level).toBeUndefined()
      // Still a usable logger, not a missing one: app.log is called from
      // inside buildApp itself, so silencing must not mean removing.
      expect(typeof app.log.info).toBe('function')
    } finally {
      await app.close()
    }
  })
})
