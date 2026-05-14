import { getRecords } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { parseAvatarRecord } from 'viem/ens'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getNameAvatar, getNamesAvatars } from './profileAvatar'

vi.mock('@ensdomains/ensjs/public', () => ({
  getRecords: vi.fn(),
}))

vi.mock('viem/ens', () => ({
  parseAvatarRecord: vi.fn(),
}))

vi.mock('@/lib/wagmi/helpers', () => ({
  safeGetClient: vi.fn(),
}))

const CLIENT = { id: 'client' }
const RESOLVER = '0x00000000000000000000000000000000000000a1' as Address

const mockRecords = (
  records: Partial<Awaited<ReturnType<typeof getRecords>>>,
) =>
  ({
    texts: [],
    coins: [],
    resolverAddress: undefined,
    ...records,
  }) as Awaited<ReturnType<typeof getRecords>>

describe('profile avatar lookups', () => {
  const getRecordsMock = vi.mocked(getRecords)
  const parseAvatarRecordMock = vi.mocked(parseAvatarRecord)
  const safeGetClientMock = vi.mocked(safeGetClient)

  beforeEach(() => {
    vi.clearAllMocks()
    safeGetClientMock.mockReturnValue(
      ok(CLIENT) as unknown as ReturnType<typeof safeGetClient>,
    )
  })

  it('fetches and parses an avatar text record through ENS JS', async () => {
    getRecordsMock.mockResolvedValue(
      mockRecords({
        texts: [{ key: 'avatar', value: 'ipfs://avatar' }],
      }),
    )
    parseAvatarRecordMock.mockResolvedValue('https://ipfs.euc.li/ipfs/avatar')

    const result = await getNameAvatar('alice.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBe('https://ipfs.euc.li/ipfs/avatar')
    expect(getRecordsMock).toHaveBeenCalledWith(CLIENT, {
      name: 'alice.eth',
      texts: ['avatar'],
    })
    expect(parseAvatarRecordMock).toHaveBeenCalledWith(CLIENT, {
      record: 'ipfs://avatar',
      gatewayUrls: { ipfs: 'https://ipfs.euc.li' },
    })
  })

  it('returns undefined when the avatar record is missing', async () => {
    getRecordsMock.mockResolvedValue(mockRecords({ texts: [] }))

    const result = await getNameAvatar('alice.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeUndefined()
    expect(parseAvatarRecordMock).not.toHaveBeenCalled()
  })

  it('returns undefined when the avatar record cannot be parsed', async () => {
    getRecordsMock.mockResolvedValue(
      mockRecords({
        texts: [{ key: 'avatar', value: 'bad-avatar' }],
      }),
    )
    parseAvatarRecordMock.mockRejectedValue(new Error('invalid avatar'))

    const result = await getNameAvatar('alice.eth')

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeUndefined()
  })

  it('uses supplied resolver addresses for batched avatar entries', async () => {
    getRecordsMock.mockResolvedValue(
      mockRecords({
        texts: [{ key: 'avatar', value: 'ipfs://avatar' }],
      }),
    )
    parseAvatarRecordMock.mockResolvedValue('https://ipfs.euc.li/ipfs/avatar')

    const result = await getNamesAvatars([
      { name: 'alice.eth', resolverAddress: RESOLVER },
    ])

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toEqual({
      'alice.eth': 'https://ipfs.euc.li/ipfs/avatar',
    })
    expect(getRecordsMock).toHaveBeenCalledWith(CLIENT, {
      name: 'alice.eth',
      texts: ['avatar'],
      resolver: { address: RESOLVER },
    })
  })
})
