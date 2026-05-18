import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockL1Client = { chain: { id: 11155111 } }

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockL1Client),
}))

const mockGetNameRegistries = vi.fn()
vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getNameRegistries: mockGetNameRegistries,
}))

const { getNameRegistries } = await import('./useNameRegistryDiscovery')

describe('getNameRegistries', () => {
  beforeEach(() => {
    mockGetNameRegistries.mockClear()
  })

  it('returns registries for 1LD (TLD) name', async () => {
    const mockRegistries = [
      '0x1111111111111111111111111111111111111111', // tld
      '0x0000000000000000000000000000000000000000', // root
    ]
    mockGetNameRegistries.mockResolvedValue(mockRegistries)

    const result = await getNameRegistries({
      name: 'eth',
    })

    expect(result._unsafeUnwrap()).toEqual(mockRegistries)
    expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL1Client, {
      name: 'eth',
    })
  })

  it('returns registries for 2LD name', async () => {
    const mockRegistries = [
      '0x2222222222222222222222222222222222222222', // name
      '0x1111111111111111111111111111111111111111', // tld
      '0x0000000000000000000000000000000000000000', // root
    ]
    mockGetNameRegistries.mockResolvedValue(mockRegistries)

    const result = await getNameRegistries({
      name: 'test.eth',
    })

    expect(result._unsafeUnwrap()).toEqual(mockRegistries)
    expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL1Client, {
      name: 'test.eth',
    })
  })

  it('returns registries for 3LD name', async () => {
    const mockRegistries = [
      '0x3333333333333333333333333333333333333333', // subname
      '0x2222222222222222222222222222222222222222', // name
      '0x1111111111111111111111111111111111111111', // tld
      '0x0000000000000000000000000000000000000000', // root
    ]
    mockGetNameRegistries.mockResolvedValue(mockRegistries)

    const result = await getNameRegistries({
      name: 'sub.test.eth',
    })

    expect(result._unsafeUnwrap()).toEqual(mockRegistries)
    expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL1Client, {
      name: 'sub.test.eth',
    })
  })

  it('returns registries for 4LD name', async () => {
    const mockRegistries = [
      '0x4444444444444444444444444444444444444444', // subsubname
      '0x3333333333333333333333333333333333333333', // subname
      '0x2222222222222222222222222222222222222222', // name
      '0x1111111111111111111111111111111111111111', // tld
      '0x0000000000000000000000000000000000000000', // root
    ]
    mockGetNameRegistries.mockResolvedValue(mockRegistries)

    const result = await getNameRegistries({
      name: 'subsub.sub.test.eth',
    })

    expect(result._unsafeUnwrap()).toEqual(mockRegistries)
    expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL1Client, {
      name: 'subsub.sub.test.eth',
    })
  })
})
