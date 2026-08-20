import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance } from 'fastify'
import QRCode from 'qrcode'
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

  // The route is `:code.svg`, a parameter with a static suffix in the same
  // segment. Fastify's router (find-my-way) accepts this shape and strips the
  // suffix from the captured parameter, verified directly against this
  // Fastify version before relying on it here.
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

  const transport = new SocketIoTransport(app.server)
  new Session(transport, registry)

  app.addHook('onClose', async () => {
    await transport.close()
  })

  return app
}

export const defaultRoots = {
  tv: fileURLToPath(new URL('../../tv/dist/', import.meta.url)),
  phone: fileURLToPath(new URL('../../phone/dist/', import.meta.url)),
}
