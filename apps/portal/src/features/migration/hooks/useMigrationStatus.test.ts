import type { LookupNameInput, NameDetail } from '@ens-apps/bigname'
import { mockNameWrapperExpiry } from '@ens-apps/bigname/postV041.mock'
import { QueryClient } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { labelhash, namehash } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const HOLDER = '0x1111111111111111111111111111111111111111'

const mockDetail = vi.fn()
const mockLookup = vi.fn()
vi.mock('@/lib/bigname', () => ({ bigname: { lookup: mockLookup } }))

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
    registration_status: 'registered',
    // The lease ends 2098-10-31; the top level is the ENSv2 reservation, 62 days on.
    expires_at: '4070908800',
    ens_v1: { expires_at: '4065552000' },
    authority: 'ens_v1',
    ...overrides,
  }) as NameDetail

const fetchStatus = (
  name: string,
  address: typeof HOLDER | undefined = HOLDER,
) =>
  new QueryClient().fetchQuery({
    ...getMigrationStatusQueryOptions({ name, address }),
    retry: false,
  })

describe('getMigrationStatus', () => {
  beforeEach(() => {
    mockDetail.mockReset()
    mockLookup.mockReset()
    mockLookup.mockImplementation(
      async ({ inputs }: { inputs: LookupNameInput[] }) => ({
        data: await Promise.all(
          inputs.map(async (input) => {
            const response = await mockDetail(input.name)
            return {
              kind: 'name',
              input,
              status: response?.data?.status ?? 'not_found',
              record: response?.data,
            }
          }),
        ),
        meta: {},
      }),
    )
    mockRunEligibilityChecks.mockReset()
    mockRunEligibilityChecks.mockImplementation(
      async (_client: unknown, names: unknown[]) => ({
        eligible: names,
        failed: [],
      }),
    )
  })

  it('offers migration for a live ENSv1 name its holder holds', async () => {
    mockDetail.mockImplementation(async (name: string) => ({
      data: detail(name),
      meta: {},
    }))

    await expect(fetchStatus('mine.eth')).resolves.toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unwrapped',
    })
    expect(mockLookup).toHaveBeenCalledWith({
      profile: 'detail',
      inputs: [{ id: 'name', name: 'mine.eth' }],
    })
    expect(mockLookup).toHaveBeenCalledTimes(1)
  })

  // The upgrade banner flags a wrapped name, which is unwrapped on the way.
  it('reports an unlocked NameWrapper token as such', async () => {
    mockDetail.mockImplementation(async (name: string) => ({
      data:
        name === 'eth'
          ? detail(name)
          : detail(name, {
              registration_status: 'wrapped',
              ens_v1: {
                expires_at: '4065552000',
                wrapper_expires_at: '4073328000',
                wrapper_state: 'wrapped',
                wrapper_fuses: { fuses: 0 },
              },
            } as Partial<NameDetail>),
      meta: {},
    }))

    await expect(fetchStatus('wrapped.eth')).resolves.toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unlocked',
    })
    expect(mockLookup).toHaveBeenCalledWith({
      profile: 'detail',
      inputs: [{ id: 'name', name: 'wrapped.eth' }],
    })
  })

  it('batches a wrapped subname and its parent fuses in one request', async () => {
    mockDetail.mockImplementation(async (name: string) => ({
      data: detail(name, {
        registration_status: 'wrapped',
        ens_v1: {
          expires_at: null,
          wrapper_expires_at: '4073328000',
          wrapper_state: 'emancipated',
          wrapper_fuses: {
            ...mockNameWrapperExpiry.ens_v1.wrapper_fuses,
            fuses: name === 'parent.eth' ? 1 : 65536,
            cannot_unwrap: name === 'parent.eth',
            parent_cannot_control: name !== 'parent.eth',
            is_dot_eth: false,
          },
        },
      }),
      meta: {},
    }))
    await expect(fetchStatus('child.parent.eth')).resolves.toMatchObject({
      migratable: true,
      tokenType: 'detached-child',
    })
    expect(mockLookup).toHaveBeenCalledWith({
      profile: 'detail',
      inputs: [
        { id: 'name', name: 'child.parent.eth' },
        { id: 'parent', name: 'parent.eth' },
      ],
    })
    expect(mockLookup).toHaveBeenCalledTimes(1)
  })

  it('treats a name still in the 2017 registry (ens_v0) as ENSv1', async () => {
    mockDetail.mockImplementation(async (name: string) => ({
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
    mockDetail.mockResolvedValue({
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
    mockDetail.mockResolvedValue({
      data: detail('lapsed.eth', {
        registration_status: 'released',
        owner: undefined,
        manager: undefined,
      }),
      meta: {},
    })

    await expect(fetchStatus('lapsed.eth')).resolves.toEqual({
      migratable: false,
    })
  })

  it.each([
    { unresolvable_reason: 'no_live_ens_v2_entry' as const },
    { ens_v1: { expires_at: null } },
  ])('does not offer unavailable .eth registrations or run chain eligibility: %o', async (fields) => {
    mockDetail.mockResolvedValue({
      data: detail('unavailable.eth', fields),
      meta: {},
    })
    await expect(fetchStatus('unavailable.eth')).resolves.toEqual({
      migratable: false,
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
  })

  it('does not offer migration for a name bigname has not indexed', async () => {
    mockDetail.mockResolvedValue(null)

    await expect(fetchStatus('unknown.eth')).resolves.toEqual({
      migratable: false,
    })
  })

  it('evaluates a name-scoped request against the token holder', async () => {
    mockDetail.mockResolvedValue({ data: detail('mine.eth') })
    await expect(
      new QueryClient().fetchQuery(
        getMigrationStatusQueryOptions({ name: 'mine.eth' }),
      ),
    ).resolves.toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unwrapped',
    })
  })

  it('keeps unknown labels in the batch and does not offer migration', async () => {
    const name = `[${'a'.repeat(64)}].parent.eth`
    mockDetail.mockImplementation(async (name: string) => ({
      data: detail(name),
    }))
    await expect(fetchStatus(name)).resolves.toEqual({ migratable: false })
    expect(mockLookup).toHaveBeenCalledWith({
      profile: 'detail',
      inputs: [
        { id: 'name', name },
        { id: 'parent', name: 'parent.eth' },
      ],
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
  })

  it('does not let an unused parent failure hide an unwrapped subname', async () => {
    mockLookup.mockResolvedValue({
      data: [
        {
          kind: 'name',
          input: { id: 'name' },
          status: 'ok',
          record: detail('child.parent.eth'),
        },
        { kind: 'name', input: { id: 'parent' }, status: 'failed' },
      ],
      meta: {},
    })
    await expect(fetchStatus('child.parent.eth')).resolves.toMatchObject({
      migratable: true,
    })
  })

  it.each([
    'failed',
    'stale',
  ])('surfaces a %s parent read when its fuses are needed', async (status) => {
    mockLookup.mockResolvedValue({
      data: [
        {
          kind: 'name',
          input: { id: 'name' },
          status: 'ok',
          record: detail('child.parent.eth', {
            ens_v1: {
              expires_at: null,
              wrapper_expires_at: '4073328000',
              wrapper_fuses: {
                ...mockNameWrapperExpiry.ens_v1.wrapper_fuses,
                fuses: 65536,
              },
            },
          }),
        },
        { kind: 'name', input: { id: 'parent' }, status },
      ],
      meta: {},
    })
    await expect(fetchStatus('child.parent.eth')).rejects.toMatchObject({
      _tag: 'GetMigrationStatusError',
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
    expect(mockLookup).toHaveBeenCalledTimes(1)
  })

  it('surfaces a failed name result instead of caching an ineligible verdict', async () => {
    mockLookup.mockResolvedValue({
      data: [{ kind: 'name', input: { id: 'name' }, status: 'failed' }],
      meta: {},
    })
    await expect(fetchStatus('mine.eth')).rejects.toMatchObject({
      _tag: 'GetMigrationStatusError',
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
  })

  it('surfaces a failed batch request', async () => {
    mockLookup.mockRejectedValue(new Error('request failed'))
    await expect(fetchStatus('mine.eth')).rejects.toMatchObject({
      _tag: 'GetMigrationStatusError',
    })
    expect(mockRunEligibilityChecks).not.toHaveBeenCalled()
  })
})
