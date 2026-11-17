import { createClient, custom, namehash, numberToHex } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import type { V1Domain } from '../ensnode/ensnode.types'
import { createZigensIndexer, type ZigensIndexerOptions } from './indexer'
import type { V2Domain } from './zigens.types'

const ZIGENS = 'https://zigens.example/graphql'
const ENSNODE = 'https://ensnode.example/subgraph'
const ADDRESS = '0xda53c38ffacb571f904587e46a8ebf3f5f45e945'

const v2 = (name: string): V2Domain => ({
  id: namehash(name),
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
      [`${ZIGENS} DomainsByNames`]: () => ({ domains: [] }),
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

  it('pages every name when the role names are too many for one zigens filter', async () => {
    const roleNames = Array.from(
      { length: 33 },
      (_, index) => `r${String(index).padStart(2, '0')}.eth`,
    )
    const { indexer, fetch } = indexerWith({
      [`${ZIGENS} RoleConnection`]: () => ({
        roleConnection: {
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: roleNames.length,
          edges: roleNames.map((name) => ({
            cursor: name,
            node: {
              id: name,
              resource: '0x1',
              account: ADDRESS,
              contractAddress: '0x01',
              roleBitmap: '0x1',
              permissions: ['registrar'],
              blockNumber: 1,
              transactionHash: '0x01',
              timestamp: 1,
              name,
            },
          })),
        },
      }),
      // Each term is read on its own: the owner, or at most 32 role names.
      [`${ZIGENS} DomainConnection`]: ({ where, after, first }) => {
        const term = (where as { or: readonly Record<string, unknown>[] }).or[0]
        const names = Array.isArray(term?.name_in)
          ? term.name_in.map(String)
          : ['a.eth', 'r00.eth']
        return connection(names, after, first)
      },
      [`${ENSNODE} Domains`]: () => ({ domains: [] }),
      [`${ZIGENS} DomainsByNames`]: () => ({ domains: [] }),
    })
    const read = (cursor?: string) =>
      indexer.getNamesForAddress({
        address: ADDRESS,
        relations: ['owner', 'role_holder'],
        sort: 'name',
        order: 'asc',
        pageSize: 30,
        cursor,
      })

    const first = (await read())._unsafeUnwrap()
    const second = (await read(first.nextCursor ?? undefined))._unsafeUnwrap()

    expect([...first.items, ...second.items].map(({ name }) => name)).toEqual([
      'a.eth',
      ...roleNames,
    ])
    expect(second.nextCursor).toBeNull()
    expect(
      fetch.mock.calls.every(
        ([, init]) =>
          !String(init?.body).includes('name_in') ||
          (JSON.parse(String(init?.body)).variables.where.or[0].name_in
            ?.length ?? 0) <= 32,
      ),
    ).toBe(true)
  })

  it('lists an ENSv1 name as lapsed only while no ENSv2 reservation holds it', async () => {
    // Both leases ended on 2 November; the subgraph expiry adds the 90-day grace.
    const lapsed = (name: string): V1Domain => ({
      ...v1(name),
      expiryDate: '1801425756',
      registration: {
        registrationDate: '1762113756',
        expiryDate: '1793649756',
      },
    })
    const { indexer } = indexerWith({
      [`${ZIGENS} DomainConnection`]: () => connection([], undefined, 100),
      [`${ENSNODE} Domains`]: ({ skip }) => ({
        domains:
          Number(skip) === 0 ? [lapsed('brewing.eth'), lapsed('gone.eth')] : [],
      }),
      // brewing.eth holds a reservation until 2027-01-01, the way bigname serves it active.
      [`${ZIGENS} DomainsByNames`]: () => ({
        domains: [
          {
            ...v2('brewing.eth'),
            owner: { id: '0x0000000000000000000000000000000000000000' },
            expiryDate: 1799006556,
          },
        ],
      }),
    })

    const names = (
      await indexer.getLapsedNames({
        address: ADDRESS,
        now: new Date('2026-11-17T12:00:00Z'),
        since: new Date('2026-10-18T12:00:00Z'),
      })
    )._unsafeUnwrap()

    expect(
      names.map(
        ({ name, registrationStatus }) => `${name}:${registrationStatus}`,
      ),
    ).toEqual(['gone.eth:expired'])
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
      page?.items.map(({ kind, logIndex, timestamp }) => [
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
