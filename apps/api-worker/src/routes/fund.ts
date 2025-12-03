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

// Token addresses on Sepolia (matching manager app)
const MOCK_USDC_ADDRESS: Address = '0x9028ab8e872af36c30c959a105cb86d1038412ae'
const MOCK_DAI_ADDRESS: Address = '0x6630589c2e6364a96bb7acf0d9d64ac9c1dd3528'

// Mint amounts
const MINT_AMOUNT = parseUnits('1000', 18) // 1000 DAI (18 decimals)
const USDC_MINT_AMOUNT = parseUnits('1000', 6) // 1000 USDC (6 decimals)

// ERC20 ABI for mint function
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

// Sepolia RPC URL
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

    // Get private key from environment
    const privateKey = c.env.FUNDING_PRIVATE_KEY as string | undefined
    if (!privateKey) {
      logger.error('FUNDING_PRIVATE_KEY not configured')
      throw new HTTPException(500, {
        message: 'Funding service not configured',
      })
    }

    // Ensure private key has 0x prefix
    const formattedPrivateKey = privateKey.startsWith('0x')
      ? (privateKey as Hex)
      : (`0x${privateKey}` as Hex)

    // Create account from private key
    const account = privateKeyToAccount(formattedPrivateKey)

    // Create clients
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

    // Check wallet balance
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
      errors?: string[]
    } = {}

    // Mint DAI
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

      // Wait for transaction (optional - can be async)
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

    // Mint USDC
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

      // Wait for transaction (optional - can be async)
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

    // Return success if at least one transaction succeeded
    if (results.errors && results.errors.length === 2) {
      throw new HTTPException(500, {
        message: `Both mints failed: ${results.errors.join('; ')}`,
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
