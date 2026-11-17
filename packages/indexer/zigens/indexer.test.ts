import { createClient, custom, namehash, numberToHex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { V1Domain } from '../ensnode/ensnode.types'
import { createZigensIndexer, type ZigensIndexerOptions } from './indexer'
import type { V2Domain } from './zigens.types'

const ZIGENS = 'https://zigens.example/graphql'
const ENSNODE = 'https://ensnode.example/subgraph'
const ADDRESS = '0xda53c38ffacb571f904587e46a8ebf3f5f45e945'

const v2 = (name: string): V2Domain => ({
  id: `0x${name.length.toString(16).padStart(64, '0')}`,
  name,
  labelName: name.split('.')[0] ?? null,
  labelhash: `0x${'1'.repeat(64)}`,
  normalizedName: name,
  protocol: 'v2',
  owner: { id: ADDRESS },
  registrant: { id: ADDRESS },
  resolver: null,
  resolvedAddress: null,
  subregistry: null,
  expiryDate: 1826469384,
  registrationDate: 1794911784,
  createdAt: 1794911784,
  isReachable: true,
  isMigrated: false,
  tokenId: null,
  subdomainCount: 0,
  roleHolderCount: 0,
  parent: null,
})

const v1 = (name: string): V1Domain => ({
  id: `0x${(name.length + 100).toString(16).padStart(64, '0')}`,
  name,
  labelName: null,
  labelhash: null,
  owner: { id: ADDRESS },
  registrant: { id: ADDRESS },
  wrappedOwner: null,
  resolver: null,
  resolvedAddress: null,
  expiryDate: '2015726758',
  createdAt: '1690405056',
  subdomainCount: 0,
  parent: null,
  registration: { registrationDate: '1690405056', expiryDate: '2007950758' },
  wrappedDomain: null,
})

type Answer = (variables: Readonly<Record<string, unknown>>) => unknown

/** Answers each GraphQL request by endpoint and operation name; anything else gets a 503. */
const indexerWith = (
  answers: Readonly<Record<string, Answer>>,
  options: Partial<ZigensIndexerOptions> = {},
) => {
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const { query, variables } = JSON.parse(String(init?.body))
    const operation = /query (\w+)/.exec(query)?.[1]
    const answer = answers[`${url} ${operation}`]
    return answer
      ? new Response(JSON.stringify({ data: answer(variables) }))
      : new Response('{}', { status: 503 })
  })
  const indexer = createZigensIndexer({
    zigensGraphql: ZIGENS,
    ensNodeSubgraph: ENSNODE,
    chainId: 11155111,
    nameWrapper: '0x0635513f179d50a207757e05759cbd106d7dfce8',
    fetch,
    now: () => new Date('2026-11-17T12:00:00Z'),
    ...options,
  })
  return { indexer, fetch }
}

/** A Relay page of `names` after the cursor, which is a name. */
const connection = (
  names: readonly string[],
  after: unknown,
  first: unknown,
) => {
  const start = typeof after === 'string' ? names.indexOf(after) + 1 : 0
  const page = names.slice(start, start + Number(first))
  return {
    domainConnection: {
      pageInfo: {
        hasNextPage: start + page.length < names.length,
        endCursor: page.at(-1) ?? null,
      },
      totalCount: null,
      edges: page.map((name) => ({ cursor: name, node: v2(name) })),
    },
  }
}

