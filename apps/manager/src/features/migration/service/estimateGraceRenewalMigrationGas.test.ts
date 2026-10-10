import type { Config } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { makeDomain } from './_fixtures'
import { buildMigrationPlan } from './buildMigrationPlan'
import type { MigrationStepDescriptor } from './buildStepDescriptors'
import { classifyNames } from './classifyNames'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { estimateGraceRenewalGas } from './estimateGraceRenewalGas'
import { estimateGraceRenewalMigrationGas } from './estimateGraceRenewalMigrationGas'
import { estimateMigrationGasCost } from './estimateMigrationGasCost'
import type { GraceRenewalItem, GraceRenewalQuote } from './graceRenewal'

vi.mock('./buildMigrationPlan', () => ({ buildMigrationPlan: vi.fn() }))
vi.mock('./computeMigrationPreflight', () => ({
  computeMigrationPreflight: vi.fn(),
}))
vi.mock('./estimateGraceRenewalGas', () => ({
  estimateGraceRenewalGas: vi.fn(),
}))
vi.mock('./estimateMigrationGasCost', () => ({
  estimateMigrationGasCost: vi.fn(),
}))

const OWNER: Address = '0x0000000000000000000000000000000000000001'
const HCA: Address = '0x0000000000000000000000000000000000000002'
const DAY = 86_400n
const NOW = 2_000_000_000n
const TARGET = NOW + 7n * DAY
const EXPIRY = NOW - 30n * DAY
const migrationSteps: readonly MigrationStepDescriptor[] = [
  { type: 'deploy-hca' },
  { type: 'approval', approvalId: 'eth-registry:hca' },
  {
    type: 'atomic-batch',
    index: 0,
    total: 1,
    count: 3,
    migrateCount: 3,
    copyCount: 0,
    roleGrants: [],
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
]
const makeName = (name: string, wrapped = false) =>
  makeDomain({
    id: namehash(name),
    name,
    labelName: name.slice(0, -4),
    labelhash: labelhash(name.slice(0, -4)),
    isWrapped: wrapped,
    registrantId: wrapped ? V1_CONTRACTS.NameWrapper : OWNER,
    ownerId: wrapped ? V1_CONTRACTS.NameWrapper : OWNER,
    wrappedOwnerId: wrapped ? OWNER : null,
    registrationExpiry: EXPIRY.toString(),
    wrappedExpiry: (EXPIRY + 90n * DAY).toString(),
    resolverAddress: null,
  })
const unwrapped = makeName('grace.eth')
const wrapped = makeName('wrapped.eth', true)
const active = {
  ...makeName('active.eth'),
  registration: { expiryDate: (NOW + 100n * DAY).toString() },
  owner: { id: HCA },
}
const makeItem = (domain: GraceRenewalItem['domain']): GraceRenewalItem => ({
  domain,
  label: domain.labelName ?? '',
  registrationExpiry: EXPIRY,
  duration: TARGET - EXPIRY,
  targetExpiry: TARGET,
  amount: 10n,
})
const makeQuote = (): GraceRenewalQuote => ({
  ownerAddress: OWNER,
  chainId: chain.id,
  paymentToken: chain.contracts.usdc.address,
  renewerAddress: chain.contracts.ensEthRenewerV1.address,
  items: [makeItem(unwrapped), makeItem(wrapped)],
  totalAmount: 20n,
  balance: 100n,
  expiresAt: NOW + 300n,
  quotedAtMs: Number(NOW) * 1000,
})
const params = () => ({
  quote: makeQuote(),
  domains: [unwrapped, active, wrapped],
  hcaAddress: HCA,
  publicClient: { chain } as unknown as PublicClient,
  wagmiConfig: {} as Config,
})

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Number(NOW) * 1000)
  vi.mocked(computeMigrationPreflight)
    .mockReset()
    .mockResolvedValue({ skipFetchProfilesPhase: true })
  vi.mocked(buildMigrationPlan)
    .mockReset()
    .mockImplementation(async ({ domains }) => {
      const { classified, ineligible } = classifyNames(domains, OWNER, chain.id)
      return {
        classified,
        ineligible,
        stepDescriptors: migrationSteps,
      } as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>
    })
  vi.mocked(estimateMigrationGasCost).mockReset().mockResolvedValue({
    status: 'ready',
    gasUnits: 1_000n,
    feePerGasWei: 3n,
    feeWei: 3_000n,
    transactionCount: 4,
  })
  vi.mocked(estimateGraceRenewalGas).mockReset().mockResolvedValue({
    gasUnits: 200n,
    transactionCount: 2,
    approvalRequired: true,
  })
})

afterEach(() => vi.restoreAllMocks())

