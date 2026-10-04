import { describe, expect, it } from 'vitest'
import { assertNetworkConfig } from './assertNetworkConfig'
import { buildConfig, NetworkConfigError } from './buildConfig'

describe('assertNetworkConfig', () => {
  it('returns the resolved config for a usable env', () => {
    const config = assertNetworkConfig({ VITE_ENS_NETWORK: 'sepolia' })

    expect(config.network).toBe('sepolia')
  })

  it('applies the rpc and bigname overrides from env', () => {
    const config = assertNetworkConfig({
      VITE_ENS_NETWORK: 'sepolia',
      VITE_SEPOLIA_RPC_URL: '/rpc',
      VITE_BIGNAME_API_URL: 'http://127.0.0.1:4010',
    })

    expect(config.rpcUrls[0]).toBe('/rpc')
    expect(config.endpoints.bignameApi).toBe('http://127.0.0.1:4010')
  })

  it('treats an empty string like an unset variable', () => {
    const config = assertNetworkConfig({
      VITE_ENS_NETWORK: 'sepolia',
      VITE_BIGNAME_API_URL: '',
    })

    expect(config.endpoints.bignameApi).toBe('https://sepolia.api.bigname.sh')
  })

  it('points at the variable to set when the network is missing', () => {
    expect(() => assertNetworkConfig({})).toThrow(/Set VITE_ENS_NETWORK/)
  })

  // The build must not produce a bundle aimed at contracts that do not exist.
  it('refuses a network with no ENSv2 deployment', () => {
    expect(() =>
      assertNetworkConfig({
        VITE_ENS_NETWORK: 'mainnet',
        VITE_BIGNAME_API_URL: 'https://bigname.example/',
      }),
    ).toThrow(/ENSv2 is not deployed/)
  })
})

describe('runtime independence', () => {
  // The worker resolves the same config from Cloudflare bindings, so the
  // failure messages must not name a Vite-only variable.
  it('does not mention VITE_ vars when the network is missing', () => {
    // Asserted separately so the test still fails if buildConfig stops
    // throwing: a single try/catch would pass on the assertion error instead.
    expect(() => buildConfig({ network: undefined })).toThrow(
      NetworkConfigError,
    )
    expect(() => buildConfig({ network: undefined })).not.toThrow(/VITE_/)
  })
})
