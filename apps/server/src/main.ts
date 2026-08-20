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
    // Draining, not killing: deploys bring up a new instance and stop routing
    // new connections here, so this only fires once the table is empty.
    void app.close().then(() => process.exit(0))
  })
}
