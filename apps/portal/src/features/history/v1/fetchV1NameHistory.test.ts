import { describe, expect, it } from 'vitest'
import type { V1SubgraphEvent } from './adaptV1Events'
import {
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
    expect(flattenV1Response({ domain: null, resolvers: [] }, null)).toEqual([])
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
        resolvers: [{ events: [event('TextChanged')] }],
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
            addrChangeds: [event('AddrChanged')],
            textChangeds: [event('TextChanged')],
          },
        ],
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
          { addrChangeds: [event('AddrChanged', 'old')] },
          { addrChangeds: [event('AddrChanged', 'current')] },
        ],
      },
      scopedCollections(['AddrChanged']),
    )

    expect(flat.map((e) => e.id)).toEqual(['old', 'current'])
  })

  it('tolerates a resolver that has no row for a requested collection', () => {
    const flat = flattenV1Response(
      { domain: null, resolvers: [{}] },
      scopedCollections(['AddrChanged']),
    )

    expect(flat).toEqual([])
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
