import type { NameDetail } from '@ens-apps/bigname'
import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { labelhash, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HOLDER = '0x1111111111111111111111111111111111111111'

const mockGetName = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { getName: mockGetName } }))

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: () => ok({ chain: { id: 11155111 } }),
}))

const mockRunEligibilityChecks = vi.fn()
vi.mock('@ens-apps/migration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/migration')>()),
  runEligibilityChecks: (...args: unknown[]) =>
    mockRunEligibilityChecks(...args),
}))

const { getMigrationStatusQueryOptions } = await import('./useMigrationStatus')

const detail = (name: string, overrides: Partial<NameDetail> = {}) =>
  ({
    name,
    display_name: name,
    namespace: 'ens',
    namehash: namehash(name),
    status: 'ok',
    token_id: BigInt(labelhash(name.split('.')[0] as string)).toString(),
    owner: HOLDER,
    manager: HOLDER,
    registrant: HOLDER,
    registration_status: 'registered',
    expires_at: '2099-01-01T00:00:00Z',
    authority: 'ens_v1',
    ...overrides,
  }) as NameDetail

const fetchStatus = (name: string) =>
  new QueryClient().fetchQuery(
    getMigrationStatusQueryOptions({ name, address: HOLDER }),
  )

describe('getMigrationStatus', () => {
  beforeEach(() => {
    mockGetName.mockReset()
    mockRunEligibilityChecks.mockReset()
    mockRunEligibilityChecks.mockImplementation(
      async (_client: unknown, names: unknown[]) => ({
        eligible: names,
        failed: [],
      }),
    )
  })

  it('offers migration for a live ENSv1 name its holder holds', async () => {
    mockGetName.mockImplementation(async (name: string) => ({
      data: detail(name),
      meta: {},
    }))

    await expect(fetchStatus('mine.eth')).resolves.toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unwrapped',
    })
    expect(mockGetName).toHaveBeenCalledWith('mine.eth')
    expect(mockGetName).toHaveBeenCalledWith('eth')
  })

  // The upgrade banner flags a wrapped name, which is unwrapped on the way.
  it('reports an unlocked NameWrapper token as such', async () => {
    mockGetName.mockImplementation(async (name: string) => ({
      data:
        name === 'eth'
          ? detail(name)
          : detail(name, {
              registration_status: 'wrapped',
              wrapper_state: 'wrapped',
              wrapper_fuses: { fuses: 0 },
            } as Partial<NameDetail>),
      meta: {},
    }))

    await expect(fetchStatus('wrapped.eth')).resolves.toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unlocked',
    })
  })

  it('treats a name still in the 2017 registry (ens_v0) as ENSv1', async () => {
    mockGetName.mockImplementation(async (name: string) => ({
      data: detail(name, { authority: 'ens_v0' }),
      meta: {},
    }))

    await expect(fetchStatus('old.eth')).resolves.toMatchObject({
      migratable: true,
    })
  })

  // A released ENSv2 registration still owns the name while an old ENSv1
  // lease is live, and a migrated name is ENSv2 already.
  it('does not offer migration for an ENSv2 name', async () => {
    mockGetName.mockResolvedValue({
      data: detail('moved.eth', {
        authority: 'ens_v2',
        registration_status: 'released',
      }),
      meta: {},
    })

    await expect(fetchStatus('moved.eth')).resolves.toEqual({
      migratable: false,
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
  })

  it('does not offer migration for a released ENSv1 lease', async () => {
    mockGetName.mockResolvedValue({
      data: detail('lapsed.eth', {
        registration_status: 'released',
        owner: undefined,
        manager: undefined,
        registrant: undefined,
      }),
      meta: {},
    })

    await expect(fetchStatus('lapsed.eth')).resolves.toEqual({
      migratable: false,
    })
  })

  it('does not offer migration for a name bigname has not indexed', async () => {
    mockGetName.mockResolvedValue(null)

    await expect(fetchStatus('unknown.eth')).resolves.toEqual({
      migratable: false,
    })
  })
})