describe('estimateGraceRenewalMigrationGas', () => {
  it.each([
    false,
    true,
  ])('estimates migration after restoring a late-grace reservation (wrapped: %s)', async (isWrapped) => {
    const lateGrace = {
      ...makeName('late.eth', isWrapped),
      registration: { expiryDate: (NOW - 70n * DAY).toString() },
      isUnreserved: true as const,
    }
    const input = params()
    input.domains = [lateGrace]
    input.quote = {
      ...input.quote,
      items: [
        {
          ...makeItem(lateGrace),
          registrationExpiry: NOW - 70n * DAY,
          duration: 77n * DAY,
        },
      ],
    }

    await expect(
      estimateGraceRenewalMigrationGas(input),
    ).resolves.toMatchObject({
      gasUnits: 1_200n,
    })
    expect(lateGrace.isUnreserved).toBe(true)
  })

  it('does not clear an unreserved name when the quote will not renew it', async () => {
    const unreserved = { ...active, isUnreserved: true as const }
    const input = params()
    input.domains = [unreserved]
    input.quote = {
      ...input.quote,
      items: [
        {
          ...makeItem(unreserved),
          registrationExpiry: NOW + 100n * DAY,
          targetExpiry: NOW + 100n * DAY,
          duration: 0n,
          amount: 0n,
        },
      ],
    }

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'every selected name',
    )
  })

  it.each([
    { optedIn: ['grace.eth'], requiresManagerRestoration: true },
    { optedIn: [], requiresManagerRestoration: false },
  ])("estimates with the owner's manager restoration choice: $optedIn", async ({
    optedIn,
    requiresManagerRestoration,
  }) => {
    await estimateGraceRenewalMigrationGas({
      ...params(),
      managerRestorationNames: optedIn,
    })

    expect(computeMigrationPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ requiresManagerRestoration }),
    )
    expect(buildMigrationPlan).toHaveBeenCalledWith(
      expect.objectContaining({ managerRestorationNames: optedIn }),
    )
  })

  it('includes the entire selection and renewal with one fee rate, without exposing a plan', async () => {
    const input = params()
    const result = await estimateGraceRenewalMigrationGas(input)

    expect(result).toEqual({
      gasUnits: 1_200n,
      feeWei: 3_600n,
      transactionCount: 6,
      stepDescriptors: [
        { type: 'renewal-approval' },
        { type: 'renew-grace', count: 2 },
        ...migrationSteps,
      ],
    })
    expect(estimateGraceRenewalGas).toHaveBeenCalledWith({
      quote: input.quote,
      publicClient: input.publicClient,
      signal: undefined,
    })
    const projected = vi.mocked(buildMigrationPlan).mock.calls[0]?.[0].domains
    expect(projected).toEqual([
      { ...unwrapped, registration: { expiryDate: TARGET.toString() } },
      active,
      {
        ...wrapped,
        registration: { expiryDate: TARGET.toString() },
        wrappedDomain: {
          ...wrapped.wrappedDomain,
          expiryDate: (TARGET + 90n * DAY).toString(),
        },
      },
    ])
    expect(computeMigrationPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ domains: projected, eoa: OWNER }),
    )
    expect(unwrapped.registration?.expiryDate).toBe(EXPIRY.toString())
    expect(wrapped.wrappedDomain?.expiryDate).toBe(
      (EXPIRY + 90n * DAY).toString(),
    )
    expect(result.stepDescriptors).toHaveLength(result.transactionCount)
  })

  it('omits the renewal approval request when USDC allowance is sufficient', async () => {
    vi.mocked(estimateGraceRenewalGas).mockResolvedValue({
      gasUnits: 150n,
      transactionCount: 1,
      approvalRequired: false,
    })

    const result = await estimateGraceRenewalMigrationGas(params())

    expect(result).toEqual({
      gasUnits: 1_150n,
      feeWei: 3_450n,
      transactionCount: 5,
      stepDescriptors: [{ type: 'renew-grace', count: 2 }, ...migrationSteps],
    })
    expect(result.stepDescriptors).toHaveLength(result.transactionCount)
  })

  it('counts only names needing an extension in the renewal request', async () => {
    const input = params()
    const renewed = {
      ...unwrapped,
      registration: { expiryDate: TARGET.toString() },
    }
    input.quote = {
      ...input.quote,
      items: [
        {
          ...makeItem(renewed),
          registrationExpiry: TARGET,
          duration: 0n,
          amount: 0n,
        },
        makeItem(wrapped),
      ],
      totalAmount: 10n,
    }

    const result = await estimateGraceRenewalMigrationGas(input)

    expect(result.stepDescriptors).toEqual([
      { type: 'renewal-approval' },
      { type: 'renew-grace', count: 1 },
      ...migrationSteps,
    ])
  })

  it('uses refreshed quote ownership and fuses instead of stale selected domain data', async () => {
    const input = params()
    const refreshed = {
      ...wrapped,
      wrappedDomain: {
        expiryDate: (EXPIRY + 90n * DAY).toString(),
        fuses: 1,
      },
    }
    input.quote = {
      ...input.quote,
      items: [makeItem(unwrapped), makeItem(refreshed)],
    }

    await estimateGraceRenewalMigrationGas(input)

    expect(
      vi.mocked(buildMigrationPlan).mock.calls[0]?.[0].domains[2],
    ).toMatchObject({
      wrappedDomain: { fuses: 1, expiryDate: (TARGET + 90n * DAY).toString() },
    })
  })

  it('keeps authoritative already-renewed domains and adds no renewal transactions', async () => {
    const input = params()
    const renewed = {
      ...unwrapped,
      registration: { expiryDate: TARGET.toString() },
    }
    input.domains = [unwrapped, active]
    input.quote = {
      ...input.quote,
      items: [
        {
          ...makeItem(renewed),
          registrationExpiry: TARGET,
          duration: 0n,
          amount: 0n,
        },
      ],
      totalAmount: 0n,
    }
    vi.mocked(estimateGraceRenewalGas).mockResolvedValue({
      gasUnits: 0n,
      transactionCount: 0,
      approvalRequired: false,
    })

    await expect(estimateGraceRenewalMigrationGas(input)).resolves.toEqual({
      gasUnits: 1_000n,
      feeWei: 3_000n,
      transactionCount: 4,
      stepDescriptors: migrationSteps,
    })
    expect(vi.mocked(buildMigrationPlan).mock.calls[0]?.[0].domains[0]).toBe(
      renewed,
    )
  })

  it('rejects a partial migration plan instead of displaying an incomplete fee', async () => {
    vi.mocked(buildMigrationPlan).mockResolvedValue({
      classified: [{ domain: active }],
    } as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>)

    await expect(estimateGraceRenewalMigrationGas(params())).rejects.toThrow(
      'every selected name',
    )
    expect(estimateMigrationGasCost).not.toHaveBeenCalled()
  })

  it('rejects quotes for names outside the selection before starting RPC work', async () => {
    const input = params()
    input.domains = [active]

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'no longer matches your selection',
    )
    expect(computeMigrationPreflight).not.toHaveBeenCalled()
    expect(estimateGraceRenewalGas).not.toHaveBeenCalled()
  })

  it('rejects duplicate selections', async () => {
    const input = params()
    input.domains = [...input.domains, unwrapped]

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'no longer matches your selection',
    )
  })

  it('rejects a quote belonging to another wallet', async () => {
    const input = params()
    input.quote = { ...input.quote, ownerAddress: HCA }

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'no longer matches your wallet',
    )
  })

  it('rejects an expired quote before starting RPC work', async () => {
    const input = params()
    input.quote = { ...input.quote, expiresAt: NOW }

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'quote expired',
    )
    expect(computeMigrationPreflight).not.toHaveBeenCalled()
    expect(estimateGraceRenewalGas).not.toHaveBeenCalled()
  })

  it('rejects a quote that expires while estimating', async () => {
    vi.mocked(estimateGraceRenewalGas).mockImplementation(async () => {
      vi.mocked(Date.now).mockReturnValue(Number(NOW + 301n) * 1000)
      return { gasUnits: 200n, transactionCount: 2, approvalRequired: true }
    })

    await expect(estimateGraceRenewalMigrationGas(params())).rejects.toThrow(
      'quote expired',
    )
  })

  it('rejects a client on another chain', async () => {
    const input = params()
    input.publicClient = { chain: { id: 1 } } as PublicClient

    await expect(estimateGraceRenewalMigrationGas(input)).rejects.toThrow(
      'migration network',
    )
  })

  it('does not return a partial fee when either estimate fails', async () => {
    vi.mocked(estimateMigrationGasCost).mockResolvedValue({
      status: 'error',
      error: new Error('Migration fee unavailable'),
    })
    await expect(estimateGraceRenewalMigrationGas(params())).rejects.toThrow(
      'Migration fee unavailable',
    )

    vi.mocked(estimateGraceRenewalGas).mockRejectedValue(
      new Error('Renewal fee unavailable'),
    )
    await expect(estimateGraceRenewalMigrationGas(params())).rejects.toThrow(
      'Renewal fee unavailable',
    )
  })

  it('does not estimate after leaving the flow', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      estimateGraceRenewalMigrationGas({
        ...params(),
        signal: controller.signal,
      }),
    ).rejects.toThrow()
    expect(computeMigrationPreflight).not.toHaveBeenCalled()
    expect(estimateGraceRenewalGas).not.toHaveBeenCalled()
  })
})
