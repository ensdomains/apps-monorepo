import { BignameError, type NameRecord } from '@ens-apps/indexer/bigname'
import { errAsync, okAsync } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bigname } from '@/lib/bigname'
import { getV2RegistrationData } from './useV2RegistrationData'

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

describe('getV2RegistrationData', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the created, registered and expiry times from bigname in seconds', async () => {
    answer(record())

    const data = (
      await getV2RegistrationData({ name: 'juveniles.eth' })
    )._unsafeUnwrap()

    expect(bigname.name).toHaveBeenCalledWith('juveniles.eth')
    expect(data).toEqual({
      createdAt: 1714591716,
      registeredAt: 1790999568,
      expiry: 1885693968,
    })
  })

  it('has no expiry when bigname serves none', async () => {
    answer(record({ expires_at: undefined }))

    const data = (
      await getV2RegistrationData({ name: 'juveniles.eth' })
    )._unsafeUnwrap()

    expect(data.expiry).toBeNull()
    expect(data.registeredAt).toBe(1790999568)
  })

  it('has nothing for a name bigname has not indexed, and fails on other errors', async () => {
    vi.mocked(bigname.name).mockReturnValue(
      errAsync(new BignameError({ code: 'not_found', message: 'gone' })),
    )
    expect(
      (await getV2RegistrationData({ name: 'nope.eth' }))._unsafeUnwrap(),
    ).toEqual({ createdAt: null, registeredAt: null, expiry: null })

    vi.mocked(bigname.name).mockReturnValue(
      errAsync(new BignameError({ code: 'overloaded', message: 'busy' })),
    )
    expect(
      (await getV2RegistrationData({ name: 'busy.eth' }))._unsafeUnwrapErr()
        ._tag,
    ).toBe('GetV2RegistrationDataError')
  })
})
