import { getName } from '@ensdomains/ensjs/public'
import { ok } from 'neverthrow'
import type { Address } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { safeGetClient } from '@/lib/wagmi/helpers'
import { getReverseName } from './profileReverseName'

vi.mock('@ensdomains/ensjs/public', () => ({ getName: vi.fn() }))
vi.mock('@/lib/wagmi/helpers', () => ({ safeGetClient: vi.fn() }))

const getNameMock = vi.mocked(getName)
const safeGetClientMock = vi.mocked(safeGetClient)

const ADDRESS: Address = '0x1234567890abcdef1234567890abcdef12345678'
const fakeClient = {} as never

const nameData = (over: { name: string; match: boolean }) => ({
  reverseResolverAddress: null,
  resolverAddress: null,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  safeGetClientMock.mockReturnValue(ok(fakeClient))
})

describe('getReverseName', () => {
  it('returns null without touching the chain when no address is given', async () => {
    const result = await getReverseName(undefined)

    expect(result._unsafeUnwrap()).toBeNull()
    expect(safeGetClientMock).not.toHaveBeenCalled()
    expect(getNameMock).not.toHaveBeenCalled()
  })

  it('returns the primary name when it forward-verifies (match: true)', async () => {
    getNameMock.mockResolvedValue(
      nameData({ name: 'alice.eth', match: true }) as never,
    )

    const result = await getReverseName(ADDRESS)

    expect(result._unsafeUnwrap()).toBe('alice.eth')
    // allowMismatch lets ensjs report the name; we gate on `match` ourselves.
    expect(getNameMock).toHaveBeenCalledWith(fakeClient, {
      address: ADDRESS,
      allowMismatch: true,
    })
  })

  it('returns null when the reverse name does not forward-verify (match: false)', async () => {
    getNameMock.mockResolvedValue(
      nameData({ name: 'spoof.eth', match: false }) as never,
    )

    const result = await getReverseName(ADDRESS)

    expect(result._unsafeUnwrap()).toBeNull()
  })

  it('returns null when no primary name is set (getName resolves null)', async () => {
    getNameMock.mockResolvedValue(null as never)

    const result = await getReverseName(ADDRESS)

    expect(result._unsafeUnwrap()).toBeNull()
  })

  it('swallows getName failures and resolves to null', async () => {
    getNameMock.mockRejectedValue(new Error('rpc down'))

    const result = await getReverseName(ADDRESS)

    expect(result.isOk()).toBe(true)
    expect(result._unsafeUnwrap()).toBeNull()
  })
})
