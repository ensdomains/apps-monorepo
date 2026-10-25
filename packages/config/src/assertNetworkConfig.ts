import {
  type BuildConfigInput,
  buildConfig,
  type EndpointKey,
  NetworkConfigError,
} from './buildConfig.ts'

/**
 * Build-time guard: resolve the network configuration from a loaded env and
 * exit non-zero if it is unusable.
 *
 * The apps resolve the same config at boot, but that only surfaces after a
 * deploy. Running the identical pure `buildConfig` in the Vite config moves
 * the failure into CI, so a build whose network is unset, unknown, or missing
 * an ENSv2 deployment never ships.
 *
 * Takes an already-loaded env rather than reading `process.env` so callers can
 * pass Vite's `loadEnv`, which applies the same `.env` precedence the app will
 * see at build time. `endpoints` and `allowMissingEndpoints` must match the
 * app's own call.
 */
export const assertNetworkConfig = (
  env: Readonly<Record<string, string | undefined>>,
  {
    endpoints,
    allowMissingEndpoints,
  }: Pick<
    BuildConfigInput<EndpointKey, boolean>,
    'endpoints' | 'allowMissingEndpoints'
  > = {},
) => {
  try {
    const config = buildConfig({
      network: env.VITE_ENS_NETWORK,
      rpcUrl: env.VITE_RPC_URL,
      ...(endpoints && { endpoints }),
      overrides: {
        bignameApi: env.VITE_BIGNAME_API_URL,
      },
      allowMissingEndpoints,
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
