import { describe, expect, it } from 'vitest'
import { assertDeploymentEnvironment } from './assertDeploymentEnvironment'

describe('deployment environment agreement', () => {
  it.each(['development', 'production', 'test'])(
    'keeps %s on the default Sepolia Worker',
    (mode) => {
      expect(() =>
        assertDeploymentEnvironment({ VITE_ENS_NETWORK: 'sepolia' }, mode),
      ).not.toThrow()
    },
  )

  it('accepts the mainnet file selection', () => {
    expect(() =>
      assertDeploymentEnvironment(
        { VITE_ENS_NETWORK: 'mainnet', CLOUDFLARE_ENV: 'mainnet' },
        'mainnet',
      ),
    ).not.toThrow()
  })

  it.each([
    ['mainnet', undefined, 'mainnet'],
    ['sepolia', 'mainnet', 'mainnet'],
    ['mainnet', 'mainnet', 'production'],
    ['sepolia', undefined, 'mainnet'],
    ['sepolia', 'sepolia', 'development'],
  ])('rejects network %s, Worker %s, mode %s', (network, worker, mode) => {
    expect(() =>
      assertDeploymentEnvironment(
        { VITE_ENS_NETWORK: network, CLOUDFLARE_ENV: worker },
        mode as string,
      ),
    ).toThrow()
  })
})
