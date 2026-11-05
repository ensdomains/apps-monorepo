import { swapEthForUsdcActor } from '@ens-apps/transaction-manager'
import { readHcaUsdcBalanceAtLeastActor } from '@ens-apps/transaction-manager/machines/registration/registration.hca.actors'
import { errAsync, okAsync, type ResultAsync } from 'neverthrow'
import type { Address, PublicClient, WalletClient } from 'viem'
import { isAddressEqual } from 'viem'
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
  readonly displayedCharge: bigint
}

/** Buys the USDC the wallet is short, counting a swap an earlier attempt sent, and waits until a read shows it. */
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
}): ResultAsync<bigint, Error> => {
  if (
    !walletClient.account ||
    !isAddressEqual(walletClient.account.address, ownerAddress)
  ) {
    return errAsync(
      new Error(
        'Cannot pay with ETH - the connected wallet does not control the owner address.',
      ),
    )
  }
  return swapEthForUsdcActor({
    permitValue: ethFunding.usdcAmount,
    funding: { displayedCharge: ethFunding.displayedCharge },
    approvalSigner: { type: 'eoa', walletClient },
    publicClient,
    pendingSwap: readPendingEthSwap(chainId, ownerAddress),
    onSwapSent: (swap) => savePendingEthSwap(chainId, ownerAddress, swap),
    ...(signal ? { signal } : {}),
  }).andThen((bought) => {
    clearPendingEthSwap(chainId, ownerAddress)
    // The permit's plan reads the wallet at latest, possibly on a node behind the swap's receipt.
    return bought === 0n
      ? okAsync(bought)
      : readHcaUsdcBalanceAtLeastActor({
          hca: ownerAddress,
          publicClient,
          chainId,
          atLeast: ethFunding.usdcAmount,
          ...(signal ? { signal } : {}),
        }).map(() => bought)
  })
}
