import type { LookupRecord, LookupResult } from '@ens-apps/indexer/bigname'
import { BignameError } from '@ens-apps/indexer/bigname'
import { runEligibilityChecks } from '@ens-apps/migration'
import { QueryClient } from '@tanstack/react-query'
import { errAsync, ok, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getMigrationStatusQueryOptions } from './useMigrationStatus'

vi.mock('@/lib/bigname', () => ({ bigname: { lookup: vi.fn() } }))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: () => ok({}) }))
vi.mock('@ens-apps/migration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ens-apps/migration')>()),
  runEligibilityChecks: vi.fn(),
}))

const HOLDER = '0x1111111111111111111111111111111111111111'
const FUTURE = String(Math.floor(Date.now() / 1000) + 365 * 86_400)

const v1Record = (overrides: Partial<LookupRecord> = {}): LookupRecord => ({
  name: 'alice.eth',
  display_name: 'alice.eth',
  namespace: 'ens',
  namehash: '0x01',
  owner: HOLDER,
  manager: HOLDER,
  registrant: HOLDER,
  status: 'active',
  authority: 'ens_v1',
  ens_v1: { expires_at: FUTURE },
  read_status: 'ok',
  ...overrides,
})

const found = (record: LookupRecord): LookupResult => ({
  input: { name: record.name },
  kind: 'name',
  status: 'ok',
  record,
})

const answer = (...results: readonly LookupResult[]) =>
  vi
    .mocked(bigname.lookup)
    .mockReturnValue(okAsync({ data: results, meta: { as_of: {} } }))

const statusOf = (name: string) =>
  new QueryClient().fetchQuery({
    ...getMigrationStatusQueryOptions({ name }),
    retry: false,
  })

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(runEligibilityChecks).mockImplementation(async (_, names) => ({
    eligible: names,
    frozen: [],
    alreadyMigrated: [],
    notPremigrated: [],
    failed: [],
  }))
})

describe('getMigrationStatusQueryOptions', () => {
  it('offers the upgrade for an unmigrated ENSv1 name, held by its registrant', async () => {
    answer(found(v1Record()))

    const status = await statusOf('alice.eth')

    expect(bigname.lookup).toHaveBeenCalledWith({
      namespace: 'ens',
      profile: 'detail',
      inputs: [{ name: 'alice.eth' }],
    })
    expect(status).toEqual({
      migratable: true,
      tokenHolder: HOLDER,
      tokenType: 'unwrapped',
    })
  })

  it('does not offer it for a name already on ENSv2, released, or unknown', async () => {
    answer(found(v1Record({ authority: 'ens_v2' })))
    expect(await statusOf('alice.eth')).toEqual({ migratable: false })

    answer(found(v1Record({ status: 'released' })))
    expect(await statusOf('alice.eth')).toEqual({ migratable: false })

    answer({ input: { name: 'nope.eth' }, kind: 'name', status: 'not_found' })
    expect(await statusOf('nope.eth')).toEqual({ migratable: false })
    expect(runEligibilityChecks).not.toHaveBeenCalled()
  })

  it('fails rather than hiding the prompt when bigname cannot answer', async () => {
    answer({ input: { name: 'alice.eth' }, kind: 'name', status: 'failed' })
    await expect(statusOf('alice.eth')).rejects.toMatchObject({
      _tag: 'GetMigrationStatusError',
    })

    vi.mocked(bigname.lookup).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
    await expect(statusOf('alice.eth')).rejects.toMatchObject({
      _tag: 'GetMigrationStatusError',
    })
  })

  it('reads a wrapped subname with its parent in the same lookup', async () => {
    const fuses = (value: number) => ({
      fuses: value,
      cannot_unwrap: false,
      cannot_burn_fuses: false,
      cannot_transfer: false,
      cannot_set_resolver: false,
      cannot_set_ttl: false,
      cannot_create_subdomain: false,
      cannot_approve: false,
      parent_cannot_control: false,
      is_dot_eth: false,
      can_extend_expiry: false,
    })
    answer(
      found(
        v1Record({
          name: 'sub.alice.eth',
          status: 'active',
          ens_v1: {
            expires_at: null,
            wrapper_state: 'wrapped',
            wrapper_fuses: fuses(0),
            wrapper_expires_at: FUTURE,
          },
        }),
      ),
      found(
        v1Record({
          ens_v1: {
            expires_at: FUTURE,
            wrapper_state: 'locked',
            wrapper_fuses: fuses(196_609),
            wrapper_expires_at: FUTURE,
          },
        }),
      ),
    )

    await statusOf('sub.alice.eth')

    expect(vi.mocked(bigname.lookup).mock.calls[0]?.[0].inputs).toEqual([
      { name: 'sub.alice.eth' },
      { name: 'alice.eth' },
    ])
    expect(
      vi.mocked(runEligibilityChecks).mock.calls[0]?.[1][0]?.domain.parent,
    ).toEqual({ name: 'alice.eth', wrappedDomain: { fuses: 196_609 } })
  })
})
