import { err, ok } from 'neverthrow'
import { type PublicClient, zeroAddress } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getPrimaryNameForwardAddress,
  hasPrimaryNameForwardAddress,
} from './primaryNameForwardAddress'
import { getPrimaryNamePreparation } from './primaryNamePreparation'
import { getResolverWriteState } from './resolverWriteAccess'

vi.mock('./primaryNameForwardAddress', () => ({
  getPrimaryNameForwardAddress: vi.fn(),
  hasPrimaryNameForwardAddress: vi.fn(),
}))
vi.mock('./resolverWriteAccess', () => ({
  getResolverWriteState: vi.fn(),
}))

const client = {} as PublicClient
const owner = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' as const
const name = 'pookie.eth'
const resolver = '0x1234567890123456789012345678901234567890' as const

describe('getPrimaryNamePreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not write records when the live forward address already matches', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(owner)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(true)

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({ kind: 'ready' })
    expect(getResolverWriteState).not.toHaveBeenCalled()
  })

  it('sets up a resolver when the name has no forward address or writable resolver', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: undefined, writable: false }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      replacesResolver: false,
    })
    expect(getResolverWriteState).toHaveBeenCalledWith(name, owner)
  })

  it('updates the ETH address when the live resolver accepts the write', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: resolver, writable: true }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({ kind: 'update-eth-address', existingEthAddress: null })
  })

  it('provides the live different wallet address for the confirmation warning', async () => {
    const otherAddress = '0x1234567890123456789012345678901234567890'
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(otherAddress)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: resolver, writable: true }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'update-eth-address',
      existingEthAddress: otherAddress,
    })
  })

  it('treats an unset zero-address record as missing in the warning', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(zeroAddress)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: undefined, writable: false }),
    )

    await expect(
      getPrimaryNamePreparation(client, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      replacesResolver: false,
    })
  })

  it('stops on a failed resolver probe instead of assuming setup is safe', async () => {
    const probeError = new Error('RPC unavailable')
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      err(probeError) as Awaited<ReturnType<typeof getResolverWriteState>>,
    )

    await expect(getPrimaryNamePreparation(client, name, owner)).rejects.toBe(
      probeError,
    )
  })

  it('flags a foreign resolver as being replaced', async () => {
    vi.mocked(getPrimaryNameForwardAddress).mockResolvedValue(null)
    vi.mocked(hasPrimaryNameForwardAddress).mockReturnValue(false)
    vi.mocked(getResolverWriteState).mockResolvedValue(
      ok({ resolverAddress: resolver, writable: false }),
    )

    await expect(
      getPrimaryNamePreparation({} as never, name, owner),
    ).resolves.toEqual({
      kind: 'setup-resolver',
      existingEthAddress: null,
      replacesResolver: true,
    })
  })
})
