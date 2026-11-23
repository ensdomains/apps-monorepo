import { type ConfigEnv, defineConfig, type UserConfig } from 'vite'
import base from './vite.config'

// Local real-wallet harness only. No contract results or wallet capabilities
// are stubbed. Keep all app failover reads on the same fork as MetaMask.
export default defineConfig(async (environment: ConfigEnv) => {
  const config = await (base as (env: ConfigEnv) => UserConfig)(environment)
  return {
    ...config,
    cacheDir: '../../node_modules/.vite-real-wallet-approval',
    plugins: [
      ...(config.plugins ?? []),
      {
        name: 'approval-local-fork-isolation',
        enforce: 'pre' as const,
        transform(code: string, id: string) {
          if (
            id
              .split('?')[0]
              .endsWith(
                '/packages/transaction-manager/src/actors/eoa-transport.actor.ts',
              )
          ) {
            return code.replace(
              'return safeSendTransaction(signer.walletClient, txParams)',
              "console.warn('[approval-submitted-gas]', String(txParams.gas), txParams.to); return safeSendTransaction(signer.walletClient, txParams)",
            )
          }
          if (
            id
              .split('?')[0]
              .endsWith(
                '/packages/transaction-manager/src/hooks/useAtomicBatchSupport.ts',
              )
          ) {
            return code.replace(
              "return data?.atomic?.status === 'supported'",
              "console.warn('[approval-wallet-capabilities]', JSON.stringify(data)); return data?.atomic?.status === 'supported'",
            )
          }
          if (
            id
              .split('?')[0]
              .endsWith(
                '/apps/manager/src/features/migration/pages/MigrationPage.tsx',
              )
          ) {
            return code.replace(
              'const canBatchAtomically = useAtomicBatchSupport(chain.id)',
              `if (hcaError) console.warn('[approval-account-error]', String(hcaError))
              const canBatchAtomically = useAtomicBatchSupport(chain.id)`,
            )
          }
          if (
            id.split('?')[0].endsWith('/packages/config/src/buildConfig.ts')
          ) {
            return code.replace(
              'const rpcUrls = orderedRpcUrls(primaryRpcUrl, profile.rpcFallbacks)',
              'const rpcUrls = [primaryRpcUrl]',
            )
          }
          if (
            id
              .split('?')[0]
              .endsWith('/apps/manager/src/lib/posthog/provider.tsx')
          ) {
            return code.replace(
              ';(window as Window & { posthog?: typeof posthog }).posthog = posthog',
              `;(window as Window & { posthog?: typeof posthog }).posthog = posthog
              posthog.featureFlags.overrideFeatureFlags({ flags: { migration: true, 'profile-view-new': true, 'migration-subname-recreation': true } })`,
            )
          }
        },
      },
    ],
  }
})
