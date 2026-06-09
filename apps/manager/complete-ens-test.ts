// #!/usr/bin / env tsx

/**
 * Complete ENS Registration Test Suite with Rhinestone SDK v1.0.2
 *
 * This single file contains everything needed to test ENS registration:
 * 1. Account creation and funding using Rhinestone SDK v1.0.2
 * 2. Token minting and balance checking
 * 3. Complete ENS registration flow using sponsored intents (not user operations)
 * 4. Comprehensive testing and error handling
 *
 * Usage:
 * 1. Set your RHINESTONE_API_KEY and PRIVATE_KEY environment variables
 * 3. Run: npx tsx complete-ens-test.ts
 *
 * Features:
 * - Uses Rhinestone SDK v1.0.2 with sponsored intents (intent-based transactions)
 * - Uses FastTestETHRegistrar (no commit time)
 * - Supports ERC20 token payments (USDC/DAI)
 * - Automatic account funding with balance checking
 * - Complete error handling and helpful messages
 * - Uses sponsored transactions (gas paid by sponsor, not user operations)
 * - Ready for integration into your app
 */

import { SEPOLIA_RPC_URL } from '@ens-apps/indexer/chain'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import { type RhinestoneAccount, RhinestoneSDK } from '@rhinestone/sdk'
import {
  type Chain,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import { type PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

// ============================================================================
// CONFIGURATION
// ============================================================================

// ENS Sepolia contract addresses (using FastTestETHRegistrar for 0 commitment time)
// Addresses match packages/transaction-manager/src/contracts/ens-sepolia.ts
const ENS_CONTRACTS = {
  REGISTRY: '0xf332544e6234f1ca149907d0d4658afd5feb6831' as `0x${string}`, // ETHRegistry
  REGISTRAR_CONTROLLER:
    '0x3334f0ebcbc4b5b7067f3aff25c6da8973690d54' as `0x${string}`, // FastTestETHRegistrar
  PUBLIC_RESOLVER:
    '0xa20b41dc7336c4d974e3c9a6ea01b77647559c46' as `0x${string}`, // DedicatedResolverImpl
}

// Supported payment tokens on Sepolia ENS, sourced from the ensjs Sepolia
// chain config so they can't drift from the tokens the app reads.
const ensjsSepolia = ensL1Contracts[supportedL1Chains.sepolia]
const SUPPORTED_TOKENS = {
  USDC: ensjsSepolia.usdc.address, // MockUSDC
  DAI: ensjsSepolia.dai.address, // MockDAI
}

const PIMLICO_API_KEY = ''
const RHINESTONE_API_KEY = ''
const PRIVATE_KEY = '' as `0x${string}`

// FastTestETHRegistrar ABI (key functions) testname6208
const FAST_TEST_REGISTRAR_ABI = [
  {
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    name: 'commit',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'commitment', type: 'bytes32' }],
    name: 'commitmentAt',
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'secret', type: 'bytes32' },
      { name: 'subregistry', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
      { name: 'referrer', type: 'bytes32' },
    ],
    name: 'register',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'secret', type: 'bytes32' },
      { name: 'subregistry', type: 'address' },
      { name: 'resolver', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'referrer', type: 'bytes32' },
    ],
    name: 'makeCommitment',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'pure',
    type: 'function',
  },
  {
    inputs: [],
    name: 'MIN_COMMITMENT_AGE',
    outputs: [{ name: '', type: 'uint64' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxCommitmentAge',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'name', type: 'string' }],
    name: 'isAvailable',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'name', type: 'string' },
      { name: 'owner', type: 'address' },
      { name: 'duration', type: 'uint64' },
      { name: 'paymentToken', type: 'address' },
    ],
    name: 'rentPrice',
    outputs: [
      { name: 'base', type: 'uint256' },
      { name: 'premium', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'token', type: 'address' }],
    name: 'isPaymentToken',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

// ERC20 ABI for token interactions
const ERC20_ABI = [
  {
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

// Create clients
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
})

const walletClient = createWalletClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
})

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check ETH balance of an address
 */
