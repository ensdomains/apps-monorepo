import type { EnsChain } from '@ens-apps/config'
import { V1_RENEWAL_WINDOW_SECONDS } from '@ens-apps/utils/gracePeriod'
import type { Client, Transport } from 'viem'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const RESOLVER = '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63'
const EXPIRY = 1_754_821_631n

const chain = vi.hoisted(() => ({
  expiry: 0n,
  now: 0n,
  resolver: null as string | null,
}))

vi.mock('viem/actions', async (original) => ({
  ...(await original<typeof import('viem/actions')>()),
  readContract: async () => chain.expiry,
  getBlock: async () => ({ timestamp: chain.now }),
}))
vi.mock('@ensdomains/ensjs/public', () => ({
  getResolver: async () => chain.resolver,
}))
vi.mock('@ensdomains/ensjs/chain', async (original) => ({
  ...(await original<typeof import('@ensdomains/ensjs/chain')>()),
  getChainContractAddress: () => '0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85',
}))

const { isUnreachableV1Name } = await import('./isUnreachableV1Name')

const client = { chain: { id: 1 } } as unknown as Client<Transport, EnsChain>

describe('isUnreachableV1Name', () => {
  beforeEach(() => {
    chain.expiry = EXPIRY
    chain.now = EXPIRY + V1_RENEWAL_WINDOW_SECONDS
    chain.resolver = null
  })

  it.each([
    { case: 'subname under a released 2LD', name: '1.qa-ens.eth', want: true },
    { case: 'released 2LD itself', name: 'qa-ens.eth', want: true },
    { case: 'uppercase spelling', name: '1.QA-ENS.ETH', want: true },
    {
      case: 'last renewable second of grace',
      name: '1.qa-ens.eth',
      now: EXPIRY + V1_RENEWAL_WINDOW_SECONDS - 1n,
      want: false,
    },
    {
      case: 'resolution still reaches a resolver',
      name: '1.qa-ens.eth',
      resolver: RESOLVER,
      want: false,
    },
    {
      case: 'never registered in ENSv1',
      name: '1.qa-ens.eth',
      expiry: 0n,
      want: false,
    },
    { case: 'not a .eth name', name: 'sub.example.com', want: false },
  ])('$case', async ({ name, now, resolver, expiry, want }) => {
    if (now !== undefined) chain.now = now
    if (resolver !== undefined) chain.resolver = resolver
    if (expiry !== undefined) chain.expiry = expiry

    await expect(isUnreachableV1Name(client, name)).resolves.toBe(want)
  })
})
