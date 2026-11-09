import { zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { getRelatedEntities } from './relatedEntities'

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

  it('relates an address to its primary name only when it has one', () => {
    const entity = { type: 'address', address: OWNER } as const
    expect(
      summarize(getRelatedEntities({ entity, primaryName: 'alice.eth' })),
    ).toEqual([['alice.eth', 'primary-name']])
    expect(getRelatedEntities({ entity, primaryName: null })).toEqual([])
  })
})