async function checkEthBalance(address: `0x${string}`): Promise<bigint> {
  const balance = await publicClient.getBalance({ address })
  console.log(`💰 ETH Balance: ${formatUnits(balance, 18)} ETH`)
  return balance
}

/**
 * Check token balance of an address
 */
async function checkTokenBalance(
  tokenAddress: `0x${string}`,
  ownerAddress: `0x${string}`,
  tokenName: string,
): Promise<bigint> {
  try {
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [ownerAddress],
    })

    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })

    console.log(
      `💰 ${tokenName} Balance: ${formatUnits(balance, decimals)} ${tokenName}`,
    )
    return balance
  } catch (error) {
    console.log(`❌ Failed to check ${tokenName} balance:`, error)
    return 0n
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Send ETH to an address
 */
async function sendEth(
  fromAccount: PrivateKeyAccount,
  toAddress: `0x${string}`,
  amountEth: string,
): Promise<string> {
  const amountWei = parseUnits(amountEth, 18)

  console.log(`📤 Sending ${amountEth} ETH to ${toAddress}...`)

  const hash = await walletClient.sendTransaction({
    account: fromAccount,
    to: toAddress,
    value: amountWei,
  })

  console.log(`✅ ETH transaction sent: ${hash}`)

  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`✅ ETH transaction confirmed in block ${receipt.blockNumber}`)

  return hash
}

/**
 * Mint tokens to an address
 */
async function mintTokens(
  fromAccount: PrivateKeyAccount,
  tokenAddress: `0x${string}`,
  toAddress: `0x${string}`,
  amount: string,
  tokenName: string,
): Promise<string> {
  try {
    // Get token decimals
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })

    const amountWei = parseUnits(amount, decimals)

    console.log(`📤 Minting ${amount} ${tokenName} to ${toAddress}...`)

    const hash = await walletClient.sendTransaction({
      account: fromAccount,
      to: tokenAddress,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [toAddress, amountWei],
      }),
    })

    console.log(`✅ ${tokenName} mint transaction sent: ${hash}`)

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    console.log(
      `✅ ${tokenName} mint transaction confirmed in block ${receipt.blockNumber}`,
    )

    return hash
  } catch (error) {
    console.error(`❌ Failed to mint ${tokenName}:`, error)
    throw error
  }
}

// ============================================================================
// RHINESTONE ACCOUNT MANAGEMENT
// ============================================================================

/**
 * Create Rhinestone account and get its address using SDK v1.0.2
 */
async function createRhinestoneAccountAndGetAddress(): Promise<string> {
  console.log('🦏 Creating Rhinestone account...')

  if (!RHINESTONE_API_KEY || !PRIVATE_KEY) {
    throw new Error(
      '❌ RHINESTONE_API_KEY and PRIVATE_KEY environment variables are required',
    )
  }

  const ownerAccount = privateKeyToAccount(PRIVATE_KEY)
  console.log('👤 EOA Account:', ownerAccount.address)

  try {
    console.log('🔧 Initializing Rhinestone SDK...')

    // Initialize SDK instance with Pimlico bundler
    const sdk = new RhinestoneSDK({
      apiKey: RHINESTONE_API_KEY,
      bundler: {
        type: 'pimlico',
        apiKey: PIMLICO_API_KEY,
      },
    })

    console.log('✅ SDK initialized successfully')

    // Create Rhinestone account using the SDK
    const rhinestoneAccount = await sdk.createAccount({
      owners: {
        type: 'ecdsa',
        accounts: [ownerAccount],
      },
    })

    console.log('🦏 Rhinestone account object received:', rhinestoneAccount)

    // Validate the account was created properly
    if (!rhinestoneAccount.getAddress || !rhinestoneAccount.sendTransaction) {
      throw new Error(
        '❌ Rhinestone account creation failed.\n\n' +
          'The account object was created but is missing required methods.\n' +
          'This indicates the API key is invalid or account creation failed.\n\n' +
          'Please verify your API key and try again.',
      )
    }

    const smartAccountAddress = rhinestoneAccount.getAddress()

    if (!smartAccountAddress) {
      throw new Error(
        '❌ Failed to get account address.\n\n' +
          'Account creation appeared to succeed but returned no address.\n' +
          'This usually indicates an API key or configuration issue.',
      )
    }

    console.log('✅ Rhinestone account created successfully!')
    console.log('📍 Account address:', smartAccountAddress)
    console.log(
      '🏗️  Account type:',
      rhinestoneAccount.config?.account?.type || 'default',
    )
    console.log('💡 Make sure to fund THIS address with Sepolia ETH')

    return smartAccountAddress
  } catch (error) {
    console.error('Failed to create Rhinestone account:', error)

    if (error instanceof Error) {
      if (
        error.message.includes('Invalid API key') ||
        error.message.includes('401') ||
        error.message.includes('authentication')
      ) {
        throw new Error(
          '❌ INVALID RHINESTONE API KEY\n\n' +
            "The API key you're using is invalid or expired.\n\n" +
            'To fix this:\n' +
            '1. Get a valid API key from: https://docs.rhinestone.dev\n' +
            '2. Set it in environment: RHINESTONE_API_KEY=your_key\n' +
            '3. Make sure it starts with "rs_"\n\n' +
            'Note: Without a valid API key, you CANNOT use Rhinestone SDK.',
        )
      }
    }

    throw error
  }
}

