import { zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import {
  getRelatedEntities,
  getRelationshipPresentation,
  getRelationshipReadState,
} from './relatedEntities'

const OWNER = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const RESOLVER = '0x3333333333333333333333333333333333333333'
const eth = (value: string) => [
  { coinType: 0, value: 'bc1qnotanethaddress' },
  { coinType: 60, value },
]

const summarize = (related: ReturnType<typeof getRelatedEntities>) =>
  related.map(({ entity, relations }) => [
    entity.type === 'name' ? entity.name : entity.address,
    relations.join('+'),
  ])

describe('getRelatedEntities', () => {
  it.each([
    [
      'merges an owner who is also the ETH address, keeping the resolver apart',
      {
        name: 'alice.eth',
        owner: OWNER,
        coins: eth(OWNER.toUpperCase().replace('0X', '0x')),
      },
      [
        [OWNER, 'owner+eth-address'],
        [RESOLVER, 'resolver'],
      ],
    ],
    [
      'lists a subname’s parent after its addresses',
      { name: 'pay.alice.eth', owner: OWNER, coins: eth(OTHER) },
      [
        [OWNER, 'owner'],
        [OTHER, 'eth-address'],
        [RESOLVER, 'resolver'],
        ['alice.eth', 'parent'],
      ],
    ],
    [
      'calls a DNS name’s registry entry its manager',
      { name: 'alice.xyz', owner: OWNER, coins: [] },
      [
        [OWNER, 'manager'],
        [RESOLVER, 'resolver'],
      ],
    ],
    [
      'drops unset and malformed addresses',
      { name: 'alice.eth', owner: zeroAddress, coins: eth('not-an-address') },
      [[RESOLVER, 'resolver']],
    ],
  ] as const)('%s', (_, { name, owner, coins }, expected) => {
    const related = getRelatedEntities({
      entity: { type: 'name', name },
      owner,
      coins,
      resolverAddress: RESOLVER,
    })
    expect(summarize(related)).toEqual(expected)
  })

  it('does not present legacy owner and resolver records as current relations for an available name', () => {
    expect(
      getRelatedEntities({
        entity: { type: 'name', name: 'helgesson.eth' },
        isAvailable: true,
        owner: OWNER,
        coins: eth(OTHER),
        resolverAddress: RESOLVER,
      }),
    ).toEqual([])
  })

  it('withholds inherited legacy facts below an available registration while retaining the parent destination', () => {
    expect(
      getRelatedEntities({
        entity: { type: 'name', name: 'sub.helgesson.eth' },
        isAvailable: true,
        owner: OWNER,
        coins: eth(OTHER),
        resolverAddress: RESOLVER,
      }),
    ).toEqual([
      {
        entity: { type: 'name', name: 'helgesson.eth' },
        relations: ['parent'],
      },
    ])
  })

  it.each([
    ['helgesson.eth', undefined, false, false, 'checking'],
    ['helgesson.eth', false, true, false, 'checking'],
    ['helgesson.eth', true, false, false, 'available'],
    ['helgesson.eth', false, false, false, 'ready'],
    ['helgesson.eth', false, false, true, 'failed'],
    ['sub.helgesson.eth', true, false, false, 'available'],
    ['helgesson.xyz', undefined, false, false, 'ready'],
    ['ALICE.eth', false, false, false, 'inactive'],
  ] as const)(
    'classifies relationship reads for %s with availability %s',
    (name, isAvailable, isFetching, isError, expected) => {
      expect(
        getRelationshipReadState({
          entity: { type: 'name', name },
          isEnabled: true,
          availability: {
            data: isAvailable === undefined ? undefined : { isAvailable },
            isError,
            isFetching,
          },
        }),
      ).toBe(expected)
    },
  )

  it('relates an address to its primary name only when it has one', () => {
    const entity = { type: 'address', address: OWNER } as const
    expect(
      summarize(getRelatedEntities({ entity, primaryName: 'alice.eth' })),
    ).toEqual([['alice.eth', 'primary-name']])
    expect(getRelatedEntities({ entity, primaryName: null })).toEqual([])
  })
})

it('does not use cached registration-dependent facts without a registration verdict', () => {
  const idle = { isLoading: false, isError: false }
  const reads: Parameters<typeof getRelationshipPresentation>[0]['reads'] = {
    availability: { ...idle, data: undefined },
    owner: { ...idle, data: { owner: OWNER } },
    ethAddress: { ...idle, data: OTHER },
    resolver: { ...idle, data: RESOLVER },
    primaryName: { ...idle, data: null },
  }
  expect(
    getRelationshipPresentation({
      entity: { type: 'name', name: 'helgesson.eth' },
      state: 'inactive',
      isEnabled: false,
      reads,
    }).entities,
  ).toEqual([])
})

it('keeps successful relations when one cached fact fails revalidation', () => {
  const idle = { isLoading: false, isError: false }
  const result = getRelationshipPresentation({
    entity: { type: 'name', name: 'helgesson.eth' },
    state: 'ready',
    isEnabled: true,
    reads: {
      availability: { ...idle, data: { isAvailable: false } },
      owner: { ...idle, data: { owner: OWNER } },
      ethAddress: { ...idle, isError: true, data: OTHER },
      resolver: { ...idle, data: RESOLVER },
      primaryName: { ...idle, data: null },
    },
  })
  expect(result.entities.map(({ relations }) => relations)).toEqual([
    ['owner'],
    ['resolver'],
  ])
  expect(result.failedSources).toEqual(['ethAddress'])
})
