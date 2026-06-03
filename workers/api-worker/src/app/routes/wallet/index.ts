import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { vValidator } from '@hono/valibot-validator'
import { HTTPException } from 'hono/http-exception'
import * as v from 'valibot'
import {
  createClient,
  type Hex,
  http,
  multicall3Abi,
  publicActions,
  walletActions,
} from 'viem'
import { type Address, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { encodeFunctionData, parseUnits } from 'viem/utils'
import { injectDb } from '#app/middleware/database.js'
import { createApp } from '#app/middleware/hono.js'
import { SEPOLIA_RPC_URL } from '#core/eth/client.js'
import { logger } from '#utils/logger.js'
import { ethAddress } from '#utils/validation.js'

const TOKENS = {
  USDC: {
    address: ensL1Contracts[supportedL1Chains.sepolia].usdc.address,
    decimals: 6,
    mintAmount: parseUnits('1000', 6),
  },
  DAI: {
    // MockDAI on Sepolia (not yet exported by ensjs). Must match
    // `SUPPORTED_TOKENS.DAI` in
    // `@ens-apps/transaction-manager/contracts/ens-sepolia`.
    address: ensL1Contracts[supportedL1Chains.sepolia].dai.address,
    decimals: 18,
    mintAmount: parseUnits('1000', 18),
  },
} as const

const ERC20_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' as const },
      { name: 'amount', type: 'uint256' as const },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable' as const,
    type: 'function' as const,
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      {
        name: 'account',
        type: 'address',
      },
    ],
    outputs: [
      {
        type: 'uint256',
      },
    ],
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
    transport: http(SEPOLIA_RPC_URL),
    account: walletAccount,
  })
    .extend(publicActions)
    .extend(walletActions)
}

type WalletClient = ReturnType<typeof createWalletClient>

const getErc20Balance = async (
  walletClient: WalletClient,
  address: Address,
  tokenAddress: Address,
) => {
  const balance = await walletClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address],
  })
  return balance
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

      const [usdcBalance, daiBalance] = await Promise.all([
        getErc20Balance(walletClient, address, TOKENS.USDC.address),
        getErc20Balance(walletClient, address, TOKENS.DAI.address),
      ])

      logger.debug('Checked faucet balances', {
        usdcBalance,
        daiBalance,
        address,
      })

      // Don't send out tokens if they already have enough to prevent abuse
      if (
        usdcBalance >= TOKENS.USDC.mintAmount / 10n &&
        daiBalance >= TOKENS.DAI.mintAmount / 10n
      ) {
        logger.debug('Already have enough tokens, skipping', {
          usdcBalance,
          daiBalance,
          address,
        })
        return c.json({ txHash: null })
      }

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
                abi: ERC20_ABI,
                functionName: 'mint',
                args: [address, TOKENS.USDC.mintAmount],
              }),
            },
            {
              target: TOKENS.DAI.address,
              allowFailure: false,
              callData: encodeFunctionData({
                abi: ERC20_ABI,
                functionName: 'mint',
                args: [address, TOKENS.DAI.mintAmount],
              }),
            },
          ],
        ],
      })

      logger.debug('Multicall transaction sent', {
        multicall: multicallTxHash,
        address,
      })

      const receipt = await walletClient.waitForTransactionReceipt({
        hash: multicallTxHash,
      })

      logger.debug('Multicall transaction confirmed', {
        receipt,
        address,
      })

      return c.json({ txHash: receipt.transactionHash })
    },
  )
