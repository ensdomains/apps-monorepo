import type { Config as WagmiConfig } from '@wagmi/core'
import { err, ok } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkSCAApprovals } from './checkSCAApprovals'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { findExistingPermRes } from './ensureOwnedPermRes'
import type { V1Domain } from './v1SubgraphClient'
import { getV1ProfileKeys } from './v1SubgraphClient'

vi.mock('./ensureOwnedPermRes', () => ({
  findExistingPermRes: vi.fn(),
}))
vi.mock('./v1SubgraphClient', async (importActual) => {
  const actual = await importActual<typeof import('./v1SubgraphClient')>()
  return {
    ...actual,
    getV1ProfileKeys: vi.fn(),
  }
})
vi.mock('./checkSCAApprovals', async (importActual) => {
  const actual = await importActual<typeof import('./checkSCAApprovals')>()
  return {
    ...actual,
    checkSCAApprovals: vi.fn(),
  }
})

const findExistingPermResMock = vi.mocked(findExistingPermRes)
const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)
const checkSCAApprovalsMock = vi.mocked(checkSCAApprovals)

const EOA: Address = '0x0000000000000000000000000000000000000001'
const SCA: Address = '0x0000000000000000000000000000000000000002'
const EXISTING_PERMRES: Address = '0x00000000000000000000000000000000000000f0'

const wagmiConfig = {} as WagmiConfig
const publicClient = {} as PublicClient

type DomainOverrides = {
  id?: string
  name?: string
  labelName?: string | null
  parentName?: string | null
  parentFuses?: number | null
  registrantId?: string | null
  wrappedOwnerId?: string | null
  resolverAddress?: string | null
  isWrapped?: boolean
  fuses?: number
  ownerId?: string
}

const RESOLVER: Address = '0x000000000000000000000000000000000000dddd'

const makeDomain = (o: DomainOverrides = {}): V1Domain => {
  const isWrapped = o.isWrapped ?? false
  const parent: V1Domain['parent'] =
    o.parentName === null
      ? null
      : {
          name: o.parentName ?? 'eth',
          id: '0xparent',
          wrappedDomain:
            o.parentFuses === null || o.parentFuses === undefined
              ? null
              : { fuses: o.parentFuses },
        }
  return {
    id: o.id ?? '0xabc',
    labelName: o.labelName === undefined ? 'alice' : o.labelName,
    labelhash: '0xlabelhash',
    name: o.name ?? 'alice.eth',
    isMigrated: false,
    createdAt: '0',
    resolvedAddress: null,
    resolver:
      o.resolverAddress === null
        ? null
        : { id: 'r', address: o.resolverAddress ?? RESOLVER },
    owner: { id: o.ownerId ?? EOA },
    registrant: o.registrantId === null ? null : { id: o.registrantId ?? EOA },
    wrappedOwner:
      o.wrappedOwnerId === null
        ? null
        : isWrapped
          ? { id: o.wrappedOwnerId ?? EOA }
          : null,
    parent,
    registration: null,
    wrappedDomain: isWrapped
      ? { expiryDate: '100', fuses: o.fuses ?? 0 }
      : null,
  }
}

const bothApproved = {
  baseRegistrarApproved: true,
  nameWrapperApproved: true,
}

beforeEach(() => {
  findExistingPermResMock.mockReset()
  getV1ProfileKeysMock.mockReset()
  checkSCAApprovalsMock.mockReset()
})

describe('computeMigrationPreflight', () => {
  describe('preExistingOwnedPermRes', () => {
    it('skips findExistingPermRes when no name routes to owned-permres', async () => {
      const domain = makeDomain({ resolverAddress: RESOLVER })
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.preExistingOwnedPermRes).toBeNull()
      expect(findExistingPermResMock).not.toHaveBeenCalled()
    })

    it('returns the existing permres when findExistingPermRes resolves to one', async () => {
      const domain = makeDomain({ resolverAddress: null })
      findExistingPermResMock.mockResolvedValueOnce(EXISTING_PERMRES)
      getV1ProfileKeysMock.mockReturnValueOnce(ok([]) as never)
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.preExistingOwnedPermRes).toBe(EXISTING_PERMRES)
    })
  })

  describe('skipApprovalPhase', () => {
    it('is true when both BaseRegistrar and NameWrapper approvals are already granted', async () => {
      const domain = makeDomain({ resolverAddress: RESOLVER })
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipApprovalPhase).toBe(true)
    })

    it('is true when only unwrapped names exist and BaseRegistrar is approved (wrapped approval is irrelevant)', async () => {
      const domain = makeDomain({ resolverAddress: RESOLVER })
      checkSCAApprovalsMock.mockResolvedValueOnce({
        baseRegistrarApproved: true,
        nameWrapperApproved: false,
      })

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipApprovalPhase).toBe(true)
    })

    it('is false when BaseRegistrar is not approved and unwrapped names are present', async () => {
      const domain = makeDomain({ resolverAddress: RESOLVER })
      checkSCAApprovalsMock.mockResolvedValueOnce({
        baseRegistrarApproved: false,
        nameWrapperApproved: true,
      })

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipApprovalPhase).toBe(false)
    })

    it('is false when NameWrapper is not approved and wrapped names are present', async () => {
      const wrapped = makeDomain({
        isWrapped: true,
        resolverAddress: RESOLVER,
      })
      checkSCAApprovalsMock.mockResolvedValueOnce({
        baseRegistrarApproved: true,
        nameWrapperApproved: false,
      })

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [wrapped],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipApprovalPhase).toBe(false)
    })
  })

  describe('skipFetchProfilesPhase', () => {
    it('is true when no name routes to owned-permres', async () => {
      const domain = makeDomain({ resolverAddress: RESOLVER })
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipFetchProfilesPhase).toBe(true)
      expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
    })

    it('is true when all profile keys are empty', async () => {
      const domain = makeDomain({ resolverAddress: null })
      findExistingPermResMock.mockResolvedValueOnce(null)
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)
      getV1ProfileKeysMock.mockReturnValueOnce(
        ok([{ id: '0xabc', texts: [], coinTypes: [] }]) as never,
      )

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipFetchProfilesPhase).toBe(true)
    })

    it('is false when any profile has at least one text or coin type', async () => {
      const domain = makeDomain({ resolverAddress: null })
      findExistingPermResMock.mockResolvedValueOnce(null)
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)
      getV1ProfileKeysMock.mockReturnValueOnce(
        ok([{ id: '0xabc', texts: ['email'], coinTypes: [] }]) as never,
      )

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipFetchProfilesPhase).toBe(false)
    })

    it('defaults to false when the subgraph query returns an Err', async () => {
      const domain = makeDomain({ resolverAddress: null })
      findExistingPermResMock.mockResolvedValueOnce(null)
      checkSCAApprovalsMock.mockResolvedValueOnce(bothApproved)
      getV1ProfileKeysMock.mockReturnValueOnce(
        err(new Error('subgraph down')) as never,
      )

      const result = await computeMigrationPreflight({
        eoa: EOA,
        scaAddress: SCA,
        domains: [domain],
        wagmiConfig,
        publicClient,
      })

      expect(result.skipFetchProfilesPhase).toBe(false)
    })
  })
})
