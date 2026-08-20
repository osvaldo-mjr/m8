import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
    app = await buildApp({ tvRoot, phoneRoot, seed: 2026 })
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
})

describe('buildApp shutdown', () => {
  it(
    'closes promptly with a client connected',
    async () => {
      const tvRoot = makeFixtureRoot('m8-tv-close-', { 'index.html': '<html></html>' })
      const phoneRoot = makeFixtureRoot('m8-phone-close-', { 'index.html': '<html></html>' })
      const app = await buildApp({ tvRoot, phoneRoot, seed: 1 })

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
