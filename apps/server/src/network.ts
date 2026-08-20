import type { NetworkInterfaceInfo } from 'node:os'

/**
 * Printed at boot so the owner does not have to hunt for the machine address
 * before opening the table on a television.
 *
 * Note this is a convenience only: the QR code is built from the host the
 * screen used to request the page, so it is correct without any of this.
 */
export function lanUrls(
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] {
  const urls: string[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4') continue
      urls.push(`http://${entry.address}:${port}`)
    }
  }
  return urls
}
