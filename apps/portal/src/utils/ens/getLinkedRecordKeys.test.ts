import type { EnsChain } from '@ens-apps/config'
import type { Client, Transport } from 'viem'
import { namehash } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { getLinkedRecordKeys, toLinkedRecordKeys } from './getLinkedRecordKeys'

const RESOLVER = '0x6C9Fb0A64dcE231A971ba3407D058F23E97Acad0'
const NAME = '1.dragonsy.eth'

type LogsRequest = {
  readonly event: { readonly name: string }
  readonly args: Record<string, unknown>
}

/** A client whose `getLogs` answers per event, and records what it was asked. */
const clientWith = (
  logs: Partial<Record<string, readonly { args: Record<string, unknown> }[]>>,
) => {
  const getLogs = vi.fn(
    async ({ event }: LogsRequest) => logs[event.name] ?? [],
  )
  return {
    // Only `getLogs` is read: viem's getAction prefers the client's own action.
    client: { getLogs } as unknown as Client<Transport, EnsChain>,
    getLogs,
  }
}

describe('toLinkedRecordKeys', () => {
  it('lists each written key once and skips coin types past a safe number', () => {
    expect(
      toLinkedRecordKeys({
        textKeys: ['test', 'description', 'test', undefined],
        coinTypes: [60n, 60n, 2147483658n, 2n ** 64n, undefined],
      }),
    ).toEqual({
      texts: ['test', 'description'],
      coins: [60, 2147483658],
    })
  })
})

describe('getLinkedRecordKeys', () => {
  it("reads the keys of the record the name's node was last linked to", async () => {
    const { client, getLogs } = clientWith({
      Linked: [{ args: { recordId: 1n } }, { args: { recordId: 2n } }],
      TextUpdated: [{ args: { key: 'test' } }],
      AddressUpdated: [{ args: { coinType: 60n } }],
    })

    await expect(getLinkedRecordKeys(client, RESOLVER, NAME)).resolves.toEqual({
      texts: ['test'],
      coins: [60],
    })
    const requests = getLogs.mock.calls.map(([request]) => request)
    expect(requests.map(({ event, args }) => [event.name, args])).toEqual([
      ['Linked', { node: namehash(NAME) }],
      ['TextUpdated', { recordId: 2n }],
      ['AddressUpdated', { recordId: 2n }],
    ])
  })

  it('stops at a name that was never linked', async () => {
    const { client, getLogs } = clientWith({})

    await expect(getLinkedRecordKeys(client, RESOLVER, NAME)).resolves.toEqual({
      texts: [],
      coins: [],
    })
    expect(getLogs).toHaveBeenCalledOnce()
  })

  it('gives up once the lookup runs past its budget', async () => {
    // A log read that never settles; only `getLogs` is read.
    const client = {
      getLogs: () => new Promise(() => {}),
    } as unknown as Client<Transport, EnsChain>

    await expect(
      getLinkedRecordKeys(client, RESOLVER, NAME, 10),
    ).rejects.toThrow(/took over 10ms/)
  })
})
