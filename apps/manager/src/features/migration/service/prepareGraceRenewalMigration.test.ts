import type { Config } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./buildMigrationPlan', () => ({ buildMigrationPlan: vi.fn() }))
vi.mock('./computeMigrationPreflight', () => ({
  computeMigrationPreflight: vi.fn(),
}))
vi.mock('./subnameRecreation', () => ({
  discoverSubnameRecreation: vi.fn(),
}))

import type { V1Domain } from '@ens-apps/migration'
import { chain } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { makeDomain } from './_fixtures'
import { buildMigrationPlan } from './buildMigrationPlan'
import { classifyNames, groupClassifiedNames } from './classifyNames'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { prepareGraceRenewalMigration } from './prepareGraceRenewalMigration'
import { discoverSubnameRecreation } from './subnameRecreation'

const ownerAddress: Address = '0x0000000000000000000000000000000000000001'
const domain = (name: string, expiry: string) =>
  ({
    id: name,
    name,
    registration: { expiryDate: expiry },
  }) as V1Domain
const expired = domain('expired.eth', '1000')
const renewed = domain('expired.eth', '1000000')
const active = domain('active.eth', '2000000')
const params = {
  domains: [expired, active],
  renewedDomains: [renewed],
  ownerAddress,
  hcaAddress: ownerAddress,
  publicClient: {} as PublicClient,
  wagmiConfig: {} as Config,
}

beforeEach(() => {
  vi.mocked(discoverSubnameRecreation).mockReset()
  vi.mocked(computeMigrationPreflight)
    .mockReset()
    .mockResolvedValue({ skipFetchProfilesPhase: false })
  vi.mocked(buildMigrationPlan).mockReset()
})

