import { QueryClient, skipToken } from '@tanstack/react-query'
import { ok } from 'neverthrow'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { imageRecordQuery, parseImageRecord } from './profileImageRecord'

const mocks = vi.hoisted(() => ({
  parseAvatarRecord: vi.fn(),
  safeGetClient: vi.fn(),
}))

vi.mock('viem/ens', () => ({ parseAvatarRecord: mocks.parseAvatarRecord }))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: mocks.safeGetClient }))

describe('profile image record resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.safeGetClient.mockReturnValue(ok({}))
  })

  it('uses HTTP images directly without requiring a wallet client or a HEAD request', async () => {
    const result = await parseImageRecord(' https://example.com/avatar.png ')

    expect(result._unsafeUnwrap()).toBe('https://example.com/avatar.png')
    expect(mocks.parseAvatarRecord).not.toHaveBeenCalled()
    expect(mocks.safeGetClient).not.toHaveBeenCalled()
  })

  it.each([
    'ipfs://image-content-id',
    'eip155:11155111/erc721:0x1234567890123456789012345678901234567890/1',
  ])('continues resolving %s with the existing parser', async (record) => {
    const url = 'https://ipfs.euc.li/image-content-id'
    mocks.parseAvatarRecord.mockResolvedValue(url)

    expect((await parseImageRecord(record))._unsafeUnwrap()).toBe(url)
    expect(mocks.parseAvatarRecord).toHaveBeenCalledWith(
      {},
      {
        record,
        gatewayUrls: { ipfs: 'https://ipfs.euc.li' },
      },
    )
  })

  it('uses a new record immediately and disables resolution for a removed image', async () => {
    const queryClient = new QueryClient()
    const oldUrl = 'https://example.com/old.png'
    const newUrl = 'https://example.com/new.png'
    queryClient.setQueryData(imageRecordQuery(oldUrl).queryKey, oldUrl)

    expect(await queryClient.fetchQuery(imageRecordQuery(newUrl))).toBe(newUrl)
    expect(imageRecordQuery(undefined).queryFn).toBe(skipToken)
    expect(
      queryClient.getQueryData(imageRecordQuery(undefined).queryKey),
    ).toBeUndefined()
  })

  it('returns a parser failure for unsupported records', async () => {
    mocks.parseAvatarRecord.mockRejectedValue(new Error('Unsupported image'))

    const result = await parseImageRecord('invalid:image')

    expect(result.isErr()).toBe(true)
  })
})
