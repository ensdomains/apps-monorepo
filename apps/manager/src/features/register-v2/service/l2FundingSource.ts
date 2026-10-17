import {
  buildCommitCall,
  type L2BridgeRoute,
  PERMIT2_ADDRESS,
} from '@ens-apps/smart-account'
import type { L2FundingSource } from '@ens-apps/transaction-manager'
import {
  type RhinestoneAccountConfig,
  walletClientToAccount,
} from '@rhinestone/sdk'
import { getConnectorClient } from '@wagmi/core'
import { type Address, erc20Abi, keccak256, maxUint256, toHex } from 'viem'
import { chain, l2Sources } from '@/config'
import type { L2Source } from '@/l2Sources'
import { createBridgeAccount } from '@/lib/smart-account/rhinestone'
import { HCA_PAYMENT_TOKEN } from '@/lib/smart-account/useSmartAccountBalances'
import { l2PublicClients, wagmiConfig } from '@/lib/wagmi'
import { ensureWalletChain } from '@/lib/wallet/ensureWalletChain'
import { followChain } from '@/lib/wallet/followChain'

export const findL2Source = (chainId: number): L2Source | undefined =>
  l2Sources.find((source) => source.chain.id === chainId)

const sourceClient = (source: L2Source) => {
  const client = l2PublicClients.get(source.chain.id)
  if (!client) throw new Error(`No client for chain ${source.chain.id}`)
  return client
}

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

/** Pays a registration's commit leg from the owner's USDC on `chainId`. */
export const getL2FundingSource = (
  owner: Address,
  chainId: number,
): L2FundingSource | undefined => {
  const source = findL2Source(chainId)
  if (!source) return undefined
  return {
    chain: source.chain,
    token: source.usdc,
    getAccount: async () =>
      createBridgeAccount({
        eoa: walletClientToAccount(await sourceWalletClient(owner, source)),
        sourceChainId: source.chain.id,
      }).match(
        (account) => account,
        (error) => {
          throw error
        },
      ),
    // Unlimited, once per L2: Permit2 only moves tokens against a signed permit.
    ensureAllowance: async (amount) => {
      const client = sourceClient(source)
      const allowance = await client.readContract({
        address: source.usdc,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [owner, PERMIT2_ADDRESS],
      })
      if (allowance >= amount) return
      const wallet = await sourceWalletClient(owner, source)
      const hash = await wallet.writeContract({
        address: source.usdc,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PERMIT2_ADDRESS, maxUint256],
      })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('The Permit2 approval reverted.')
      }
    },
  }
}

// A quote prices gas, so any commitment stands in for the real one.
const QUOTE_COMMITMENT = keccak256(toHex('ens-apps:l2-payment-quote'))

/** What a quote for paying `amountOut` into the HCA from `source` asks for. */
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
  calls: [buildCommitCall({ chainId: chain.id, commitment: QUOTE_COMMITMENT })],
})