describe('prepareGraceRenewalMigration', () => {
  it.each([
    {
      canBatchAtomically: false,
      registrationApprovalPolicy: 'temporary-operator',
    },
    { canBatchAtomically: true, registrationApprovalPolicy: 'per-token' },
  ])(
    'retains the approval policy after renewal when atomic batching is $canBatchAtomically',
    async ({ canBatchAtomically, registrationApprovalPolicy }) => {
      const domains = [
        makeDomain({ name: 'alice.eth' }),
        makeDomain({ name: 'bob.eth' }),
      ]
      const classification = classifyNames(domains, ownerAddress, chain.id)
      vi.mocked(buildMigrationPlan).mockResolvedValue({
        ...classification,
        groups: groupClassifiedNames(classification.classified),
        hcaAddress: ownerAddress,
        hcaDeploymentRequired: false,
        migrationOwner: ownerAddress,
        registryContext: classification.classified,
        preflight: { skipFetchProfilesPhase: false },
        ownedPermRes: null,
        profiles: new Map(),
        atomicBatches: [],
        stepDescriptors: [],
        directRoutes: new Map(),
      })
      await prepareGraceRenewalMigration({
        ...params,
        domains,
        renewedDomains: [],
        canBatchAtomically,
      })
      expect(computeMigrationPreflight).toHaveBeenCalledWith(
        expect.objectContaining({ registrationApprovalPolicy }),
      )
    },
  )

  it.each([
    { scenario: 'a mixed active/grace selection', isWrapped: false },
    { scenario: 'a wrapped grace parent', isWrapped: true },
  ])(
    'rediscovers children from confirmed renewal data when rebuilding $scenario',
    async ({ isWrapped }) => {
      const parent = makeDomain({
        name: 'parent.eth',
        id: namehash('parent.eth'),
        labelName: 'parent',
        labelhash: labelhash('parent'),
        registrationExpiry: isWrapped ? '1000' : '99999999999',
        isWrapped,
        ownerId: isWrapped ? V1_CONTRACTS.NameWrapper : ownerAddress,
        registrantId: isWrapped ? V1_CONTRACTS.NameWrapper : ownerAddress,
      })
      const confirmedParent = {
        ...parent,
        registration: { expiryDate: '88888888888' },
        wrappedDomain: { fuses: 0, expiryDate: '88896664888' },
      }
      const grace = makeDomain({
        name: 'grace.eth',
        id: namehash('grace.eth'),
        labelName: 'grace',
        labelhash: labelhash('grace'),
        registrationExpiry: '1000',
      })
      const confirmedGrace = {
        ...grace,
        registration: { expiryDate: '88888888888' },
      }
      const selected = isWrapped ? [parent] : [grace, parent]
      const renewedDomains = isWrapped ? [confirmedParent] : [confirmedGrace]
      const refreshed = isWrapped ? [confirmedParent] : [confirmedGrace, parent]
      const child = makeDomain({
        name: 'sub.parent.eth',
        id: namehash('sub.parent.eth'),
        labelName: 'sub',
        labelhash: labelhash('sub'),
        parentName: parent.name,
        registrantId: null,
        resolverAddress: null,
      })
      const snapshot = {
        version: 5,
        roots: [parent.name],
        names: [...refreshed, child].map(({ name }) => name),
        blockNumber: '200',
        blockHash: namehash('after-renewal'),
        timestamp: '2000',
        chainId: chain.id,
        inventoryDigest: namehash('refreshed-inventory'),
      } satisfies Awaited<
        ReturnType<typeof discoverSubnameRecreation>
      >['snapshot']
      vi.mocked(discoverSubnameRecreation).mockResolvedValue({
        domains: [...refreshed, child],
        snapshot,
      })
      vi.mocked(buildMigrationPlan).mockImplementation(
        async ({ domains }) =>
          ({
            ...classifyNames([...domains], ownerAddress, chain.id),
          }) as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>,
      )

      const plan = await prepareGraceRenewalMigration({
        ...params,
        domains: selected,
        renewedDomains,
        isSubnameRecreationEnabled: true,
      })

      expect(discoverSubnameRecreation).toHaveBeenCalledExactlyOnceWith({
        domains: refreshed,
        owner: ownerAddress,
        publicClient: params.publicClient,
        signal: undefined,
      })
      expect(buildMigrationPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          domains: [...refreshed, child],
          subnameRecreation: { snapshot },
        }),
      )
      expect(
        vi.mocked(buildMigrationPlan).mock.calls[0]?.[0],
      ).not.toHaveProperty('projectedExpiryNames')
      expect(plan.classified).toContainEqual(
        expect.objectContaining({ action: 'copy', domain: child }),
      )
    },
  )

  it.each([
    { optedIn: ['expired.eth'], requiresManagerRestoration: true },
    { optedIn: [], requiresManagerRestoration: false },
  ])(
    "keeps the owner's manager restoration choice after renewal: $optedIn",
    async ({ optedIn, requiresManagerRestoration }) => {
      vi.mocked(buildMigrationPlan).mockResolvedValue({
        classified: [{ domain: renewed }, { domain: active }],
      } as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>)

      await prepareGraceRenewalMigration({
        ...params,
        managerRestorationNames: optedIn,
      })

      expect(computeMigrationPreflight).toHaveBeenCalledWith(
        expect.objectContaining({ requiresManagerRestoration }),
      )
      expect(buildMigrationPlan).toHaveBeenCalledWith(
        expect.objectContaining({ managerRestorationNames: optedIn }),
      )
    },
  )

  it('uses confirmed chain data for renewed names and retains the rest of the selection', async () => {
    const plan = {
      classified: [{ domain: renewed }, { domain: active }],
    } as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>
    vi.mocked(buildMigrationPlan).mockResolvedValue(plan)
    await expect(prepareGraceRenewalMigration(params)).resolves.toBe(plan)
    expect(computeMigrationPreflight).toHaveBeenCalledWith(
      expect.objectContaining({ domains: [renewed, active] }),
    )
    expect(buildMigrationPlan).toHaveBeenCalledWith(
      expect.objectContaining({ domains: [renewed, active] }),
    )
  })

  it('does not silently continue when a selected name fails migration eligibility after renewal', async () => {
    vi.mocked(buildMigrationPlan).mockResolvedValue({
      classified: [{ domain: active }],
    } as unknown as Awaited<ReturnType<typeof buildMigrationPlan>>)
    await expect(prepareGraceRenewalMigration(params)).rejects.toThrow(
      'some cannot be upgraded',
    )
  })

  it('does not prepare migration after leaving the flow', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      prepareGraceRenewalMigration({ ...params, signal: controller.signal }),
    ).rejects.toThrow()
    expect(computeMigrationPreflight).not.toHaveBeenCalled()
    expect(buildMigrationPlan).not.toHaveBeenCalled()
  })
})