/**
 * Fund Rhinestone account with ETH and tokens
 */
async function fundRhinestoneAccount(smartAccountAddress: string) {
  console.log('💰 Funding Rhinestone account...')

  if (!PRIVATE_KEY) {
    throw new Error('❌ PRIVATE_KEY environment variable is required')
  }

  // Create account from private key
  const account = privateKeyToAccount(PRIVATE_KEY)

  // Check EOA ETH balance first
  console.log('🔍 Checking EOA ETH balance...')
  const eoaEthBalance = await checkEthBalance(account.address)

  if (eoaEthBalance < parseUnits('0.01', 18)) {
    console.log(
      '⚠️  EOA has low ETH balance. You may need to fund it from a faucet.',
    )
    console.log('   Sepolia Faucet: https://sepoliafaucet.com/')
    console.log('')
  }

  // Check Rhinestone account balances
  console.log('🔍 Checking Rhinestone account balances...')
  const rhinestoneEthBalance = await checkEthBalance(
    smartAccountAddress as `0x${string}`,
  )
  const rhinestoneUsdcBalance = await checkTokenBalance(
    SUPPORTED_TOKENS.USDC,
    smartAccountAddress as `0x${string}`,
    'USDC',
  )
  const rhinestoneDaiBalance = await checkTokenBalance(
    SUPPORTED_TOKENS.DAI,
    smartAccountAddress as `0x${string}`,
    'DAI',
  )

  console.log('')

  // Fund with ETH if needed (minimum 0.01 ETH for gas)
  const minEthRequired = parseUnits('0.01', 18)
  if (rhinestoneEthBalance < minEthRequired) {
    console.log('💰 Funding Rhinestone account with ETH...')
    await sendEth(account, smartAccountAddress as `0x${string}`, '0.01')
    console.log('')
  } else {
    console.log('✅ Rhinestone account has sufficient ETH balance')
  }

  // Fund with USDC if needed (minimum 100 USDC for testing)
  const minUsdcRequired = parseUnits('100', 6) // USDC has 6 decimals
  if (rhinestoneUsdcBalance < minUsdcRequired) {
    console.log('💰 Funding Rhinestone account with USDC...')
    await mintTokens(
      account,
      SUPPORTED_TOKENS.USDC,
      smartAccountAddress as `0x${string}`,
      '1000',
      'USDC',
    )
    console.log('')
  } else {
    console.log('✅ Rhinestone account has sufficient USDC balance')
  }

  // Fund with DAI if needed (minimum 100 DAI for testing)
  const minDaiRequired = parseUnits('100', 18) // DAI has 18 decimals
  if (rhinestoneDaiBalance < minDaiRequired) {
    console.log('💰 Funding Rhinestone account with DAI...')
    await mintTokens(
      account,
      SUPPORTED_TOKENS.DAI,
      smartAccountAddress as `0x${string}`,
      '1000',
      'DAI',
    )
    console.log('')
  } else {
    console.log('✅ Rhinestone account has sufficient DAI balance')
  }

  // Final balance check
  console.log('🎉 Funding Complete! Final balances:')
  console.log('=====================================')
  await checkEthBalance(smartAccountAddress as `0x${string}`)
  await checkTokenBalance(
    SUPPORTED_TOKENS.USDC,
    smartAccountAddress as `0x${string}`,
    'USDC',
  )
  await checkTokenBalance(
    SUPPORTED_TOKENS.DAI,
    smartAccountAddress as `0x${string}`,
    'DAI',
  )
}

