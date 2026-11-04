import { swapEthForUsdcActor } from '@ens-apps/transaction-manager'
import type { Address, PublicClient, WalletClient } from 'viem'
import {
  clearPendingEthSwap,
  readPendingEthSwap,
  savePendingEthSwap,
} from '@/features/register-v2/service/pendingEthSwap'

/** Pays a USDC renewal with the wallet's ETH, swapped into the wallet's USDC before the permit. */
export interface HcaRenewalEthFunding {
  /** USDC (6dp) the wallet must hold for the renewal's permit. */
  readonly usdcAmount: bigint
  /** The most ETH (wei) checkout showed the swap sending. */
  readonly displayedCharge?: bigint
}

/** Buys the USDC the wallet is short, counting a swap an earlier attempt sent. */
export const swapEthForRenewal = ({
  ethFunding,
  walletClient,
  ownerAddress,
  publicClient,
  chainId,
  signal,
}: {
  readonly ethFunding: HcaRenewalEthFunding
  readonly walletClient: WalletClient
  readonly ownerAddress: Address
  readonly publicClient: PublicClient
  readonly chainId: number
  readonly signal?: AbortSignal
}) =>
  swapEthForUsdcActor({
    permitValue: ethFunding.usdcAmount,
    ...(ethFunding.displayedCharge === undefined
      ? {}
      : { funding: { displayedCharge: ethFunding.displayedCharge } }),
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    pendingSwap: readPendingEthSwap(chainId, ownerAddress),
    onSwapSent: (swap) => savePendingEthSwap(chainId, ownerAddress, swap),
    ...(signal ? { signal } : {}),
  }).map((bought) => {
    clearPendingEthSwap(chainId, ownerAddress)
    return bought
  })
