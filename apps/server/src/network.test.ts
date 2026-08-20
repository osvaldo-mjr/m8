import { describe, expect, it } from 'vitest'
import { lanUrls } from './network.js'

describe('lanUrls', () => {
  it('lists external IPv4 addresses on the 192.168.0.0/16 private range', () => {
    const result = lanUrls(3000, {
      'Wi-Fi': [{ address: '192.168.0.12', family: 'IPv4', internal: false } as never],
    })
    expect(result).toEqual({ urls: ['http://192.168.0.12:3000'], usedFallback: false })
  })

  it('keeps an address on the 10.0.0.0/8 private range', () => {
    const result = lanUrls(3000, {
      Ethernet: [{ address: '10.1.2.3', family: 'IPv4', internal: false } as never],
    })
    expect(result).toEqual({ urls: ['http://10.1.2.3:3000'], usedFallback: false })
  })

  it('keeps an address on the 172.16.0.0/12 private range, including its boundaries', () => {
    const result = lanUrls(3000, {
      'vEthernet (Docker)': [
        { address: '172.16.0.0', family: 'IPv4', internal: false } as never,
        { address: '172.31.255.255', family: 'IPv4', internal: false } as never,
      ],
    })
    expect(result).toEqual({
      urls: ['http://172.16.0.0:3000', 'http://172.31.255.255:3000'],
      usedFallback: false,
    })
  })

  it('drops an address just outside the 172.16.0.0/12 boundaries when a private address is also present', () => {
    const result = lanUrls(3000, {
      'vEthernet (Docker)': [
        { address: '172.15.255.255', family: 'IPv4', internal: false } as never,
        { address: '172.32.0.0', family: 'IPv4', internal: false } as never,
        { address: '192.168.0.12', family: 'IPv4', internal: false } as never,
      ],
    })
    expect(result).toEqual({ urls: ['http://192.168.0.12:3000'], usedFallback: false })
  })

  it('drops a public address when a private address is also present', () => {
    const result = lanUrls(3000, {
      'Wi-Fi': [
        { address: '192.168.0.12', family: 'IPv4', internal: false } as never,
      ],
      Tunnel: [{ address: '54.232.189.113', family: 'IPv4', internal: false } as never],
    })
    expect(result).toEqual({ urls: ['http://192.168.0.12:3000'], usedFallback: false })
  })

  it('drops a link-local (169.254.0.0/16) address when a private address is also present', () => {
    const result = lanUrls(3000, {
      'Wi-Fi': [{ address: '192.168.0.12', family: 'IPv4', internal: false } as never],
      Autoconf: [{ address: '169.254.1.1', family: 'IPv4', internal: false } as never],
    })
    expect(result).toEqual({ urls: ['http://192.168.0.12:3000'], usedFallback: false })
  })

  it('falls back to the unfiltered list when no private-range address exists', () => {
    const result = lanUrls(3000, {
      Tunnel: [{ address: '54.232.189.113', family: 'IPv4', internal: false } as never],
      Autoconf: [{ address: '169.254.1.1', family: 'IPv4', internal: false } as never],
    })
    expect(result).toEqual({
      urls: ['http://54.232.189.113:3000', 'http://169.254.1.1:3000'],
      usedFallback: true,
    })
  })

  it('skips loopback', () => {
    const result = lanUrls(3000, {
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
    })
    expect(result).toEqual({ urls: [], usedFallback: false })
  })

  it('skips IPv6', () => {
    const result = lanUrls(3000, {
      'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false } as never],
    })
    expect(result).toEqual({ urls: [], usedFallback: false })
  })

  it('tolerates an interface with no addresses', () => {
    expect(lanUrls(3000, { Ghost: undefined })).toEqual({ urls: [], usedFallback: false })
  })
})
