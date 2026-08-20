/**
 * Fails loudly if `.nvmrc` and the Dockerfile's `ARG NODE_VERSION` default
 * disagree. Run by `npm run docker`, right before the value gets baked into
 * an image, since that is the moment drift would otherwise go unnoticed.
 * The same invariant is also asserted in `node-version.test.ts`, so a plain
 * `npm test` catches it too.
 */
import { readFileSync } from 'node:fs'
import { parseDockerfileNodeVersion, parseNvmrc } from './node-version.js'

const nvmrcVersion = parseNvmrc(readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8'))
const dockerfileContents = readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8')
const dockerfileVersion = parseDockerfileNodeVersion(dockerfileContents)

if (dockerfileVersion === undefined) {
  console.error('Dockerfile no longer declares "ARG NODE_VERSION=<value>".')
  process.exit(1)
} else if (dockerfileVersion !== nvmrcVersion) {
  console.error(
    `Node version drift: .nvmrc says ${nvmrcVersion}, but the Dockerfile's ARG NODE_VERSION defaults to ${dockerfileVersion}.`,
  )
  process.exit(1)
} else {
  console.log(`Node version in sync: ${nvmrcVersion} (.nvmrc and Dockerfile agree).`)
}
