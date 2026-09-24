import { zeroAddress } from 'viem'
import { describe, expect, it } from 'vitest'
import { buildConfig, NetworkConfigError } from './buildConfig'
import { ENS_NETWORKS, NETWORKS } from './networks'

const SEPOLIA_RPC = 'https://rpc.example/sepolia/key'

const buildSepolia = (overrides?: Parameters<typeof buildConfig>[0]) =>
  buildConfig({ network: 'sepolia', rpcUrl: SEPOLIA_RPC, ...overrides })

describe('buildConfig', () => {
  describe('network resolution', () => {
    it('resolves the sepolia chain and marks it a testnet', () => {
      const config = buildSepolia()

      expect(config.network).toBe('sepolia')
      expect(config.isTestnet).toBe(true)
      expect(config.chain.id).toBe(NETWORKS.sepolia.chainId)
    })

    it('throws when no network is supplied rather than assuming one', () => {
      expect(() =>
        buildSepolia({ network: undefined, rpcUrl: SEPOLIA_RPC }),
      ).toThrow(NetworkConfigError)
    })

    it('names the valid networks when the network is unknown', () => {
      expect(() =>
        buildSepolia({ network: 'holesky', rpcUrl: SEPOLIA_RPC }),
      ).toThrow(/Unknown network "holesky".*mainnet, sepolia/s)
    })

    it.each([
      '',
      'SEPOLIA',
      'Sepolia',
      ' sepolia',
    ])('rejects %o rather than coercing it', (network) => {
      expect(() => buildSepolia({ network, rpcUrl: SEPOLIA_RPC })).toThrow(
        NetworkConfigError,
      )
    })
  })

  describe('ENSv2 deployment guard', () => {
    // ensjs carries a key for every network but fills undeployed ones with the
    // zero address, so a lookup returns 0x0 instead of throwing. Without this
    // guard a mainnet build would send calls to 0x0.
    it('refuses a network whose ENSv2 contracts are the zero address', () => {
      expect(() =>
        buildConfig({
          network: 'mainnet',
          rpcUrl: 'https://rpc.example/mainnet',
          // Supplied so the endpoint check passes and the contract check is
          // what actually fails.
          overrides: { indexerGraphql: 'https://indexer.example/' },
        }),
      ).toThrow(/ENSv2 is not deployed on mainnet.*ensRegistry/s)
    })

    it('passes for sepolia, where ENSv2 is deployed', () => {
      const config = buildSepolia()

      expect(config.chain.contracts.ensRegistry.address).not.toBe(zeroAddress)
      expect(config.chain.contracts.ensEthRegistrar.address).not.toBe(
        zeroAddress,
      )
    })
  })

  describe('rpc urls', () => {
    it('keeps the app primary first and appends the shared fallbacks', () => {
      const { rpcUrls } = buildSepolia()

      expect(rpcUrls[0]).toBe(SEPOLIA_RPC)
      expect(rpcUrls).toEqual([SEPOLIA_RPC, ...NETWORKS.sepolia.rpcFallbacks])
    })

    it('does not duplicate a primary that is also a fallback', () => {
      const shared = NETWORKS.sepolia.rpcFallbacks[0]
      const { rpcUrls } = buildSepolia({
        network: 'sepolia',
        rpcUrl: shared,
      })

      expect(rpcUrls.filter((url) => url === shared)).toHaveLength(1)
      expect(rpcUrls[0]).toBe(shared)
    })

    it('exposes the resolved urls on the chain so viem clients inherit them', () => {
      const { chain, rpcUrls } = buildSepolia()

      expect(chain.rpcUrls.default.http).toEqual(rpcUrls)
    })

    // The e2e stack and PR previews proxy an ephemeral node through the app's
    // own origin.
    it('accepts a root-relative rpc path', () => {
      expect(
        buildSepolia({ network: 'sepolia', rpcUrl: '/rpc' }).rpcUrls[0],
      ).toBe('/rpc')
    })

    it.each([
      '   ',
      'not-a-url',
      'ftp://rpc.example',
      'rpc.example',
    ])('rejects %o as an rpc url', (rpcUrl) => {
      expect(() => buildSepolia({ network: 'sepolia', rpcUrl })).toThrow(
        NetworkConfigError,
      )
    })

    // An app has no attributed endpoint on every network, so it may supply
    // none and ride the shared public fallbacks.
    it('uses only the shared fallbacks when no primary is supplied', () => {
      const { rpcUrls } = buildConfig({ network: 'sepolia' })

      expect(rpcUrls).toEqual([...NETWORKS.sepolia.rpcFallbacks])
    })
  })

  describe('endpoints', () => {
    it('falls back to the network profile when no override is given', () => {
      expect(buildSepolia().endpoints.indexerGraphql).toBe(
        NETWORKS.sepolia.endpoints.indexerGraphql,
      )
    })

    it('prefers an override over the profile value', () => {
      const config = buildSepolia({
        network: 'sepolia',
        rpcUrl: SEPOLIA_RPC,
        overrides: { indexerGraphql: 'http://127.0.0.1:5655/graphql' },
      })

      expect(config.endpoints.indexerGraphql).toBe(
        'http://127.0.0.1:5655/graphql',
      )
    })

    it('ignores an undefined override, which is how unset env vars arrive', () => {
      const config = buildSepolia({
        network: 'sepolia',
        rpcUrl: SEPOLIA_RPC,
        overrides: { indexerGraphql: undefined },
      })

      expect(config.endpoints.indexerGraphql).toBe(
        NETWORKS.sepolia.endpoints.indexerGraphql,
      )
    })

    it('names the endpoint when a network has no deployment for it', () => {
      expect(() =>
        buildConfig({ network: 'mainnet', rpcUrl: 'https://rpc.example' }),
      ).toThrow(/no endpoint configured for: indexerGraphql/)
    })

    it('rejects a malformed override instead of passing it to fetch', () => {
      expect(() =>
        buildSepolia({
          network: 'sepolia',
          rpcUrl: SEPOLIA_RPC,
          overrides: { indexerGraphql: 'javascript:alert(1)' },
        }),
      ).toThrow(/endpoint indexerGraphql/)
    })
  })

  it('returns a frozen config so a consumer cannot repoint it at runtime', () => {
    const config = buildSepolia()

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.endpoints)).toBe(true)
    expect(Object.isFrozen(config.rpcUrls)).toBe(true)
  })
})

