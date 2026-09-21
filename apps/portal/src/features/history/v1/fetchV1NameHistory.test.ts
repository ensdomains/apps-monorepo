import { describe, expect, it } from 'vitest'
import type { V1SubgraphEvent } from './adaptV1Events'
import {
  assignedResolverFilter,
  flattenV1Response,
  scopedCollections,
  v1CollectionsSaturated,
} from './fetchV1NameHistory'

const event = (type: string, id = `${type}-1`): V1SubgraphEvent => ({
  id,
  blockNumber: 1,
  transactionID: '0xtx',
  type,
})

const NODE =
  '0x0caa1713342028bec587562b05a2cebf31d2397bdda353f08efd77c925b926d4'
const OLD = '0x1111111111111111111111111111111111111111'
const CURRENT = '0x2222222222222222222222222222222222222222'
const ATTACKER = '0x3333333333333333333333333333333333333333'

/** ENSNode's `"{chainId}-{address}-{node}"` resolver id. */
const resolverId = (address: string) => `11155111-${address}-${NODE}`

/** A resolver event at `(block, logIndex)`, emitted by `resolver`. */
const resolverEvent = (
  type: string,
  resolver: string,
  block: number,
  logIndex = 0,
): V1SubgraphEvent => ({
  id: `11155111-${block}-${logIndex}`,
  blockNumber: block,
  transactionID: `0xtx${block}`,
  type,
  resolverId: resolverId(resolver),
})

/** A registry `NewResolver` pointing the name at `resolver` from `(block, logIndex)`. */
const assignment = (resolver: string | null, block: number, logIndex = 0) => ({
  id: `11155111-${block}-${logIndex}`,
  resolverId: resolver && resolverId(resolver),
})

describe('scopedCollections', () => {
  it('is null for an unscoped read', () => {
    expect(scopedCollections(undefined)).toBeNull()
  })

  it('maps adapter-facing types onto their subgraph collections', () => {
    expect(scopedCollections(['AddressChanged', 'AddrChanged'])).toEqual([
      {
        collection: 'multicoinAddrChangeds',
        fields: 'coinType multiaddr: addr',
      },
      { collection: 'addrChangeds', fields: 'addr { id }' },
    ])
  })

  it('widens to the unscoped read when any type has no collection', () => {
    // Falling back is what keeps a scope honest: selecting only the mapped
    // collections would silently drop the unmapped type from the feed.
    expect(scopedCollections(['AddressChanged', 'NewResolver'])).toBeNull()
  })

  it('dedupes types that share a collection', () => {
    expect(scopedCollections(['TextChanged', 'TextChanged'])).toHaveLength(1)
  })
})

describe('flattenV1Response', () => {
  it('returns [] for a name the subgraph has never seen', () => {
    expect(
      flattenV1Response(
        { domain: null, resolvers: [], newResolvers: [] },
        null,
      ),
    ).toEqual([])
  })

  it('folds the registration cost onto NameRegistered only', () => {
    const flat = flattenV1Response(
      {
        domain: {
          events: [event('NewOwner')],
          registration: {
            cost: '4200',
            events: [event('NameRegistered'), event('NameRenewed')],
          },
        },
        resolvers: [],
        newResolvers: [],
      },
      null,
    )

    expect(flat.map((e) => [e.type, e.cost])).toEqual([
      ['NewOwner', undefined],
      ['NameRegistered', '4200'],
      ['NameRenewed', undefined],
    ])
  })

  it('reads resolver events from the `events` key when unscoped', () => {
    const flat = flattenV1Response(
      {
        domain: null,
        resolvers: [{ events: [resolverEvent('TextChanged', CURRENT, 2)] }],
        newResolvers: [assignment(CURRENT, 1)],
      },
      null,
    )

    expect(flat).toHaveLength(1)
  })

  it('reads scoped resolvers by the keys the query asked for', () => {
    // `Object.values()` here would sweep up whatever else a later edit adds to
    // the resolver selection, so only the requested collections are read.
    const flat = flattenV1Response(
      {
        domain: null,
        resolvers: [
          {
            addrChangeds: [resolverEvent('AddrChanged', CURRENT, 2)],
            textChangeds: [resolverEvent('TextChanged', CURRENT, 3)],
          },
        ],
        newResolvers: [assignment(CURRENT, 1)],
      },
      scopedCollections(['AddrChanged']),
    )

    expect(flat.map((e) => e.type)).toEqual(['AddrChanged'])
  })

  it('reads every resolver the name has ever used', () => {
    const flat = flattenV1Response(
      {
        domain: null,
        resolvers: [
          { addrChangeds: [resolverEvent('AddrChanged', OLD, 2)] },
          { addrChangeds: [resolverEvent('AddrChanged', CURRENT, 4)] },
        ],
        newResolvers: [assignment(CURRENT, 3), assignment(OLD, 1)],
      },
      scopedCollections(['AddrChanged']),
    )

    expect(flat.map((e) => e.blockNumber)).toEqual([2, 4])
  })

  it('drops events from a contract the registry never assigned to the name', () => {
    // #91441: the subgraph creates a `Resolver` row for any contract that emits
    // a resolver event with the node, so an attacker's `AddrChanged(node, …)`
    // comes back from `resolvers(where: { domain })` alongside the real one.
    const flat = flattenV1Response(
      {
        domain: null,
        resolvers: [
          { events: [resolverEvent('AddrChanged', CURRENT, 2)] },
          {
            events: [
              resolverEvent('AddrChanged', ATTACKER, 3),
              resolverEvent('TextChanged', ATTACKER, 3, 1),
              resolverEvent('NameChanged', ATTACKER, 3, 2),
            ],
          },
        ],
        newResolvers: [assignment(CURRENT, 1)],
      },
      null,
    )

    expect(flat.map((e) => e.resolverId)).toEqual([resolverId(CURRENT)])
  })

  it('tolerates a resolver that has no row for a requested collection', () => {
    const flat = flattenV1Response(
      { domain: null, resolvers: [{}], newResolvers: [] },
      scopedCollections(['AddrChanged']),
    )

    expect(flat).toEqual([])
  })
})

