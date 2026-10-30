import type { Signer } from '@ens-apps/transaction-manager'
import { useQuery } from '@tanstack/react-query'
import { useConnection } from 'wagmi'
import { resolveRenewalSigner } from '@/features/renew/utils/renewalPaymentRoute'
import { useSmartAccountContext } from '@/lib/smart-account'
import { getIsSafeWalletQueryOptions } from '@/lib/wallet/safe'

/** The signer single and bulk renewal send with; see `resolveRenewalSigner`. */
export const useRenewalSigner = (): Signer | null => {
  const { signer, walletClient } = useSmartAccountContext()
  const { connector, address } = useConnection()
  const safeWallet = useQuery({
    ...getIsSafeWalletQueryOptions({ connector, address }),
    enabled: !!connector,
  })

  return resolveRenewalSigner({
    signer,
    walletClient,
    connector,
    // An unreadable WalletConnect session is not a Safe, as at registration.
    isSafeWallet: safeWallet.isError ? false : safeWallet.data,
  })
}
