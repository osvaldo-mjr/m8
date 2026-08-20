/**
 * Pure parsing for the two places that name the Node major version: `.nvmrc`
 * and the Dockerfile's `ARG NODE_VERSION=<value>` default. Kept separate
 * from disk access so both can be exercised with plain strings.
 */

/** `.nvmrc` holds nothing but the version, plus whatever trailing newline the editor left. */
export function parseNvmrc(contents: string): string {
  return contents.trim()
}

/**
 * Reads the default off `ARG NODE_VERSION=<value>`. Returns `undefined` if
 * the Dockerfile stops declaring that line at all, so the caller can fail
 * loudly instead of comparing against an empty string.
 */
export function parseDockerfileNodeVersion(contents: string): string | undefined {
  return contents.match(/^ARG NODE_VERSION=(\S+)$/m)?.[1]
}
