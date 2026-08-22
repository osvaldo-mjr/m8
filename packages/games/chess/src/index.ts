import { fileURLToPath } from 'node:url'

export { manifest } from './manifest.js'

/** Where this game's own assets live. The game names its directory; the
 * platform decides the URL they are published under. */
export const assetsRoot = fileURLToPath(new URL('../assets/', import.meta.url))
