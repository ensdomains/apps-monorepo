import {
  createWalletClient,
  custom,
  numberToHex,
  UserRejectedRequestError,
} from 'viem'
import { baseSepolia, sepolia } from 'viem/chains'
import { describe, expect, it, vi } from 'vitest'
import { followChain, typedDataChainId } from './followChain'

const ACCOUNT = '0x1111111111111111111111111111111111111111'
const TYPES = { Upload: [{ name: 'upload', type: 'string' }] } as const

const setup = () => {
  const forwarded = vi.fn(async ({ method }: { method: string }) =>
    method === 'eth_chainId' ? numberToHex(sepolia.id) : '0x',
  )
  const raw = createWalletClient({
    account: ACCOUNT,
    transport: custom({ request: forwarded }),
  })
  const ensureChain = vi.fn(async (_chainId: number) => {})
  return {
    client: followChain(raw, sepolia, ensureChain),
    ensureChain,
    forwarded,
  }
}

describe('followChain', () => {
  it('moves the wallet to its chain before a transaction', async () => {
    const { client, ensureChain, forwarded } = setup()
    await client.sendTransaction({ to: ACCOUNT, value: 0n })
    expect(ensureChain.mock.calls).toEqual([[sepolia.id], [sepolia.id]])
    expect(ensureChain).toHaveBeenCalledBefore(forwarded)
    expect(forwarded.mock.calls.map(([{ method }]) => method)).toEqual([
      'eth_chainId',
      'eth_sendTransaction',
    ])
  })

  it("moves the wallet to the typed data domain's chain before signing", async () => {
    const { client, ensureChain, forwarded } = setup()
    await client.signTypedData({
      domain: { name: 'Permit2', chainId: baseSepolia.id },
      types: TYPES,
      primaryType: 'Upload',
      message: { upload: 'avatar' },
    })
    expect(ensureChain).toHaveBeenCalledExactlyOnceWith(baseSepolia.id)
    expect(ensureChain).toHaveBeenCalledBefore(forwarded)
  })

  it('passes chain-agnostic signatures straight through', async () => {
    const { client, ensureChain, forwarded } = setup()
    await client.signMessage({ message: 'sign in' })
    await client.signTypedData({
      domain: { name: 'Ethereum Name Service', version: '1' },
      types: TYPES,
      primaryType: 'Upload',
      message: { upload: 'avatar' },
    })
    expect(ensureChain).not.toHaveBeenCalled()
    expect(forwarded).toHaveBeenCalledTimes(2)
  })

  it('surfaces a declined switch as a rejection and sends nothing', async () => {
    const { client, ensureChain, forwarded } = setup()
    ensureChain.mockRejectedValueOnce(
      new UserRejectedRequestError(new Error('User rejected the request.')),
    )
    await expect(
      client.request({ method: 'eth_sendTransaction', params: [{}] } as never),
    ).rejects.toBeInstanceOf(UserRejectedRequestError)
    expect(forwarded).not.toHaveBeenCalled()
  })
})

describe('typedDataChainId', () => {
  it.each([
    [[ACCOUNT, '{"domain":{"chainId":84532}}'], 84532],
    [[ACCOUNT, '{"domain":{"chainId":"11155111"}}'], 11155111],
    [[ACCOUNT, { domain: { chainId: 10 } }], 10],
    [[ACCOUNT, '{"domain":{"name":"x"}}'], undefined],
    [[ACCOUNT, 'not json'], undefined],
    [undefined, undefined],
  ])('reads %j as %s', (params, expected) => {
    expect(typedDataChainId(params)).toBe(expected)
  })
})