// ============================================================================
// RHINESTONE INTENT-BASED TRANSACTION HELPER
// ============================================================================

/**
 * Submit a sponsored transaction using Rhinestone intents
 * This uses the intent-based API instead of user operations
 */
async function submitSponsoredTransaction(
  rhinestoneAccount: RhinestoneAccount,
  chain: Chain,
  calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }>,
): Promise<string | null> {
  console.log('💰 Preparing sponsored transaction (intent-based)...', {
    chain: chain.name,
    chainId: chain.id,
    callCount: calls.length,
  })

  // Step 1: Prepare the transaction (creates intent with sponsorship)
  const transactionData = await rhinestoneAccount.prepareTransaction({
    sourceChains: [chain],
    targetChain: chain,
    calls: calls,
    sponsored: true,
  })

  console.log('🔍 Prepared Transaction Data:', {
    intentRoute: transactionData.intentRoute,
    transaction: transactionData.transaction,
  })

  // Step 2: Sign the prepared transaction (includes intentRoute)
  const signedTransaction =
    await rhinestoneAccount.signTransaction(transactionData)

  console.log('✅ Transaction signed:', {
    signedTransaction,
  })

  // Step 3: Submit the signed transaction with authorizations
  const transactionResult = await rhinestoneAccount.submitTransaction(
    signedTransaction,
    [],
  )

  console.log('✅ Transaction submitted:', transactionResult)

  // Extract transaction hash/ID from result
  // TransactionResult has type 'intent' with id property
  const txHash = transactionResult?.id

  if (!txHash) {
    throw new Error('No transaction hash or ID returned from Rhinestone SDK')
  }

  // Convert bigint to hex string if needed
  const hashAsHex =
    typeof txHash === 'bigint'
      ? (`0x${txHash.toString(16).padStart(64, '0')}` as `0x${string}`)
      : (txHash as string)

  console.log('✅ Transaction hash/id:', hashAsHex)
  return hashAsHex
}

// ============================================================================
// ENS REGISTRATION CORE FUNCTION
// ============================================================================

/**
 * Register an ENS domain using Rhinestone smart account with FastTestETHRegistrar
 * This version uses ERC20 tokens for payment and has no commit time requirement
 */