describe('createZigensIndexer', () => {
  it('merges ENSv2 and ENSv1 names into one sorted page and resumes both', async () => {
    const { indexer } = indexerWith({
      [`${ZIGENS} RoleConnection`]: () => ({
        roleConnection: {
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: 0,
          edges: [],
        },
      }),
      [`${ZIGENS} DomainConnection`]: ({ after, first }) =>
        connection(['a.eth', 'c.eth', 'e.eth'], after, first),
      [`${ENSNODE} Domains`]: ({ skip, first }) => ({
        domains: ['b.eth', 'd.eth']
          .slice(Number(skip), Number(skip) + Number(first))
          .map(v1),
      }),
    })

    const first = (
      await indexer.getNamesForAddress({ address: ADDRESS, pageSize: 2 })
    )._unsafeUnwrap()
    const second = (
      await indexer.getNamesForAddress({
        address: ADDRESS,
        pageSize: 2,
        cursor: first.nextCursor ?? undefined,
      })
    )._unsafeUnwrap()

    expect(
      first.items.map(({ name, protocol }) => `${name}:${protocol}`),
    ).toEqual(['a.eth:v2', 'b.eth:v1'])
    expect(second.items.map(({ name }) => name)).toEqual(['c.eth', 'd.eth'])
  })

  it('fails a merged read when either source fails, rather than lose its half', async () => {
    const { indexer } = indexerWith({
      [`${ZIGENS} DomainConnection`]: ({ after, first }) =>
        connection(['a.eth'], after, first),
    })

    const result = await indexer.getNamesForAddress({
      address: ADDRESS,
      relations: ['owner'],
    })

    expect(result._unsafeUnwrapErr().kind).toBe('unavailable')
  })

  it('reads a name ENSv2 does not hold from ENSv1', async () => {
    const { indexer } = indexerWith({
      [`${ZIGENS} DomainsByNames`]: () => ({ domains: [] }),
      [`${ENSNODE} DomainsByNames`]: () => ({ domains: [v1('test.eth')] }),
    })

    const detail = (
      await indexer.getNameDetail({ name: 'test.eth' })
    )._unsafeUnwrap()

    expect(detail?.protocol).toBe('v1')
  })

  it('dates ENSv1 history from the registration date, then the blocks over RPC', async () => {
    const getBlock = vi.fn(async (blockNumber: string) => ({
      number: blockNumber,
      timestamp: numberToHex(1690405000n),
    }))
    const rpcClient = createClient({
      transport: custom({
        request: async ({ method, params }) =>
          method === 'eth_getBlockByNumber' ? getBlock(params[0]) : null,
      }),
    })
    const node = namehash('test.eth')
    const { indexer } = indexerWith(
      {
        [`${ZIGENS} DomainsByNames`]: () => ({ domains: [] }),
        [`${ENSNODE} DomainsByNames`]: () => ({ domains: [v1('test.eth')] }),
        [`${ENSNODE} NameEvents`]: () => ({
          domain: {
            name: 'test.eth',
            events: [
              {
                __typename: 'NewResolver',
                id: '11155111-3970143-12',
                blockNumber: 3970143,
                transactionID: '0x01',
                resolver: {
                  address: '0x8fade66b79cc9f707ab26799354482eb93a5b7dd',
                },
              },
            ],
            registration: {
              events: [
                {
                  __typename: 'NameRegistered',
                  id: '11155111-3970144-60',
                  blockNumber: 3970144,
                  transactionID: '0x02',
                  registrationId: node,
                  registrant: { id: ADDRESS },
                  expiryDate: '2007950758',
                },
              ],
            },
          },
        }),
        [`${ENSNODE} LatestRegistrations`]: () => ({
          nameRegistereds: [
            {
              id: '11155111-3970144-60',
              registrationId: node,
              registration: { registrationDate: '1690405056' },
            },
          ],
        }),
      },
      { rpcClient },
    )
    const page = (
      await indexer.getNameHistory({ name: 'test.eth', pageSize: 10 })
    )._unsafeUnwrap()

    expect(
      page.items.map(({ kind, logIndex, timestamp }) => [
        kind,
        logIndex,
        timestamp?.getTime(),
      ]),
    ).toEqual([
      ['RegistrationGranted', 60, 1690405056000],
      ['ResolverChanged', 12, 1690405000000],
    ])
    expect(getBlock).toHaveBeenCalledTimes(1)
    expect(getBlock).toHaveBeenCalledWith(numberToHex(3970143))
  })

  it('reports a block both sources have indexed', async () => {
    const { indexer } = indexerWith({
      [`${ZIGENS} Meta`]: () => ({ _meta: { block: { number: 12 } } }),
      [`${ENSNODE} Meta`]: () => ({ _meta: { block: { number: 10 } } }),
    })

    expect((await indexer.getSyncStatus())._unsafeUnwrap()).toEqual({
      indexedBlock: 10,
    })
  })
})
