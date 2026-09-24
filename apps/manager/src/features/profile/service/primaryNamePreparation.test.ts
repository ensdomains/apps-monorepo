import { err, ok } from 'neverthrow'
import type { PublicClient } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import { getPrimaryNamePreparation } from './primaryNamePreparation'
import { getResolverWriteAccess } from './resolverWriteAccess'

vi.mock('./primaryNameForwardAddress', () => ({
  getPrimaryNameForwardAddress: vi.fn(),
  hasPrimaryNameForwardAddress: vi.fn(),
}))
vi.mock('./resolverWriteAccess', () => ({
  getResolverWriteAccess: vi.fn(),
}))

const client = {} as PublicClient
const owner = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const
const name = 'pookie.eth'

describe('getPrimaryNamePreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not write records when the live forward address already matches', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(owner)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(true)

    await expect(getPrimaryNamePreparation(client, name, owner)).resolves.toBe(
      'ready',
    )
    expect(getResolverWriteAccess).not.toHaveBeenCalled()
  })

  it('sets up a resolver when the name has no forward address or writable resolver', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteAccess).mockResolvedValue(ok(false))

    await expect(getPrimaryNamePreparation(client, name, owner)).resolves.toBe(
      'setup-resolver',
    )
    expect(getResolverWriteAccess).toHaveBeenCalledWith(name, owner)
  })

  it('updates the ETH address when the live resolver accepts the write', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteAccess).mockResolvedValue(ok(true))

    await expect(getPrimaryNamePreparation(client, name, owner)).resolves.toBe(
      'update-eth-address',
    )
  })

  it('stops on a failed resolver probe instead of assuming setup is safe', async () => {
    const probeError = new Error('RPC unavailable')
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteAccess).mockResolvedValue(
      err(probeError) as Awaited<ReturnType<typeof getResolverWriteAccess>>,
    )

    await expect(getPrimaryNamePreparation(client, name, owner)).rejects.toBe(
      probeError,
    )
  })
})