async function registerEnsDomain(
  ensName: string,
  duration: number = 1, // years
  paymentToken: `0x${string}` = SUPPORTED_TOKENS.USDC,
  options: {
    rhinestoneApiKey?: string
    privateKey?: `0x${string}`
    rpcUrl?: string
  } = {},
) {
  console.log(
    '🔍 Starting ENS Registration with Rhinestone (FastTestETHRegistrar)...\n',
  )

  // Configuration
  const apiKey = options.rhinestoneApiKey || RHINESTONE_API_KEY
  const privateKey = options.privateKey || PRIVATE_KEY
  const rpcUrl = options.rpcUrl || SEPOLIA_RPC_URL

  if (!apiKey || !privateKey) {
    throw new Error('❌ RHINESTONE_API_KEY and PRIVATE_KEY are required')
  }

  const durationInSeconds = BigInt(duration * 365 * 24 * 60 * 60) // Convert years to seconds
  const cleanName = ensName.replace('.eth', '')

  console.log('📝 Configuration:')
  console.log('   ENS Name:', `${cleanName}.eth`)
  console.log('   Duration:', duration, 'year(s)')
  console.log('   Payment Token:', paymentToken)
  console.log('')

  // Step 1: Create EOA from private key
  const ownerAccount = privateKeyToAccount(privateKey)
  console.log('✅ EOA account:', ownerAccount.address)
  console.log('🔍 Working Snippet Account Inspection:')
  console.log('  - ownerAccount:', ownerAccount)
  console.log('  - ownerAccount.type:', ownerAccount.type)
  console.log('  - ownerAccount.source:', ownerAccount.source)
  console.log('  - ownerAccount.address:', ownerAccount.address)
  console.log('  - ownerAccount.keys:', Object.keys(ownerAccount))

  // Step 2: Create public client
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl),
  })

  // Step 3: Check if name is available
  console.log('\n🔍 Checking name availability...')
  const isAvailable = await publicClient.readContract({
    address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isAvailable',
    args: [cleanName],
  })

  if (!isAvailable) {
    throw new Error('❌ Name is not available. Try a different name.')
  }
  console.log('✅ Name is available!')

  // Step 4: Check if payment token is supported
  console.log('\n🔍 Checking payment token support...')
  const isTokenSupported = await publicClient.readContract({
    address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isPaymentToken',
    args: [paymentToken],
  })

  if (!isTokenSupported) {
    throw new Error('❌ Payment token is not supported by the registrar.')
  }
  console.log('✅ Payment token is supported!')

  // Step 5: Get pricing
  console.log('\n💰 Getting price...')
  const priceResult = await publicClient.readContract({
    address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'rentPrice',
    args: [cleanName, ownerAccount.address, durationInSeconds, paymentToken],
  })

  const priceArray = priceResult as [bigint, bigint]
  const basePrice = priceArray[0]
  const premium = priceArray[1]
  const totalPrice = basePrice + premium

  console.log('   Base:', basePrice.toString())
  console.log('   Premium:', premium.toString())
  console.log('   Total:', totalPrice.toString())

  // Step 6: Create Rhinestone account
  console.log('\n🦏 Creating Rhinestone account...')

  // Initialize SDK instance with Pimlico bundler
  const sdk = new RhinestoneSDK({
    apiKey: apiKey,
  })

  // Create Rhinestone account using the SDK
  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa',
      accounts: [ownerAccount],
    },
  })

  console.log(
    '🦏 Working Snippet Rhinestone account object received:',
    rhinestoneAccount,
  )
  console.log('🔍 Working Snippet RhinestoneAccount Inspection:')
  console.log('  - rhinestoneAccount:', rhinestoneAccount)
  console.log('  - rhinestoneAccount.keys:', Object.keys(rhinestoneAccount))
  console.log('  - rhinestoneAccount.config:', rhinestoneAccount.config)
  console.log(
    '  - rhinestoneAccount.config?.account:',
    rhinestoneAccount.config?.account,
  )
  console.log(
    '  - rhinestoneAccount.config?.account?.type:',
    rhinestoneAccount.config?.account?.type,
  )

  const smartAccountAddress = rhinestoneAccount.getAddress()
  console.log('✅ Smart account address:', smartAccountAddress)

  // Step 7: Check token balance
  console.log('\n💰 Checking token balance...')
  const tokenBalance = await publicClient.readContract({
    address: paymentToken,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [smartAccountAddress],
  })

  // Get token decimals for proper formatting
  const tokenDecimals = await publicClient.readContract({
    address: paymentToken,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  const tokenSymbol = await publicClient.readContract({
    address: paymentToken,
    abi: ERC20_ABI,
    functionName: 'symbol',
  })

  console.log(
    `💰 ${tokenSymbol} balance: ${formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`,
  )
  console.log(
    `💰 Required: ${formatUnits(totalPrice, tokenDecimals)} ${tokenSymbol}`,
  )

  if (tokenBalance < totalPrice) {
    console.log('\n💡 Insufficient token balance!')
    console.log('   Run: npx tsx complete-ens-test.ts --fund-only')
    console.log(
      `   Or manually mint ${formatUnits(totalPrice, tokenDecimals)} ${tokenSymbol} to ${smartAccountAddress}`,
    )
    throw new Error(
      `❌ Insufficient token balance. Need ${formatUnits(totalPrice, tokenDecimals)} ${tokenSymbol}, have ${formatUnits(tokenBalance, tokenDecimals)} ${tokenSymbol}`,
    )
  }

  // Step 8: Generate secret and create commitment
  console.log('\n🔐 Generating commitment...')
  const secret = keccak256(toHex(Math.random().toString()))
  console.log('   Secret:', secret)

  const commitment = await publicClient.readContract({
    address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'makeCommitment',
    args: [
      cleanName,
      smartAccountAddress,
      secret,
      ENS_CONTRACTS.REGISTRY,
      ENS_CONTRACTS.PUBLIC_RESOLVER,
      durationInSeconds,
      zeroHash, // referrer
    ],
  })
  console.log('✅ Commitment hash:', commitment)

  // Step 9: Commit (first transaction) - FastTestETHRegistrar has 0 commit time
  console.log('\n📤 Step 1: Committing to register...')
  const commitData = encodeFunctionData({
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'commit',
    args: [commitment],
  })

  console.log('Commit transaction config:', {
    chain: sepolia.name,
    chainId: sepolia.id,
    to: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    data: commitData,
    value: '0',
  })

  try {
    // Use intent-based sponsored transaction
    const commitTxHash = await submitSponsoredTransaction(
      rhinestoneAccount,
      sepolia,
      [
        {
          to: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
          data: commitData,
          value: 0n,
        },
      ],
    )

    console.log('✅ Commit transaction submitted!')
    console.log('   Transaction hash:', commitTxHash || 'N/A')
    console.log('⏳ Waiting for commit to be processed...')
    await sleep(3000) // Wait a bit for the intent to be processed

    try {
      const minAge = (await publicClient.readContract({
        address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
        abi: FAST_TEST_REGISTRAR_ABI,
        functionName: 'MIN_COMMITMENT_AGE',
      })) as bigint

      const committedAt = (await publicClient.readContract({
        address: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
        abi: FAST_TEST_REGISTRAR_ABI,
        functionName: 'commitmentAt',
        args: [commitment],
      })) as bigint

      if (committedAt === 0n) {
        console.log('⚠️  Commitment timestamp not yet recorded; waiting 3s...')
        await sleep(3000)
      }

      const latestBlock = await publicClient.getBlock()
      const nowTs = latestBlock.timestamp as bigint
      const elapsed = nowTs - committedAt
      if (minAge > 0n && elapsed < minAge) {
        const waitSeconds = Number(minAge - elapsed)
        console.log(
          `⏳ Waiting ${waitSeconds}s for MIN_COMMITMENT_AGE before registering...`,
        )
        await sleep(waitSeconds * 1000)
      }
    } catch (ageErr) {
      console.log('ℹ️  Skipping commitment age wait (could not fetch):', ageErr)
    }
  } catch (error) {
    console.error('\n❌ Commit transaction failed:', error)

    if (error instanceof Error && error.message.includes('AA13')) {
      console.log('\n💡 AA13 Error detected.')
      console.log('   This is the gas estimation issue with Rhinestone SDK.')
      console.log(
        '   The API key may lack proper bundler/paymaster permissions.',
      )
    }
    throw error
  }

  // Step 10: Approve token (if not ETH)
  console.log('\n📤 Step 2: Approving token...')
  if (paymentToken !== zeroAddress) {
    const approveData = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [ENS_CONTRACTS.REGISTRAR_CONTROLLER, totalPrice],
    })

    try {
      // Use intent-based sponsored transaction
      const approveResult = await submitSponsoredTransaction(
        rhinestoneAccount,
        sepolia,
        [
          {
            to: paymentToken,
            data: approveData,
            value: 0n,
          },
        ],
      )

      console.log('✅ Approve transaction submitted!')
      console.log('   Transaction hash:', approveResult || 'N/A')

      // Wait a bit for the approval to be processed
      console.log('⏳ Waiting for approval to be processed...')
      await sleep(2000)

      // Verify allowance before proceeding
      try {
        const currentAllowance = await publicClient.readContract({
          address: paymentToken,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [smartAccountAddress, ENS_CONTRACTS.REGISTRAR_CONTROLLER],
        })
        console.log(
          `🔎 Allowance: ${currentAllowance.toString()} (required ${totalPrice.toString()})`,
        )
        if (currentAllowance < totalPrice) {
          console.log('⚠️  Allowance below required amount, re-approving...')
          // Re-approve with higher amount
          const reApproveData = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [ENS_CONTRACTS.REGISTRAR_CONTROLLER, totalPrice * 2n], // Approve double the amount
          })

          await submitSponsoredTransaction(rhinestoneAccount, sepolia, [
            {
              to: paymentToken,
              data: reApproveData,
              value: 0n,
            },
          ])
          console.log('✅ Re-approval completed!')
        }
      } catch (e) {
        console.log('⚠️  Failed to fetch allowance after approve:', e)
      }
    } catch (error) {
      console.error('\n❌ Approve transaction failed:', error)
      throw error
    }
  } else {
    console.log('⚡ Using ETH - no approval needed')
  }

  // Step 11: Register (third transaction) - No wait time needed with FastTestETHRegistrar
  console.log('\n📤 Step 3: Registering name...')
  const registerData = encodeFunctionData({
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'register',
    args: [
      cleanName,
      smartAccountAddress,
      secret,
      ENS_CONTRACTS.REGISTRY,
      ENS_CONTRACTS.PUBLIC_RESOLVER,
      durationInSeconds,
      paymentToken,
      zeroHash, // referrer
    ],
  })

  console.log('🔍 Register transaction details:')
  console.log('   Target contract:', ENS_CONTRACTS.REGISTRAR_CONTROLLER)
  console.log('   Function data:', registerData)
  console.log('   Payment token:', paymentToken)
  console.log('   Duration:', durationInSeconds.toString())

  try {
    // Preflight simulation against RPC to surface revert reasons early
    // try {
    //     const preflightGas = await publicClient.estimateGas({
    //         account: smartAccountAddress as `0x${string}`,
    //         to: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
    //         data: registerData,
    //         value: 0n,
    //     })
    //     console.log('🔎 Preflight register estimateGas:', preflightGas.toString())
    // } catch (preflightError) {
    //     console.error('❌ Preflight estimateGas for register failed:', preflightError)
    // }

    // Use intent-based sponsored transaction
    const registerTxHash = await submitSponsoredTransaction(
      rhinestoneAccount,
      sepolia,
      [
        {
          to: ENS_CONTRACTS.REGISTRAR_CONTROLLER,
          data: registerData,
          value: 0n, // No ETH value needed when using payment tokens
        },
      ],
    )

    console.log('✅ Register transaction submitted!')
    console.log('   Transaction hash:', registerTxHash || 'N/A')

    console.log('\n🎉 SUCCESS! ENS name registered:')
    console.log('   Name:', `${cleanName}.eth`)
    console.log('   Owner:', smartAccountAddress)
    console.log('   Payment Token:', paymentToken)
    console.log('   Transaction:', registerTxHash || 'N/A')

    return {
      name: `${cleanName}.eth`,
      owner: smartAccountAddress,
      transactionHash: registerTxHash,
      price: totalPrice,
      paymentToken,
    }
  } catch (error) {
    console.error('\n❌ Register transaction failed:', error)

    if (error instanceof Error) {
      if (error.message.includes('AA13')) {
        console.log('\n💡 AA13 Error detected.')
        console.log('   This is the gas estimation issue with Rhinestone SDK.')
      }
      if (error.message.includes('CommitmentTooNew')) {
        console.log(
          '\n💡 Commitment is too new. Wait longer before registering.',
        )
      }
      if (error.message.includes('InsufficientValue')) {
        console.log('\n💡 Insufficient value sent. Price may have changed.')
      }
    }
    try {
      const ctx = (error as Record<string, unknown>)?._context as
        | Record<string, unknown>
        | undefined
      if (ctx) {
        console.log('🔎 Orchestrator context id:', ctx.id)
        console.dir(ctx.error, { depth: null })
        console.log('🔎 traceId:', ctx.traceId)
      }
    } catch (_) {}
    throw error
  }
}

