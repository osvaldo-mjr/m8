import { describe, expect, it } from 'vitest'
import { lanUrls } from './network.js'

describe('lanUrls', () => {
  it('lists external IPv4 addresses', () => {
    const urls = lanUrls(3000, {
      'Wi-Fi': [
        { address: '192.168.0.12', family: 'IPv4', internal: false } as never,
      ],
    })
    expect(urls).toEqual(['http://192.168.0.12:3000'])
  })

  it('skips loopback', () => {
    const urls = lanUrls(3000, {
      Loopback: [{ address: '127.0.0.1', family: 'IPv4', internal: true } as never],
    })
    expect(urls).toEqual([])
  })

  it('skips IPv6', () => {
    const urls = lanUrls(3000, {
      'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false } as never],
    })
    expect(urls).toEqual([])
  })

  it('tolerates an interface with no addresses', () => {
    expect(lanUrls(3000, { Ghost: undefined })).toEqual([])
  })
})