describe('NETWORKS', () => {
  it('covers every declared network', () => {
    expect(Object.keys(NETWORKS).sort()).toEqual([...ENS_NETWORKS].sort())
  })

  // The `satisfies` clause enforces this at compile time; asserting it here
  // catches a table edited through a cast.
  it('declares the same endpoint keys for every network', () => {
    const [first, ...rest] = ENS_NETWORKS.map((network) =>
      Object.keys(NETWORKS[network].endpoints).sort(),
    )

    for (const keys of rest) expect(keys).toEqual(first)
  })

  it('gives every network at least one rpc fallback', () => {
    for (const network of ENS_NETWORKS) {
      expect(NETWORKS[network].rpcFallbacks.length).toBeGreaterThan(0)
    }
  })
})

describe('undeployed contracts', () => {
  // ensjs holds an undeployed contract as the zero address rather than
  // omitting it, so a lookup succeeds and the call goes to 0x0. The build
  // guard is what turns that into a failure, and it must cover the reverse
  // set too now that ensjs carries those keys.
  it('fails a mainnet build naming every zero-address contract', () => {
    expect(() =>
      buildConfig({
        network: 'mainnet',
        overrides: { indexerGraphql: 'https://indexer.example/' },
      }),
    ).toThrow(/ensDefaultReverseRegistrar/)
  })

  it('does not fail sepolia, where they are deployed', () => {
    const { contracts } = buildSepolia().chain

    expect(contracts.ensDefaultReverseRegistrar.address).not.toMatch(/^0x0+$/)
    expect(contracts.ensReverseRegistrarAdapter.address).not.toMatch(/^0x0+$/)
  })
})

describe('empty-string environment values', () => {
  // Vite inlines `VITE_X=` and an unset CI variable as `''`, not `undefined`.
  // Both have to read as "not set", or the prebuild guard passes and the
  // bundle throws at module load.
  it('falls back to the profile endpoint on an empty override', () => {
    const config = buildConfig({
      network: 'sepolia',
      overrides: { indexerGraphql: '' },
    })

    expect(config.endpoints.indexerGraphql).toBe(
      NETWORKS.sepolia.endpoints.indexerGraphql,
    )
  })

  it('falls back to the shared endpoints on an empty rpcUrl', () => {
    const config = buildConfig({ network: 'sepolia', rpcUrl: '' })

    expect(config.rpcUrls).toEqual(NETWORKS.sepolia.rpcFallbacks)
  })
})
