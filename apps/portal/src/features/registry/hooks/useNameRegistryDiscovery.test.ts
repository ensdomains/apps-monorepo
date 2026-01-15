import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockL1Client = { chain: { id: 11155111 } }
const mockL2Client = { chain: { id: 123456 } }

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok(mockL1Client),
  safeGetNamechainSepoliaClient: () => ok(mockL2Client),
}))

const mockGetNameRegistries = vi.fn()
vi.mock('@ensdomains/ensjs/public/v2', () => ({
  getNameRegistries: mockGetNameRegistries,
}))

vi.mock('@/lib/constants/registry', () => ({
  l2RegistryFinderAddress: '0xRegistryFinderAddress',
}))

const { getNameRegistries } = await import('./useNameRegistryDiscovery')

describe('getNameRegistries', () => {
  beforeEach(() => {
    mockGetNameRegistries.mockClear()
  })

  describe('sepolia network', () => {
    it('returns registries for 1LD (TLD) name', async () => {
      const mockRegistries = [
        '0x1111111111111111111111111111111111111111', // tld
        '0x0000000000000000000000000000000000000000', // root
      ]
      mockGetNameRegistries.mockResolvedValue(mockRegistries)

      const result = await getNameRegistries({
        name: 'eth',
        network: 'sepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'sepolia',
        protocolVersion: 'ENSv1',
      })
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
        network: 'sepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'sepolia',
        protocolVersion: 'ENSv1',
      })
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
        network: 'sepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'sepolia',
        protocolVersion: 'ENSv1',
      })
      expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL1Client, {
        name: 'sub.test.eth',
      })
    })
  })

  describe('namechainSepolia network', () => {
    it('returns registries for 1LD (TLD) name', async () => {
      const mockRegistries = [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // tld
        '0x0000000000000000000000000000000000000000', // root
      ]
      mockGetNameRegistries.mockResolvedValue(mockRegistries)

      const result = await getNameRegistries({
        name: 'eth',
        network: 'namechainSepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'namechainSepolia',
        protocolVersion: 'ENSv2',
      })
      expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL2Client, {
        name: 'eth',
        address: '0xRegistryFinderAddress',
      })
    })

    it('returns registries for 2LD name', async () => {
      const mockRegistries = [
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', // name
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // tld
        '0x0000000000000000000000000000000000000000', // root
      ]
      mockGetNameRegistries.mockResolvedValue(mockRegistries)

      const result = await getNameRegistries({
        name: 'test.eth',
        network: 'namechainSepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'namechainSepolia',
        protocolVersion: 'ENSv2',
      })
      expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL2Client, {
        name: 'test.eth',
        address: '0xRegistryFinderAddress',
      })
    })

    it('returns registries for 3LD name', async () => {
      const mockRegistries = [
        '0xcccccccccccccccccccccccccccccccccccccccc', // subname
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', // name
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', // tld
        '0x0000000000000000000000000000000000000000', // root
      ]
      mockGetNameRegistries.mockResolvedValue(mockRegistries)

      const result = await getNameRegistries({
        name: 'sub.test.eth',
        network: 'namechainSepolia',
      })

      expect(result._unsafeUnwrap()).toEqual({
        registries: mockRegistries,
        network: 'namechainSepolia',
        protocolVersion: 'ENSv2',
      })
      expect(mockGetNameRegistries).toHaveBeenCalledWith(mockL2Client, {
        name: 'sub.test.eth',
        address: '0xRegistryFinderAddress',
      })
    })
  })
})
