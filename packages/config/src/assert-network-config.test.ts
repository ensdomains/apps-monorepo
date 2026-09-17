import { describe, expect, it } from 'vitest'
import { assertNetworkConfig } from './assert-network-config'
import { NetworkConfigError } from './build-config'

describe('assertNetworkConfig', () => {
  it('returns the resolved config for a usable env', () => {
    const config = assertNetworkConfig({ VITE_ENS_NETWORK: 'sepolia' })

    expect(config.network).toBe('sepolia')
  })

  it('applies the rpc and indexer overrides from env', () => {
    const config = assertNetworkConfig({
      VITE_ENS_NETWORK: 'sepolia',
      VITE_SEPOLIA_RPC_URL: '/rpc',
      VITE_INDEXER_GRAPHQL_URL: 'http://127.0.0.1:5655/graphql',
    })

    expect(config.rpcUrls[0]).toBe('/rpc')
    expect(config.endpoints.indexerGraphql).toBe(
      'http://127.0.0.1:5655/graphql',
    )
  })

  it('treats an empty string like an unset variable', () => {
    const config = assertNetworkConfig({
      VITE_ENS_NETWORK: 'sepolia',
      VITE_INDEXER_GRAPHQL_URL: '',
    })

    expect(config.endpoints.indexerGraphql).toBeTruthy()
  })

  it('points at the variable to set when the network is missing', () => {
    expect(() => assertNetworkConfig({})).toThrow(/Set VITE_ENS_NETWORK/)
  })

  // The build must not produce a bundle aimed at contracts that do not exist.
  it('refuses a network with no ENSv2 deployment', () => {
    expect(() =>
      assertNetworkConfig({
        VITE_ENS_NETWORK: 'mainnet',
        VITE_INDEXER_GRAPHQL_URL: 'https://indexer.example/',
      }),
    ).toThrow(NetworkConfigError)
  })
})
