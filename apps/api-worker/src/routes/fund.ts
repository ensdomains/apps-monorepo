import { HTTPException } from 'hono/http-exception'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatUnits,
  type Hex,
  http,
  parseUnits,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import { createApp } from '../utils/hono'
import { logger, prettifyError } from '../utils/logger'

const app = createApp()

const MOCK_USDC_ADDRESS: Address = '0x9028ab8e872af36c30c959a105cb86d1038412ae'
const MOCK_DAI_ADDRESS: Address = '0x6630589c2e6364a96bb7acf0d9d64ac9c1dd3528'

const MINT_AMOUNT = parseUnits('1000', 18)
const USDC_MINT_AMOUNT = parseUnits('1000', 6)

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
] as const

const SEPOLIA_RPC_URL = 'https://ethereum-sepolia-rpc.publicnode.com'

app.post('/fund-smart-account', async (c) => {
  try {
    const { accountAddress } = await c.req.json<{
      accountAddress: string
    }>()

    if (!accountAddress) {
      throw new HTTPException(400, {
        message: 'accountAddress is required',
      })
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(accountAddress)) {
      throw new HTTPException(400, {
        message: 'Invalid account address format',
      })
    }

    const privateKey = process.env.FUNDING_PRIVATE_KEY || ''
    if (!privateKey) {
      throw new HTTPException(500, {
        message: 'FUNDING_PRIVATE_KEY is not set',
      })
    }

    const formattedPrivateKey = privateKey.startsWith('0x')
      ? (privateKey as Hex)
      : (`0x${privateKey}` as Hex)

    if (formattedPrivateKey.length !== 66) {
      logger.error('Invalid private key format', {
        length: formattedPrivateKey.length,
        hasPrefix: formattedPrivateKey.startsWith('0x'),
      })
      throw new HTTPException(500, {
        message: 'Invalid private key format',
      })
    }

    const account = privateKeyToAccount(formattedPrivateKey)

    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
    })

    const walletClient = createWalletClient({
      chain: sepolia,
      transport: http(SEPOLIA_RPC_URL),
      account,
    })

    const walletAddress = account.address
    logger.info('Starting auto-funding', {
      wallet: walletAddress,
      targetAccount: accountAddress,
    })

    const balance = await publicClient.getBalance({
      address: walletAddress,
    })

    if (balance < parseUnits('0.001', 18)) {
      logger.error('Insufficient ETH for gas fees', {
        balance: formatUnits(balance, 18),
      })
      throw new HTTPException(500, {
        message: 'Insufficient funds for gas fees',
      })
    }

    const results: {
      daiTxHash?: string
      usdcTxHash?: string
      ethTxHash?: string
      errors?: string[]
    } = {}

    try {
      logger.info('Minting DAI', { to: accountAddress })
      const daiTxHash = await walletClient.writeContract({
        address: MOCK_DAI_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [accountAddress as Address, MINT_AMOUNT],
      })

      results.daiTxHash = daiTxHash
      logger.info('DAI mint transaction submitted', { txHash: daiTxHash })

      await publicClient.waitForTransactionReceipt({
        hash: daiTxHash,
      })
      logger.info('DAI mint transaction confirmed', { txHash: daiTxHash })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('Failed to mint DAI', { error: errorMessage })
      results.errors = results.errors || []
      results.errors.push(`DAI mint failed: ${errorMessage}`)
    }

    try {
      logger.info('Minting USDC', { to: accountAddress })
      const usdcTxHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [accountAddress as Address, USDC_MINT_AMOUNT],
      })

      results.usdcTxHash = usdcTxHash
      logger.info('USDC mint transaction submitted', { txHash: usdcTxHash })

      await publicClient.waitForTransactionReceipt({
        hash: usdcTxHash,
      })
      logger.info('USDC mint transaction confirmed', { txHash: usdcTxHash })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('Failed to mint USDC', { error: errorMessage })
      results.errors = results.errors || []
      results.errors.push(`USDC mint failed: ${errorMessage}`)
    }

    try {
      const ethAmount = parseUnits('0.01', 18)
      logger.info('Sending ETH to smart account for gas', {
        to: accountAddress,
        amount: formatUnits(ethAmount, 18),
      })

      const ethTxHash = await walletClient.sendTransaction({
        to: accountAddress as Address,
        value: ethAmount,
      })

      results.ethTxHash = ethTxHash
      logger.info('ETH transfer transaction submitted', { txHash: ethTxHash })

      await publicClient.waitForTransactionReceipt({
        hash: ethTxHash,
      })
      logger.info('ETH transfer transaction confirmed', { txHash: ethTxHash })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      logger.error('Failed to send ETH', { error: errorMessage })
      results.errors = results.errors || []
      results.errors.push(`ETH transfer failed: ${errorMessage}`)
    }

    const failedCount = results.errors?.length || 0
    const totalAttempts = 3
    if (failedCount === totalAttempts) {
      throw new HTTPException(500, {
        message: `All funding transactions failed: ${results.errors?.join('; ')}`,
      })
    }

    return c.json({
      success: true,
      ...results,
    })
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error
    }

    logger.error('Auto-funding error', {
      error: prettifyError(error),
    })

    return c.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      },
      500,
    )
  }
})

export default app
