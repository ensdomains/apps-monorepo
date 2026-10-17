import {
  buildCommitCall,
  buildRevealBatch,
  computeResolverAddress,
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

// A quote prices gas, so a stand-in secret and commitment do.
const QUOTE_SECRET = keccak256(toHex('ens-apps:l2-payment-quote'))

export type L2QuoteParams = Readonly<{
  owner: Address
  source: L2Source
  hca: Readonly<{ address: Address; config: RhinestoneAccountConfig }>
  label: string
  duration: bigint
  price: bigint
  primaryName: string | undefined
}>

/**
 * The two intents a registration paid from `source` runs, as the registration
 * machine builds them: the commit, delivering one unit, and the reveal,
 * delivering the price.
 */
export const getL2QuoteRoutes = (
  params: L2QuoteParams,
  resolverDeployed: boolean,
): readonly [L2BridgeRoute, L2BridgeRoute] => {
  const leg = (amountOut: bigint, calls: L2BridgeRoute['calls']) => ({
    owner: params.owner,
    sourceChain: params.source.chain,
    sourceToken: params.source.usdc,
    targetChain: chain,
    targetToken: HCA_PAYMENT_TOKEN,
    amountOut,
    recipient: params.hca,
    calls,
  })
  return [
    leg(1n, [buildCommitCall({ chainId: chain.id, commitment: QUOTE_SECRET })]),
    leg(
      params.price,
      buildRevealBatch({
        chainId: chain.id,
        hca: params.hca.address,
        resolver: getL2QuoteResolver(params),
        resolverDeployed,
        label: params.label,
        wallet: params.owner,
        secret: QUOTE_SECRET,
        price: params.price,
        duration: params.duration,
        ...(params.primaryName ? { setPrimaryName: params.primaryName } : {}),
      }),
    ),
  ]
}

/** The HCA's resolver, which the reveal deploys if it is not there yet. */
export const getL2QuoteResolver = (params: L2QuoteParams) =>
  computeResolverAddress({ chainId: chain.id, hca: params.hca.address })
