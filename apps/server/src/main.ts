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
    // Not a drain: closing the Socket.IO server force-disconnects every open
    // socket with a "server shutting down" reason, and app.close() stops
    // accepting new HTTP connections at the same time. Any table still open
    // at this point loses its screen and phones outright, rather than being
    // allowed to finish.
    void app.close().then(() => process.exit(0))
  })
}
