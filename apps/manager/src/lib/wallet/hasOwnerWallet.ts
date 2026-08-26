import {
  type Account,
  type Address,
  isAddressEqual,
  type WalletClient,
} from 'viem'

/**
 * Require a wallet client bound to the expected owner account. This prevents
 * an account switch between an access probe and the transaction submission
 * from routing the write through a different wallet.
 */
export const hasOwnerWallet = (
  walletClient: WalletClient | null | undefined,
  ownerAddress: Address | null | undefined,
): walletClient is WalletClient & { account: Account } =>
  Boolean(
    walletClient?.account &&
      ownerAddress &&
      isAddressEqual(walletClient.account.address, ownerAddress),
  )
