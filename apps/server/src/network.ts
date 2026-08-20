import type { NetworkInterfaceInfo } from 'node:os'

export interface LanUrlsResult {
  /** URLs worth printing at boot, in interface-enumeration order. */
  readonly urls: readonly string[]
  /**
   * True when no address on a private range was found, so `urls` is the
   * unfiltered set of every non-internal IPv4 address instead. The caller
   * should say so out loud: a fallback that looks identical to the normal
   * case is a fallback nobody notices.
   */
  readonly usedFallback: boolean
}

/**
 * True for RFC 1918 private ranges (10.0.0.0/8, 172.16.0.0/12,
 * 192.168.0.0/16). Everything else — public addresses and link-local
 * 169.254.0.0/16 alike — is excluded by simply not matching any of them.
 */
function isPrivateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number)
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) return false
  const [a, b] = octets as [number, number, number, number]
  if (a === 10) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

/**
 * Printed at boot so the owner does not have to hunt for the machine address
 * before opening the table on a television.
 *
 * Restricted to private-range addresses: this project's own toolchain
 * (`npm run docker`, WSL2, VPN clients) routinely adds virtual adapters with
 * public or otherwise irrelevant addresses, and a boot log that lists all of
 * them makes it a guess which line to open on the television. When no
 * private-range address exists at all, every non-internal IPv4 address is
 * returned instead of nothing — see `usedFallback`.
 *
 * Note this is a convenience only: the QR code is built from the host the
 * screen used to request the page, so it is correct without any of this.
 */
export function lanUrls(
  port: number,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): LanUrlsResult {
  const candidates: { address: string; url: string }[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      if (entry.family !== 'IPv4') continue
      candidates.push({ address: entry.address, url: `http://${entry.address}:${port}` })
    }
  }

  const privateUrls = candidates.filter((c) => isPrivateIpv4(c.address)).map((c) => c.url)
  if (privateUrls.length > 0) {
    return { urls: privateUrls, usedFallback: false }
  }

  const allUrls = candidates.map((c) => c.url)
  return { urls: allUrls, usedFallback: allUrls.length > 0 }
}
