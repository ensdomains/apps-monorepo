import type { Config } from '@wagmi/core'
import type { Address, PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./buildMigrationPlan', () => ({ buildMigrationPlan: vi.fn() }))
vi.mock('./computeMigrationPreflight', () => ({
  computeMigrationPreflight: vi.fn(),
}))

import type { V1Domain } from '@ens-apps/migration'
import { buildMigrationPlan } from './buildMigrationPlan'
import { computeMigrationPreflight } from './computeMigrationPreflight'
import { prepareGraceRenewalMigration } from './prepareGraceRenewalMigration'

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
  vi.mocked(computeMigrationPreflight)
    .mockReset()
    .mockResolvedValue({ skipFetchProfilesPhase: false })
  vi.mocked(buildMigrationPlan).mockReset()
})

describe('prepareGraceRenewalMigration', () => {
  it.each([
    { optedIn: ['expired.eth'], requiresManagerRestoration: true },
    { optedIn: [], requiresManagerRestoration: false },
  ])("keeps the owner's manager restoration choice after renewal: $optedIn", async ({
    optedIn,
    requiresManagerRestoration,
  }) => {
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
  })

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
