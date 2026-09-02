import { createSetForwardResolutionRequest } from '@ens-apps/l2-primary/utils'
import type { Signer } from '@ens-apps/transaction-manager'
import type { Address, Hex, PublicClient, WalletClient } from 'viem'
import { setForwardResolution } from '@/features/reverse-resolution/helpers/setForwardResolution'
import { MAINNET_COIN_TYPE } from '@/lib/coinType'

type SetEthAddressParameters = {
  readonly name: string
  /**
   * The resolver set on the name's *own* registry slot — see `getOwnResolver`.
   * Passed in rather than resolved here: the UniversalResolver would hand back
   * an ancestor's resolver for a name that has none, and writing this name's
   * record there targets a resolver the sender doesn't own (and usually isn't
   * authorized on, reverting before the token transfer step).
   */
  readonly resolverAddress: Address
  readonly recipient: Address
  readonly walletClient: WalletClient
  readonly publicClient: PublicClient
  readonly signer: Signer
  readonly chainId: number
  readonly id: string
}

/**
 * Point the name's ETH address record (`addr(60)`) at the recipient, so the
 * previous owner can no longer re-claim it as their primary name.
 */
export const setEthAddress = async ({
  name,
  resolverAddress,
  recipient,
  walletClient,
  publicClient,
  signer,
  chainId,
  id,
}: SetEthAddressParameters): Promise<{ txId: string; hash: Hex }> => {
  const request = createSetForwardResolutionRequest({
    name,
    coinType: MAINNET_COIN_TYPE,
    resolverAddress,
    targetAddress: recipient,
  })

  return setForwardResolution({
    name,
    request,
    walletClient,
    publicClient,
    signer,
    chainId,
    id,
    description: `Point ETH address for ${name} to the recipient`,
  })
}
