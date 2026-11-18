import { describe, expect, it } from 'vitest'
import { indexerOrigins, resolveIndexer } from './indexer'

const BIGNAME = 'http://127.0.0.1:4010'

describe('resolveIndexer', () => {
  it('keeps the network default and its bigname endpoint when nothing is picked', () => {
    expect(resolveIndexer({ network: 'sepolia', bignameApi: BIGNAME })).toEqual(
      { backend: 'bigname', bignameApi: BIGNAME },
    )
  })

  it('reads zigens for v2 and ENSNode for v1', () => {
    expect(
      resolveIndexer({
        network: 'sepolia',
        backend: 'zigens',
        bignameApi: BIGNAME,
        overrides: {
          zigensGraphql: 'http://127.0.0.1:4350',
          ensNodeSubgraph: '',
        },
      }),
    ).toEqual({
      backend: 'zigens',
      zigensGraphql: 'http://127.0.0.1:4350',
      ensNodeSubgraph: 'https://ensnode-api-sepolia.up.railway.app/subgraph',
    })
  })

  it.each([
    {
      case: 'an unknown backend',
      backend: 'thegraph',
      error: /Unknown indexer "thegraph"/,
    },
    {
      case: 'Goldsky, which has no Sepolia deployment',
      backend: 'goldsky',
      error: /no goldskyApi for the goldsky indexer/,
    },
  ])('rejects $case', ({ backend, error }) => {
    expect(() =>
      resolveIndexer({ network: 'sepolia', backend, bignameApi: BIGNAME }),
    ).toThrow(error)
  })

  it('serves Goldsky on mainnet', () => {
    expect(
      resolveIndexer({
        network: 'mainnet',
        backend: 'goldsky',
        bignameApi: BIGNAME,
      }),
    ).toEqual({ backend: 'goldsky', goldskyApi: 'https://ens-api.goldsky.com' })
  })
})

describe('indexerOrigins', () => {
  it('allows the zigens and ENSNode origins, and bigname for the ENSv1 migration reads', () => {
    expect(
      indexerOrigins(
        {
          backend: 'zigens',
          zigensGraphql: 'https://graphql.ens.dev/',
          ensNodeSubgraph: 'https://ensnode.example/subgraph',
        },
        'https://sepolia.api.bigname.sh',
      ),
    ).toEqual([
      'https://sepolia.api.bigname.sh',
      'https://graphql.ens.dev',
      'https://ensnode.example',
    ])
  })

  it('lists bigname once when it is also the indexer', () => {
    expect(
      indexerOrigins({ backend: 'bigname', bignameApi: BIGNAME }, BIGNAME),
    ).toEqual([BIGNAME])
  })
})
