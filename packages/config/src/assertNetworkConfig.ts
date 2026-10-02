import { buildConfig, NetworkConfigError } from './buildConfig'

/**
 * Build-time guard: resolve the network configuration from a loaded env and
 * exit non-zero if it is unusable.
 *
 * The apps resolve the same config at boot, but that only surfaces after a
 * deploy. Running the identical pure `buildConfig` as a `prebuild` step moves
 * the failure into CI, so a build whose network is unset, unknown, or missing
 * an ENSv2 deployment never ships.
 *
 * Takes an already-loaded env rather than reading `process.env` so callers can
 * pass Vite's `loadEnv`, which applies the same `.env` precedence the app will
 * see at build time.
 */
export const assertNetworkConfig = (
  env: Readonly<Record<string, string | undefined>>,
) => {
  try {
    const config = buildConfig({
      network: env.VITE_ENS_NETWORK,
      rpcUrl: env.VITE_SEPOLIA_RPC_URL,
      overrides: {
        indexerGraphql: env.VITE_INDEXER_GRAPHQL_URL,
        bignameApi: env.VITE_BIGNAME_API_URL,
      },
    })
    return config
  } catch (error) {
    if (error instanceof NetworkConfigError) {
      throw new NetworkConfigError(
        `${error.message}\n\nSet VITE_ENS_NETWORK in the app's .env (or the deploy environment).`,
      )
    }
    throw error
  }
}
