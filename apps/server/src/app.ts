import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
import { TableRegistry, createRng, normalizeTableCode } from '@m8/core'
import { SystemClock } from './clock.js'
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

  // The route is `:code.svg`, a parameter with a static suffix in the same
  // segment. Fastify's router (find-my-way) accepts this shape and strips the
  // suffix from the captured parameter, verified directly against this
  // Fastify version before relying on it here.
  app.get<{ Params: { code: string } }>('/qr/:code.svg', async (request, reply) => {
    const code = normalizeTableCode(request.params.code)
    if (code === null) return reply.code(404).send()

    // Built from the host the screen used, so it can never say localhost.
    // Without that header there is no address to point a phone at, and an
    // interpolated `undefined` would produce a QR encoding `http://undefined/`
    // — a code that scans, resolves to nothing, and looks like the phone's
    // fault. This is the one element on the television that must work, so a
    // request that cannot produce a correct one is refused outright.
    const host = request.headers.host
    if (host === undefined || host === '') return reply.code(400).send()

    const target = `${request.protocol}://${host}/${code}`
    const svg = await QRCode.toString(target, { type: 'svg', margin: 1 })
    return reply
      .type('image/svg+xml')
      // The image for a given code never changes, and a `tableState` arrives
      // every time anyone joins or renames. Without this the television
      // refetches the QR on each one.
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(svg)
  })

  // Not a route: `@fastify/static`'s wildcard is registered at `/`, and
  // find-my-way ranks a parametric route (`/:code`) above that wildcard, so
  // a literal `/:code` route here would capture every single-segment path —
  // `/`, `/index.html`, `/main.js` — before the static plugin ever saw the
  // request. Verified directly against this Fastify version and real static
  // fixtures before relying on it: with a `/:code` route present, none of
  // the large-screen's own assets resolved. Static assets must be given the
  // chance to match first; only a path that matched nothing is worth testing
  // against the code alphabet.
  app.setNotFoundHandler(async (request, reply) => {
    const candidate = request.url.split('?')[0]?.replace(/^\/+|\/+$/g, '') ?? ''
    const code = normalizeTableCode(candidate)
    if (code === null) return reply.code(404).send()
    return reply.sendFile('index.html', options.phoneRoot)
  })

  // Socket.IO answers its own requests before Fastify's router, so nothing
  // else in the log reveals whether a device is on WebSocket or fell back to
  // long polling. The television smoke test asks the operator for exactly that.
  const transport = new SocketIoTransport(app.server, (negotiation) => {
    app.log.info(negotiation, 'socket transport negotiated')
  })
  new Session(transport, registry)

  // Fastify's own server-closing hook is registered internally at `preReady`
  // and hooks run last-registered-first, so an `onClose` hook added here
  // would queue behind it — deadlocking `app.close()` for as long as any
  // upgraded WebSocket stays open, since Fastify's hook waits for the
  // underlying server to close first. `preClose` runs before Fastify closes
  // the server, which is where socket teardown belongs.
  app.addHook('preClose', async () => {
    await transport.close()
  })

  return app
}

export const defaultRoots = {
  tv: fileURLToPath(new URL('../../tv/dist/', import.meta.url)),
  phone: fileURLToPath(new URL('../../phone/dist/', import.meta.url)),
}
