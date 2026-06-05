import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { vValidator } from '@hono/valibot-validator'
import { HTTPException } from 'hono/http-exception'
import * as v from 'valibot'
import {
  createClient,
  erc20Abi,
  type Hex,
  http,
  multicall3Abi,
  publicActions,
  walletActions,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { encodeFunctionData, parseUnits } from 'viem/utils'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { SEPOLIA_RPC_URL } from '#core/eth/client.js'
import { KV_KEY } from '#core/kv/index.js'
import { logger } from '#utils/logger.js'
import { ethAddress } from '#utils/validation.js'

const TOKENS = {
  USDC: {
    address: ensL1Contracts[supportedL1Chains.sepolia].usdc.address,
    decimals: 6,
    mintAmount: parseUnits('1000', 6),
  },
  DAI: {
    address: ensL1Contracts[supportedL1Chains.sepolia].dai.address,
    decimals: 18,
    mintAmount: parseUnits('1000', 18),
  },
} as const

// Standard ERC-20 reads (balanceOf) use viem's `erc20Abi`. Only
// `mint` is non-standard (MockERC20 faucet helper, not part of `erc20Abi`),
// so it stays a local fragment.
const MINT_ABI = [
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const createWalletClient = (privateKey: string | undefined) => {
  if (!privateKey || !privateKey.startsWith('0x')) {
    throw new HTTPException(500, {
      message: 'Server is not configured to fund wallets',
    })
  }

  const walletAccount = privateKeyToAccount(privateKey as Hex)
  logger.trace('Loaded wallet funding account', {
    walletAddress: walletAccount.address,
  })

  return createClient({
    chain: sepolia,
    // `batch: true` coalesces concurrent reads (the Promise.all below) into a
    // single JSON-RPC batch HTTP request — one round-trip without the on-chain
    // Multicall3 dependency.
    transport: http(SEPOLIA_RPC_URL, { batch: true }),
    account: walletAccount,
  })
    .extend(publicActions)
    .extend(walletActions)
}

export default createApp()
  .basePath('/wallet')
  .post(
    '/fund',
    injectDb,
    vValidator(
      'json',
      v.object({
        address: ethAddress,
      }),
    ),
    async (c) => {
      const { address } = c.req.valid('json')

      // Setup wallet
      const walletClient = createWalletClient(c.env.ETH_PRIVATE_KEY)

      // Serialize funding per address. Without this, concurrent /wallet/fund
      // calls for the same address each read the same (low) balances and each
      // mint — double-spending faucet funds and racing the funder's nonce. A
      // short-lived KV lock lets only one in-flight fund per address proceed;
      // others no-op. KV is best-effort across colos (fine for a testnet
      // faucet), and the TTL self-heals if a fund crashes mid-flight.
      const lockKey = KV_KEY.WALLET.FUND_LOCK(address)
      if (await c.env.KV.get(lockKey)) {
        logger.debug('Fund already in progress for address, skipping', {
          address,
        })
        return c.json({ txHash: null })
      }
      await c.env.KV.put(lockKey, 'locked', { expirationTtl: 60 })

      let txHash: Hex | null = null
      try {
        // Both token balances go out in a single JSON-RPC batch (see
        // `batch: true` on the transport).
        const [usdcBalance, daiBalance] = await Promise.all([
          walletClient.readContract({
            address: TOKENS.USDC.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          }),
          walletClient.readContract({
            address: TOKENS.DAI.address,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [address],
          }),
        ])

        logger.debug('Checked faucet state', {
          usdcBalance,
          daiBalance,
          address,
        })

        // Mint mock USDC/DAI unless the address already has enough (anti-abuse).
        const hasEnoughTokens =
          usdcBalance >= TOKENS.USDC.mintAmount / 10n &&
          daiBalance >= TOKENS.DAI.mintAmount / 10n
        if (hasEnoughTokens) {
          logger.debug('Already have enough tokens, skipping mint', {
            usdcBalance,
            daiBalance,
            address,
          })
        } else {
          const multicallTxHash = await walletClient.writeContract({
            address: sepolia.contracts.multicall3.address,
            abi: multicall3Abi,
            functionName: 'aggregate3',
            args: [
              [
                {
                  target: TOKENS.USDC.address,
                  allowFailure: false,
                  callData: encodeFunctionData({
                    abi: MINT_ABI,
                    functionName: 'mint',
                    args: [address, TOKENS.USDC.mintAmount],
                  }),
                },
                {
                  target: TOKENS.DAI.address,
                  allowFailure: false,
                  callData: encodeFunctionData({
                    abi: MINT_ABI,
                    functionName: 'mint',
                    args: [address, TOKENS.DAI.mintAmount],
                  }),
                },
              ],
            ],
          })

          logger.debug('Mint multicall sent', {
            multicall: multicallTxHash,
            address,
          })

          const receipt = await walletClient.waitForTransactionReceipt({
            hash: multicallTxHash,
          })

          logger.debug('Mint multicall confirmed', { receipt, address })
          txHash = receipt.transactionHash
        }
      } finally {
        await c.env.KV.delete(lockKey)
      }

      // Preserve the two-shape response so the inferred hc type stays
      // `{ txHash: Hex } | { txHash: null }` (what the manager expects).
      return txHash ? c.json({ txHash }) : c.json({ txHash: null })
    },
  )
