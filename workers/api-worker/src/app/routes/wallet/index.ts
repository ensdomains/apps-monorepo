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
import { logger } from '#utils/logger.js'
import { ethAddress } from '#utils/validation.js'

const TOKENS = {
  USDC: {
    address: '0xf2942507cb33422a800ff9aa4cb05522a5e1d9e6',
    decimals: 6,
    mintAmount: parseUnits('1000', 6),
  },
  DAI: {
    address: '0xb21412bb6816601dd840b93a5d19a8fe671cb74e',
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
    transport: http(
      'https://virtual.sepolia.us-east.rpc.tenderly.co/881ddb0f-475d-45ac-b93d-e1aca2841811',
    ),
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
