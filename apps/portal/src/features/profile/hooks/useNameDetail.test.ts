import { BignameError, type NameRecord } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getNameDetail } from './useNameDetail'
import { toV2RegistrationData } from './useV2RegistrationData'

vi.mock('@/lib/bigname', () => ({ bigname: { name: vi.fn() } }))

const record = (overrides: Partial<NameRecord> = {}): NameRecord => ({
  name: 'juveniles.eth',
  display_name: 'juveniles.eth',
  namespace: 'ens',
  namehash: '0x01',
  authority: 'ens_v2',
  created_at: '1714591716',
  registered_at: '1790999568',
  expires_at: '1885693968',
  status: 'ok',
  ...overrides,
})

const answer = (data: NameRecord) =>
  vi
    .mocked(bigname.name)
    .mockReturnValue(okAsync({ data, meta: { as_of: {} } }))

const readRegistration = async (name: string) =>
  toV2RegistrationData((await getNameDetail({ name }))._unsafeUnwrap())

describe('getNameDetail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives the expiry row its created, registered and expiry times in seconds', async () => {
    answer(record())

    expect(await readRegistration('juveniles.eth')).toEqual({
      createdAt: 1714591716,
      registeredAt: 1790999568,
      expiry: 1885693968,
    })
    expect(bigname.name).toHaveBeenCalledWith('juveniles.eth')
  })

  it('has no expiry when bigname serves none', async () => {
    answer(record({ expires_at: undefined }))

    const data = await readRegistration('juveniles.eth')

    expect(data.expiry).toBeNull()
    expect(data.registeredAt).toBe(1790999568)
  })

  it('carries why a name provably resolves to nothing', async () => {
    answer(
      record({
        authority: 'ens_v1',
        unresolvable_reason: 'no_live_ens_v2_entry',
      }),
    )

    const detail = (
      await getNameDetail({ name: 'juveniles.eth' })
    )._unsafeUnwrap()

    expect(detail?.unresolvableReason).toBe('no_live_ens_v2_entry')
  })

  it('has nothing for a name bigname has not indexed, and fails on other errors', async () => {
    vi.mocked(bigname.name).mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    expect(await readRegistration('nope.eth')).toEqual({
      createdAt: null,
      registeredAt: null,
      expiry: null,
    })

    vi.mocked(bigname.name).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
    expect(
      (await getNameDetail({ name: 'busy.eth' }))._unsafeUnwrapErr()._tag,
    ).toBe('GetNameDetailError')
  })
})
