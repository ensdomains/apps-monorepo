import type { L2BridgeRoute } from '@ens-apps/smart-account'
import type { L2FundingSource } from '@ens-apps/transaction-manager'
import {
  type RhinestoneAccountConfig,
  walletClientToAccount,
} from '@rhinestone/sdk'
import { getConnectorClient } from '@wagmi/core'
import { ResultAsync } from 'neverthrow'
import type { Address } from 'viem'
import { chain, l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'
import { createBridgeAccount } from '@/lib/smart-account/rhinestone'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import { wagmiConfig } from '@/lib/wagmi'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { followChain } from '@/lib/wallet/followChain'

const findL2Source = (chainId: number): L2Source | undefined =>
  l2Sources.find((source) => source.chain.id === chainId)

// Fresh per use, so a wallet that changed since the quote is caught by wagmi.
const sourceWalletClient = async (owner: Address, source: L2Source) =>
  followChain(
    await getConnectorClient(wagmiConfig, {
      account: owner,
      assertChainId: false,
      chainId: source.chain.id,
    }),
    source.chain,
    (chainId) => ensureWalletChain(wagmiConfig, chainId),
  )

/** Funds a registration from the owner's USDC on `chainId`. */
export const getL2FundingSource = (
  owner: Address,
  chainId: number,
): L2FundingSource | undefined => {
  const source = findL2Source(chainId)
  if (!source) return undefined
  return {
    chain: source.chain,
    token: source.usdc,
    // A wallet rejects with whatever it likes (often a bare `{ code, message }`),
    // so it is carried through untouched: the transport reads the reason off it.
    getAccount: () =>
      ResultAsync.fromPromise(
        sourceWalletClient(owner, source),
        (error) => error,
      ).andThen((walletClient) =>
        createBridgeAccount({
          eoa: walletClientToAccount(walletClient),
          sourceChainId: source.chain.id,
        }),
      ),
  }
}

/**
 * What a quote for paying `amountOut` into the HCA from `source` asks for. It
 * runs nothing on Sepolia: the legs then run from the HCA, as they would after
 * the permit.
 */
export const getL2QuoteRoute = ({
  owner,
  source,
  hca,
  amountOut,
}: {
  readonly owner: Address
  readonly source: L2Source
  readonly hca: Readonly<{ address: Address; config: RhinestoneAccountConfig }>
  readonly amountOut: bigint
}): L2BridgeRoute => ({
  owner,
  sourceChain: source.chain,
  sourceToken: source.usdc,
  targetChain: chain,
  targetToken: HCA_PAYMENT_TOKEN,
  amountOut,
  recipient: hca,
  calls: [],
})