// ============================================================================
// MAIN EXECUTION FUNCTIONS
// ============================================================================

/**
 * Complete test setup - creates account, funds it, and tests registration
 */
async function runCompleteTestSetup() {
  console.log('🚀 Starting Complete ENS Registration Test Setup')
  console.log('===============================================')
  console.log('')

  try {
    // Step 1: Create Rhinestone account
    console.log('📋 Step 1: Creating Rhinestone Account')
    console.log('-------------------------------------')
    const smartAccountAddress = await createRhinestoneAccountAndGetAddress()
    console.log('')

    // Step 2: Fund the account
    console.log('📋 Step 2: Funding Rhinestone Account')
    console.log('-------------------------------------')
    await fundRhinestoneAccount(smartAccountAddress)
    console.log('')

    // Step 3: Verify balances
    console.log('📋 Step 3: Verifying Account Balances')
    console.log('-------------------------------------')
    await checkEthBalance(smartAccountAddress as `0x${string}`)
    await checkTokenBalance(
      SUPPORTED_TOKENS.USDC,
      smartAccountAddress as `0x${string}`,
      'USDC',
    )
    await checkTokenBalance(
      SUPPORTED_TOKENS.DAI,
      smartAccountAddress as `0x${string}`,
      'DAI',
    )
    console.log('')

    // Step 4: Test ENS registration
    console.log('📋 Step 4: Testing ENS Registration')
    console.log('-----------------------------------')
    const registrationSuccess = await testEnsRegistration()

    // Final summary
    console.log('\n📊 Test Setup Summary')
    console.log('====================')
    console.log('✅ Rhinestone Account Created:', smartAccountAddress)
    console.log('✅ Account Funded with ETH and Tokens')
    console.log(
      registrationSuccess
        ? '✅ ENS Registration Test Passed'
        : '❌ ENS Registration Test Failed',
    )

    if (registrationSuccess) {
      console.log('\n🎉 Your ENS registration setup is working perfectly!')
      console.log('')
      console.log('📝 You can now:')
      console.log('1. Use the registerEnsDomain function in your app')
      console.log(
        '2. Run individual tests with: npx tsx complete-ens-test.ts --test-only',
      )
      console.log(
        '3. Fund additional accounts with: npx tsx complete-ens-test.ts --fund-only',
      )
    } else {
      console.log('\n⚠️  There was an issue with the registration test.')
      console.log('   Check the error messages above and try again.')
    }
  } catch (error) {
    console.error('\n💥 Test setup failed:', error)
    console.error('')
    console.error('🔍 Troubleshooting tips:')
    console.error('1. Make sure your RHINESTONE_API_KEY is valid')
    console.error('2. Ensure your PRIVATE_KEY has sufficient Sepolia ETH')
    console.error('3. Check that the Sepolia RPC endpoint is working')
    console.error('4. Verify the contract addresses are correct')
    process.exit(1)
  }
}

/**
 * Test ENS registration with a random domain name
 */
async function testEnsRegistration() {
  console.log('\n🧪 Testing ENS Registration...')

  // Generate a random name to avoid conflicts

  try {
    const result = await registerEnsDomain(
      'ucles11790',
      1, // 1 year duration
      SUPPORTED_TOKENS.USDC, // Use USDC for payment
      {
        rhinestoneApiKey: RHINESTONE_API_KEY,
        privateKey: PRIVATE_KEY,
      },
    )

    console.log('\n🎉 ENS Registration Test SUCCESSFUL!')
    console.log('=====================================')
    console.log('Name:', result.name)
    console.log('Owner:', result.owner)
    console.log('Price:', result.price.toString())
    console.log('Payment Token:', result.paymentToken)
    console.log('Transaction:', result.transactionHash)

    return true
  } catch (error) {
    console.error('\n❌ ENS Registration Test FAILED!')
    console.error('================================')
    console.error('Error:', error)
    return false
  }
}

async function main() {
  await runCompleteTestSetup()
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('\n💥 Fatal error:', error)
    process.exit(1)
  })
}
