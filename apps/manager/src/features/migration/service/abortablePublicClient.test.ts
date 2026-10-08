import { type Hex, type PublicClient, parseAbi } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { abortablePublicClient } from './abortablePublicClient'

const abi = parseAbi(['function value() view returns (uint256)'])
const args = {
  address: '0x0000000000000000000000000000000000000001' as const,
  abi,
  functionName: 'value' as const,
}
const result = `0x${'1'.padStart(64, '0')}` as Hex

describe('abortable preflight client', () => {
  it('preserves contract reads while disabling invisible transport retries', async () => {
    const request = vi.fn().mockResolvedValue(result)
    const original = { request } as unknown as PublicClient
    const client = abortablePublicClient(original, new AbortController().signal)
    await expect(client.readContract(args)).resolves.toBe(1n)
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0]?.[1]).toMatchObject({ retryCount: 0 })
  })

  it('blocks follow-up RPCs even after an uncancellable in-flight request settles late', async () => {
    let finish: ((value: Hex) => void) | undefined
    const request = vi.fn().mockImplementation(
      () =>
        new Promise<Hex>((resolve) => {
          finish = resolve
        }),
    )
    const controller = new AbortController()
    const client = abortablePublicClient(
      { request } as unknown as PublicClient,
      controller.signal,
    )
    const first = expect(client.readContract(args)).rejects.toThrow()
    controller.abort(new Error('Account changed'))
    await first
    finish?.(result)
    await Promise.resolve()
    await expect(client.readContract(args)).rejects.toThrow('Account changed')
    await expect(client.request({ method: 'eth_blockNumber' })).rejects.toThrow(
      'Account changed',
    )
    expect(request).toHaveBeenCalledOnce()
  })
})
