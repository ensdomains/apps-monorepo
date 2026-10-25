import { NetworkConfigError } from './errors.ts'

/** Keep the browser network and the plugin's Worker target in agreement. */
export const assertDeploymentEnvironment = (
  env: Readonly<Record<string, string | undefined>>,
  mode: string,
): void => {
  const workerEnvironment = env.CLOUDFLARE_ENV || ''
  if (workerEnvironment !== '' && workerEnvironment !== 'mainnet') {
    throw new NetworkConfigError(
      'Only the default Sepolia Worker and CLOUDFLARE_ENV=mainnet are configured.',
    )
  }
  const expectedNetwork =
    workerEnvironment === 'mainnet' ? 'mainnet' : 'sepolia'
  if (env.VITE_ENS_NETWORK !== expectedNetwork) {
    throw new NetworkConfigError(
      `Worker targets ${expectedNetwork}, but VITE_ENS_NETWORK=${env.VITE_ENS_NETWORK}. Use --mode mainnet for mainnet, or the default mode for Sepolia.`,
    )
  }
  if ((mode === 'mainnet') !== (workerEnvironment === 'mainnet')) {
    throw new NetworkConfigError(
      'Mainnet requires --mode mainnet and CLOUDFLARE_ENV=mainnet together. Keep environment selection out of .env.local.',
    )
  }
}