describe('assignedResolverFilter', () => {
  const isAssigned = assignedResolverFilter([
    assignment(OLD, 10, 5),
    assignment(CURRENT, 20, 5),
  ])

  it("keeps events inside their resolver's interval", () => {
    expect(isAssigned(resolverEvent('TextChanged', OLD, 15))).toBe(true)
    expect(isAssigned(resolverEvent('TextChanged', CURRENT, 30))).toBe(true)
  })

  it('drops events a resolver emitted before it was assigned', () => {
    expect(isAssigned(resolverEvent('TextChanged', CURRENT, 15))).toBe(false)
    expect(isAssigned(resolverEvent('TextChanged', OLD, 10, 4))).toBe(false)
  })

  it('drops events a resolver emitted after the name moved off it', () => {
    expect(isAssigned(resolverEvent('TextChanged', OLD, 20, 5))).toBe(false)
    expect(isAssigned(resolverEvent('TextChanged', OLD, 25))).toBe(false)
  })

  it('orders by log index within the assigning block', () => {
    // `NewResolver` then records in the same transaction — how the v1
    // controller registers a name with records.
    expect(isAssigned(resolverEvent('TextChanged', CURRENT, 20, 6))).toBe(true)
  })

  it('matches the resolver address case-insensitively', () => {
    const isAssignedMixed = assignedResolverFilter([
      assignment('0xAbCdEf0123456789aBcDeF0123456789AbCdEf01', 1),
    ])
    expect(
      isAssignedMixed(
        resolverEvent(
          'TextChanged',
          '0xabcdef0123456789abcdef0123456789abcdef01',
          2,
        ),
      ),
    ).toBe(true)
  })

  it('treats an unset resolver as ending the previous interval', () => {
    const isAssignedUnset = assignedResolverFilter([
      assignment(OLD, 1),
      assignment(null, 5),
    ])
    expect(isAssignedUnset(resolverEvent('TextChanged', OLD, 6))).toBe(false)
  })

  it('drops everything when the name has never had a resolver', () => {
    expect(
      assignedResolverFilter([])(resolverEvent('AddrChanged', ATTACKER, 1)),
    ).toBe(false)
  })

  it('drops events whose id or resolver cannot be read', () => {
    expect(
      isAssigned({ ...resolverEvent('TextChanged', CURRENT, 30), id: 'x' }),
    ).toBe(false)
    expect(
      isAssigned({
        ...resolverEvent('TextChanged', CURRENT, 30),
        resolverId: undefined,
      }),
    ).toBe(false)
  })
})

describe('v1CollectionsSaturated', () => {
  const event = (id: string) => ({ id }) as unknown as V1SubgraphEvent

  it('is false when every collection came back short', () => {
    expect(
      v1CollectionsSaturated(
        { domain: { events: [event('a')] }, resolvers: [] },
        null,
        10,
      ),
    ).toBe(false)
  })

  it('is false when the flat total exceeds the window but no collection did', () => {
    // The regression this guards. `first` bounds each sibling selection
    // separately, so two resolvers can return two windows' worth and still be
    // complete. Comparing the *flattened* length against the window instead
    // reported fox.eth's 172 complete v1 events as truncated.
    expect(
      v1CollectionsSaturated(
        {
          domain: { events: [event('a'), event('b')] },
          resolvers: [
            { events: [event('c'), event('d')] },
            { events: [event('e'), event('f')] },
          ],
        },
        null,
        3,
      ),
    ).toBe(false)
  })

  it('is true when a single collection filled its window', () => {
    expect(
      v1CollectionsSaturated(
        { domain: { events: [event('a'), event('b')] }, resolvers: [] },
        null,
        2,
      ),
    ).toBe(true)
  })

  it('checks the registration collection', () => {
    expect(
      v1CollectionsSaturated(
        {
          domain: { events: [], registration: { events: [event('a')] } },
          resolvers: [],
        },
        null,
        1,
      ),
    ).toBe(true)
  })

  it('checks the scoped resolver collections, not just `events`', () => {
    expect(
      v1CollectionsSaturated(
        { domain: null, resolvers: [{ textChangeds: [event('a')] }] },
        [{ collection: 'textChangeds', fields: 'key value' }],
        1,
      ),
    ).toBe(true)
  })
})
