import type { Config as WagmiConfig } from '@wagmi/core'
import { err, ok, type Result } from 'neverthrow'
import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  OWNER as EOA,
  makeDomain,
  DEFAULT_RESOLVER as RESOLVER,
} from './_fixtures'
import { checkSCAApprovals } from './checkSCAApprovals'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { findExistingPermRes } from './ensureOwnedPermRes'
import { getV1ProfileKeys } from './v1SubgraphClient'

vi.mock('./ensureOwnedPermRes', () => ({
  findExistingPermRes: vi.fn(),
}))
vi.mock('./v1SubgraphClient', async (importActual) => ({
  ...(await importActual<typeof import('./v1SubgraphClient')>()),
  getV1ProfileKeys: vi.fn(),
}))
vi.mock('./checkSCAApprovals', async (importActual) => ({
  ...(await importActual<typeof import('./checkSCAApprovals')>()),
  checkSCAApprovals: vi.fn(),
}))

const findExistingPermResMock = vi.mocked(findExistingPermRes)
const getV1ProfileKeysMock = vi.mocked(getV1ProfileKeys)
const checkSCAApprovalsMock = vi.mocked(checkSCAApprovals)

const SCA: Address = '0x0000000000000000000000000000000000000002'
const EXISTING_PERMRES: Address = '0x00000000000000000000000000000000000000f0'

const run = (
  opts: {
    domain?: Parameters<typeof makeDomain>[0]
    approvals?: { baseRegistrarApproved: boolean; nameWrapperApproved: boolean }
    permRes?: Address | null
    profileKeys?: Result<unknown, unknown>
  } = {},
) => {
  checkSCAApprovalsMock.mockResolvedValueOnce(
    opts.approvals ?? {
      baseRegistrarApproved: true,
      nameWrapperApproved: true,
    },
  )
  if (opts.permRes !== undefined) {
    findExistingPermResMock.mockResolvedValueOnce(opts.permRes)
  }
  if (opts.profileKeys !== undefined) {
    getV1ProfileKeysMock.mockReturnValueOnce(opts.profileKeys as never)
  }
  return computeMigrationPreflight({
    eoa: EOA,
    scaAddress: SCA,
    domains: [makeDomain({ resolverAddress: RESOLVER, ...opts.domain })],
    wagmiConfig: {} as WagmiConfig,
    publicClient: {} as PublicClient,
  })
}

beforeEach(() => {
  findExistingPermResMock.mockReset()
  getV1ProfileKeysMock.mockReset()
  checkSCAApprovalsMock.mockReset()
})

describe('computeMigrationPreflight — preExistingOwnedPermRes', () => {
  it('skips findExistingPermRes when no name routes to owned-permres', async () => {
    const result = await run()
    expect(result.preExistingOwnedPermRes).toBeNull()
    expect(findExistingPermResMock).not.toHaveBeenCalled()
  })

  it('returns the existing permres when findExistingPermRes resolves to one', async () => {
    const result = await run({
      domain: { resolverAddress: null },
      permRes: EXISTING_PERMRES,
      profileKeys: ok([]),
    })
    expect(result.preExistingOwnedPermRes).toBe(EXISTING_PERMRES)
  })
})

describe('computeMigrationPreflight — skipApprovalPhase', () => {
  it.each([
    [
      'both approvals granted',
      { baseRegistrarApproved: true, nameWrapperApproved: true },
      { isWrapped: false },
      true,
    ],
    [
      'only unwrapped + BaseRegistrar approved (wrapped irrelevant)',
      { baseRegistrarApproved: true, nameWrapperApproved: false },
      { isWrapped: false },
      true,
    ],
    [
      'BaseRegistrar not approved and unwrapped present',
      { baseRegistrarApproved: false, nameWrapperApproved: true },
      { isWrapped: false },
      false,
    ],
    [
      'NameWrapper not approved and wrapped present',
      { baseRegistrarApproved: true, nameWrapperApproved: false },
      { isWrapped: true },
      false,
    ],
  ] as const)('is %s → %s', async (_, approvals, domain, expected) => {
    const result = await run({
      domain: { ...domain, resolverAddress: RESOLVER },
      approvals,
    })
    expect(result.skipApprovalPhase).toBe(expected)
  })
})

describe('computeMigrationPreflight — skipFetchProfilesPhase', () => {
  it('is true when no name routes to owned-permres', async () => {
    const result = await run()
    expect(result.skipFetchProfilesPhase).toBe(true)
    expect(getV1ProfileKeysMock).not.toHaveBeenCalled()
  })

  it('is true when all profile keys are empty', async () => {
    const result = await run({
      domain: { resolverAddress: null },
      permRes: null,
      profileKeys: ok([{ id: '0xabc', texts: [], coinTypes: [] }]),
    })
    expect(result.skipFetchProfilesPhase).toBe(true)
  })

  it('is false when any profile has at least one text or coin type', async () => {
    const result = await run({
      domain: { resolverAddress: null },
      permRes: null,
      profileKeys: ok([{ id: '0xabc', texts: ['email'], coinTypes: [] }]),
    })
    expect(result.skipFetchProfilesPhase).toBe(false)
  })

  it('defaults to false when the subgraph query returns an Err', async () => {
    const result = await run({
      domain: { resolverAddress: null },
      permRes: null,
      profileKeys: err(new Error('subgraph down')),
    })
    expect(result.skipFetchProfilesPhase).toBe(false)
  })
})
