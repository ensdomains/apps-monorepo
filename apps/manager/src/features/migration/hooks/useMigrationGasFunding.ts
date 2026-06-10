import { logger } from '@ens-apps/utils/logger'
import { useEffect, useRef } from 'react'
import type { Address } from 'viem'
import { backendClient } from '@/utils/backend-client'

/**
 * Fire-and-forget migration gas funding.
 *
 * Every migration transaction is EOA-paid (the NFT approvals, the resolver
 * deploy, and the gas-heavy migrate batches all come from the owner's wallet
 * — none of it is Warp-sponsored), so the owner needs sepETH before they hit
 * "Begin upgrade". `/wallet/fund` decides server-side whether to drip: it tops
 * the address up to a target ETH balance only when it's low AND actually owns
 * v1 names (V1 subgraph check), so calling it on page entry is idempotent and
 * safe for owners with nothing to migrate.
 *
 * Fired once per owner address per mount (ref latch) so re-renders don't spam
 * the faucet; concurrent calls (e.g. the stablecoin auto-fund in
 * SmartAccountContext) are deduped by the worker's per-address KV lock.
 * Best-effort: a failed request only logs — the migration flow itself will
 * surface any out-of-gas failure to the user.
 */
export const useMigrationGasFunding = (
  ownerAddress: Address | string | null | undefined,
): void => {
  const lastRequestedRef = useRef<string | null>(null)

  useEffect(() => {
    if (!ownerAddress) return

    const key = ownerAddress.toLowerCase()
    if (lastRequestedRef.current === key) return
    lastRequestedRef.current = key

    backendClient.wallet.fund
      .$post({ json: { address: ownerAddress as Address } })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`)
        }
        logger.debug('Migration gas funding requested', { ownerAddress })
      })
      .catch((error) => {
        logger.warn('Migration gas funding request failed', {
          ownerAddress,
          error,
        })
      })
  }, [ownerAddress])
}
