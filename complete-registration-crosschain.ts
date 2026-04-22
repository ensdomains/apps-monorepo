/**
 * Cross-Chain ENS Registration with Rhinestone Warp + Smart Sessions
 *
 * Purpose:
 * - Register an ENS name on Sepolia using funds sourced from Base Sepolia
 * - Use Rhinestone cross-chain warp intents for the registration flow
 * - Enable smart sessions on both source and target chains
 *
 * Usage:
 *   RHINESTONE_API_KEY=... \
 *   node --experimental-strip-types scripts/complete-registration-crosschain.ts --name yourname
 *
 * Optional env:
 *   PRIVATE_KEY          Override the built-in public dev key
 *   SEPOLIA_RPC_URL      Override Sepolia RPC endpoint
 *   BASE_SEPOLIA_RPC_URL Override Base Sepolia RPC endpoint
 */

import {
  type RhinestoneAccount,
  RhinestoneSDK,
  type Session,
} from '@rhinestone/sdk'
import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatUnits,
  type Hex,
  http,
  keccak256,
  parseUnits,
  toHex,
  zeroAddress,
  zeroHash,
} from 'viem'
import {
  generatePrivateKey,
  type PrivateKeyAccount,
  privateKeyToAccount,
} from 'viem/accounts'
import { baseSepolia, sepolia } from 'viem/chains'

const RHINESTONE_API_KEY = process.env.RHINESTONE_API_KEY
const DEFAULT_TEST_PRIVATE_KEY = '' as const
const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? DEFAULT_TEST_PRIVATE_KEY) as Hex
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'
const BASE_SEPOLIA_RPC_URL =
  process.env.BASE_SEPOLIA_RPC_URL ?? 'https://base-sepolia-rpc.publicnode.com'

const SOURCE_CHAIN = baseSepolia
const TARGET_CHAIN = sepolia

// Circle USDC on Base Sepolia — https://developers.circle.com/stablecoins/usdc-contract-addresses
const SOURCE_TOKENS = {
  USDC: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
}

// Tokens on the target chain (Sepolia) — used for ENS payment (mock USDC for legacy registrar below)
const TARGET_TOKENS = {
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as const,
}

const ENS_SEPOLIA_CONTRACTS = {
  FastTestETHRegistrar: '0xe37a1366c827d18dc0ad57f3767de4b3025ceac2' as const,
  HCAFactory: '0x6a20c7f050f31f4b4cb1eaf060849629be10e6a1' as const,
  PublicResolver: '0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5' as const,
} as const

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
  {
    inputs: [{ name: 'name', type: 'string' }],
    name: 'isAvailable',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
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
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
] as const

const HCA_FACTORY_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'hca', type: 'address' },
      { internalType: 'address', name: 'owner', type: 'address' },
    ],
    name: 'setAccountOwner',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'hca', type: 'address' }],
    name: 'getAccountOwner',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

const args = process.argv.slice(2)

function getArg(flag: string): string | undefined {
  const index = args.indexOf(flag)
  return index >= 0 ? args[index + 1] : undefined
}

const explicitName = getArg('--name')
const chosenName =
  explicitName ?? `warp${Math.floor(Math.random() * 1000000).toString()}`
const shouldSkipAutofund = args.includes('--no-autofund')
const shouldSkipHca = args.includes('--skip-hca')

if (args.includes('--help')) {
  console.log(`
Cross-Chain ENS Registration with Rhinestone Warp + Smart Sessions

Registers ENS names on Sepolia using funds from Base Sepolia.

Required env:
  RHINESTONE_API_KEY

Optional env:
  PRIVATE_KEY
  SEPOLIA_RPC_URL
  BASE_SEPOLIA_RPC_URL

Flags:
  --name <label>   Name label to register, without .eth
  --no-autofund    Skip auto-funding of the smart account
  --skip-hca       Skip HCA owner registration step
  --help           Show this help
`)
  process.exit(0)
}

if (!RHINESTONE_API_KEY) {
  throw new Error('RHINESTONE_API_KEY is required.')
}

const targetPublicClient = createPublicClient({
  chain: TARGET_CHAIN,
  transport: http(SEPOLIA_RPC_URL),
})

const sourcePublicClient = createPublicClient({
  chain: SOURCE_CHAIN,
  transport: http(BASE_SEPOLIA_RPC_URL),
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function replacer(_: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function checkEthBalance(address: Address, chain: 'source' | 'target') {
  const client = chain === 'source' ? sourcePublicClient : targetPublicClient
  const balance = await client.getBalance({ address })
  return {
    balance,
    formatted: `${formatUnits(balance, 18)} ETH`,
  }
}

async function checkTokenBalance(
  address: Address,
  token: Address,
  chain: 'source' | 'target',
) {
  const client = chain === 'source' ? sourcePublicClient : targetPublicClient
  const [balance, decimals, symbol] = await Promise.all([
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    client.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'symbol',
    }),
  ])

  return {
    balance,
    decimals,
    symbol,
    formatted: `${formatUnits(balance, decimals)} ${symbol}`,
  }
}

type SessionBundle = {
  sessions: Session[]
  sessionOwnerAccount: PrivateKeyAccount
  enableSignature: Hex
  hashesAndChainIds: { chainId: bigint; sessionDigest: Hex }[]
}

async function createRhinestoneWarpAccount() {
  const ownerAccount = privateKeyToAccount(PRIVATE_KEY)
  const sdk = new RhinestoneSDK({
    apiKey: RHINESTONE_API_KEY ?? '',
  })

  console.log('EOA:', ownerAccount.address)
  if (!process.env.PRIVATE_KEY) {
    console.log(
      'Using built-in public dev private key. Only use disposable funds.',
    )
  }

  const rhinestoneAccount = await sdk.createAccount({
    owners: {
      type: 'ecdsa',
      accounts: [ownerAccount],
    },
    experimental_sessions: {
      enabled: true,
    },
  })

  const smartAccountAddress = rhinestoneAccount.getAddress()
  console.log('Smart account:', smartAccountAddress)

  // Deploy on both source and target chains
  for (const chain of [TARGET_CHAIN, SOURCE_CHAIN]) {
    const deployed = await rhinestoneAccount.isDeployed(chain)
    console.log(`Already deployed on ${chain.name}:`, deployed)

    if (!deployed) {
      console.log(`Deploying smart account on ${chain.name}...`)
      const deployTx = await rhinestoneAccount.deploy(chain, {
        sponsored: true,
      })
      console.log(`Deploy result (${chain.name}):`)
      console.log(JSON.stringify(deployTx, replacer, 2))
    }
  }

  return {
    ownerAccount,
    rhinestoneAccount,
    smartAccountAddress,
  }
}

async function sendEth(
  ownerAccount: PrivateKeyAccount,
  toAddress: Address,
  amountEth: string,
) {
  const walletClient = createWalletClient({
    chain: SOURCE_CHAIN,
    transport: http(BASE_SEPOLIA_RPC_URL),
    account: ownerAccount,
  })

  const hash = await walletClient.sendTransaction({
    account: ownerAccount,
    to: toAddress,
    value: parseUnits(amountEth, 18),
  })

  console.log(`ETH funding tx (${SOURCE_CHAIN.name}): ${hash}`)
  const receipt = await sourcePublicClient.waitForTransactionReceipt({ hash })
  console.log(`ETH funding confirmed in block ${receipt.blockNumber}`)
}

async function mintMockToken(
  ownerAccount: PrivateKeyAccount,
  tokenAddress: Address,
  toAddress: Address,
  amount: string,
  tokenName: string,
) {
  const walletClient = createWalletClient({
    chain: SOURCE_CHAIN,
    transport: http(BASE_SEPOLIA_RPC_URL),
    account: ownerAccount,
  })

  const decimals = await sourcePublicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })

  const hash = await walletClient.writeContract({
    account: ownerAccount,
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'mint',
    args: [toAddress, parseUnits(amount, decimals)],
  })

  console.log(`${tokenName} mint tx (${SOURCE_CHAIN.name}): ${hash}`)
  const receipt = await sourcePublicClient.waitForTransactionReceipt({ hash })
  console.log(`${tokenName} mint confirmed in block ${receipt.blockNumber}`)
}

async function autoFundSmartAccount(params: {
  ownerAccount: PrivateKeyAccount
  smartAccountAddress: Address
}) {
  const { ownerAccount, smartAccountAddress } = params

  console.log('')
  console.log(
    `Checking whether smart account needs funding on ${SOURCE_CHAIN.name}...`,
  )

  const ownerEth = await checkEthBalance(ownerAccount.address, 'source')
  console.log(`Owner EOA ETH (${SOURCE_CHAIN.name}): ${ownerEth.formatted}`)

  if (ownerEth.balance < parseUnits('0.003', 18)) {
    throw new Error(
      `Owner EOA ${ownerAccount.address} does not have enough ${SOURCE_CHAIN.name} ETH to autofund the smart account`,
    )
  }

  const smartEth = await checkEthBalance(smartAccountAddress, 'source')
  const smartUsdc = await checkTokenBalance(
    smartAccountAddress,
    SOURCE_TOKENS.USDC,
    'source',
  )

  console.log(`Smart account ETH (${SOURCE_CHAIN.name}): ${smartEth.formatted}`)
  console.log(
    `Smart account USDC (${SOURCE_CHAIN.name}): ${smartUsdc.formatted}`,
  )

  if (smartEth.balance < parseUnits('0.01', 18)) {
    console.log(
      `Auto-funding smart account with 0.01 ETH on ${SOURCE_CHAIN.name}...`,
    )
    await sendEth(ownerAccount, smartAccountAddress, '0.01')
  }

  if (smartUsdc.balance < parseUnits('100', 6)) {
    console.log(
      `Auto-funding smart account with 1000 USDC on ${SOURCE_CHAIN.name}...`,
    )
    await mintMockToken(
      ownerAccount,
      SOURCE_TOKENS.USDC,
      smartAccountAddress,
      '1000',
      'USDC',
    )
  }

  const finalEth = await checkEthBalance(smartAccountAddress, 'source')
  const finalUsdc = await checkTokenBalance(
    smartAccountAddress,
    SOURCE_TOKENS.USDC,
    'source',
  )

  console.log(`Final smart account balances (${SOURCE_CHAIN.name}):`)
  console.log(`ETH: ${finalEth.formatted}`)
  console.log(`USDC: ${finalUsdc.formatted}`)
}

async function createSmartSessions(
  rhinestoneAccount: RhinestoneAccount,
): Promise<SessionBundle> {
  const sessionOwnerAccount = privateKeyToAccount(generatePrivateKey())

  // Define one session per chain — signed once, enabled inline on first use
  const sessions: Session[] = [
    {
      chain: TARGET_CHAIN,
      owners: {
        type: 'ecdsa',
        accounts: [sessionOwnerAccount],
      },
      actions: [{ policies: [{ type: 'sudo' }] }],
    },
    {
      chain: SOURCE_CHAIN,
      owners: {
        type: 'ecdsa',
        accounts: [sessionOwnerAccount],
      },
      actions: [{ policies: [{ type: 'sudo' }] }],
    },
  ]

  console.log('Getting session details for both chains...')
  const sessionDetails =
    await rhinestoneAccount.experimental_getSessionDetails(sessions)
  console.log(JSON.stringify(sessionDetails, replacer, 2))

  console.log('Requesting owner signature for enable session...')
  const enableSignature =
    await rhinestoneAccount.experimental_signEnableSession(sessionDetails)
  console.log('Enable signature:', enableSignature)

  return {
    sessions,
    sessionOwnerAccount,
    enableSignature,
    hashesAndChainIds: sessionDetails.hashesAndChainIds,
  }
}

async function submitCrossChainSessionTransaction(
  rhinestoneAccount: RhinestoneAccount,
  sessionBundle: SessionBundle,
  calls: Array<{ to: Address; data: Hex; value: bigint }>,
  tokenRequests?: Array<{ address: string; amount: bigint }>,
) {
  console.log('Submitting cross-chain session-signed sponsored warp transaction...')
  console.log(
    `${SOURCE_CHAIN.name} → ${TARGET_CHAIN.name}`,
  )
  console.log(JSON.stringify({ callCount: calls.length, calls }, replacer, 2))

  // Build per-chain sessions map with enable data — the SDK resolves the right
  // session per chain and handles inline enabling on first use
  const signers = {
    type: 'experimental_session' as const,
    sessions: Object.fromEntries(
      sessionBundle.sessions.map((session, index) => [
        session.chain.id,
        {
          session,
          enableData: {
            userSignature: sessionBundle.enableSignature,
            hashesAndChainIds: sessionBundle.hashesAndChainIds,
            sessionToEnableIndex: index,
          },
        },
      ]),
    ),
  }

  const transaction = await rhinestoneAccount.sendTransaction({
    sourceChains: [SOURCE_CHAIN],
    targetChain: TARGET_CHAIN,
    calls,
    tokenRequests,
    sponsored: true,
    signers,
  })

  console.log('Submitted transaction:')
  console.log(JSON.stringify(transaction, replacer, 2))

  const receipt = await rhinestoneAccount.waitForExecution(transaction, false)
  console.log('Execution receipt:')
  console.log(JSON.stringify(receipt, replacer, 2))

  const txHash = receipt.fill.hash
  if (!txHash) {
    throw new Error('No tx hash returned from warp execution')
  }

  return txHash
}

async function registerHcaOwnership(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  rhinestoneAccount: RhinestoneAccount
}) {
  const { ownerAddress, smartAccountAddress, rhinestoneAccount } = params

  console.log('')
  console.log('Checking HCA ownership registration...')
  const currentOwner = await targetPublicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.HCAFactory,
    abi: HCA_FACTORY_ABI,
    functionName: 'getAccountOwner',
    args: [smartAccountAddress],
  })

  console.log('Current HCA owner:', currentOwner)

  if (currentOwner.toLowerCase() === ownerAddress.toLowerCase()) {
    console.log('HCA already registered to this owner.')
    return { status: 'already-registered' as const, hash: null }
  }

  if (currentOwner !== zeroAddress) {
    throw new Error(
      `HCA already registered to a different owner: ${currentOwner}`,
    )
  }

  const data = encodeFunctionData({
    abi: HCA_FACTORY_ABI,
    functionName: 'setAccountOwner',
    args: [smartAccountAddress, ownerAddress],
  })

  console.log('Submitting HCA registration via warp intent...')
  console.log('HCA factory:', ENS_SEPOLIA_CONTRACTS.HCAFactory)
  console.log('Smart account:', smartAccountAddress)
  console.log('Owner:', ownerAddress)

  const tx = await rhinestoneAccount.sendTransaction({
    sourceChains: [TARGET_CHAIN],
    targetChain: TARGET_CHAIN,
    sponsored: true,
    calls: [
      {
        to: ENS_SEPOLIA_CONTRACTS.HCAFactory,
        data,
        value: 0n,
      },
    ],
  })

  console.log('HCA registration tx submitted:')
  console.log(JSON.stringify(tx, replacer, 2))

  const receipt = await rhinestoneAccount.waitForExecution(tx, false)
  console.log('HCA registration receipt:')
  console.log(JSON.stringify(receipt, replacer, 2))

  return {
    status: 'registered' as const,
    hash: receipt.fill.hash ?? null,
  }
}

async function registerEnsDomainCrossChain(params: {
  ensName: string
  paymentToken?: Address
}) {
  const { ensName, paymentToken = TARGET_TOKENS.USDC } = params
  const durationYears = 1
  const durationInSeconds = BigInt(durationYears * 365 * 24 * 60 * 60)
  const cleanName = ensName.replace('.eth', '')

  console.log('Starting cross-chain ENS registration with warp + smart session')
  console.log('Name:', `${cleanName}.eth`)
  console.log('Payment token:', paymentToken)
  console.log(`Source chain: ${SOURCE_CHAIN.name} (${SOURCE_CHAIN.id})`)
  console.log(`Target chain: ${TARGET_CHAIN.name} (${TARGET_CHAIN.id})`)
  console.log('')

  const { ownerAccount, rhinestoneAccount, smartAccountAddress } =
    await createRhinestoneWarpAccount()

  if (shouldSkipAutofund) {
    console.log('Skipping auto-funding by request.')
  } else {
    await autoFundSmartAccount({ ownerAccount, smartAccountAddress })
  }

  if (shouldSkipHca) {
    console.log('Skipping HCA registration by request.')
  } else {
    await registerHcaOwnership({
      ownerAddress: ownerAccount.address,
      smartAccountAddress,
      rhinestoneAccount,
    })
  }

  console.log('Checking name availability...')
  const isAvailable = await targetPublicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isAvailable',
    args: [cleanName],
  })
  if (!isAvailable) {
    throw new Error(`Name ${cleanName}.eth is not available`)
  }

  console.log('Checking payment token support...')
  const isTokenSupported = await targetPublicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isPaymentToken',
    args: [paymentToken],
  })
  if (!isTokenSupported) {
    throw new Error(`Token ${paymentToken} is not supported by registrar`)
  }

  console.log('Fetching price...')
  const [basePrice, premium] = (await targetPublicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'rentPrice',
    args: [cleanName, ownerAccount.address, durationInSeconds, paymentToken],
  })) as [bigint, bigint]
  const totalPrice = basePrice + premium
  console.log('Base:', basePrice.toString())
  console.log('Premium:', premium.toString())
  console.log('Total:', totalPrice.toString())

  const sourceBalance = await checkTokenBalance(
    smartAccountAddress,
    SOURCE_TOKENS.USDC,
    'source',
  )
  console.log(
    `Source chain USDC balance (${SOURCE_CHAIN.name}): ${sourceBalance.formatted}`,
  )

  console.log('')
  console.log('Creating smart sessions for both chains...')
  const sessionBundle = await createSmartSessions(rhinestoneAccount)

  console.log('')
  console.log('Generating commitment...')
  const secret = keccak256(toHex(Math.random().toString()))
  const commitment = await targetPublicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'makeCommitment',
    args: [
      cleanName,
      smartAccountAddress,
      secret,
      zeroAddress,
      ENS_SEPOLIA_CONTRACTS.PublicResolver,
      durationInSeconds,
      zeroHash,
    ],
  })
  console.log('Commitment:', commitment)

  // Step 1: Commit (cross-chain, no token needs)
  console.log('')
  console.log('Step 1: Commit (cross-chain)')
  const commitData = encodeFunctionData({
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'commit',
    args: [commitment],
  })
  const commitHash = await submitCrossChainSessionTransaction(
    rhinestoneAccount,
    sessionBundle,
    [
      {
        to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        data: commitData,
        value: 0n,
      },
    ],
  )
  console.log('Commit hash:', commitHash)

  await sleep(3000)

  try {
    const minAge = (await targetPublicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'MIN_COMMITMENT_AGE',
    })) as bigint
    const committedAt = (await targetPublicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'commitmentAt',
      args: [commitment],
    })) as bigint

    if (committedAt === 0n) {
      console.log('Commitment timestamp not yet visible, waiting 3s...')
      await sleep(3000)
    }

    const latestBlock = await targetPublicClient.getBlock()
    const nowTs = latestBlock.timestamp as bigint
    const elapsed = nowTs - committedAt
    if (minAge > 0n && elapsed < minAge) {
      const waitSeconds = Number(minAge - elapsed)
      console.log(`Waiting ${waitSeconds}s for min commitment age...`)
      await sleep(waitSeconds * 1000)
    }
  } catch (error) {
    console.log('Skipping commitment age wait check:', error)
  }

  // Step 2: Approve token (cross-chain, with tokenRequests to bridge USDC)
  console.log('')
  console.log('Step 2: Approve token (cross-chain)')
  console.log(
    `Bridging USDC from ${SOURCE_CHAIN.name} → ${TARGET_CHAIN.name} via tokenRequests`,
  )

  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, totalPrice],
  })
  const approveHash = await submitCrossChainSessionTransaction(
    rhinestoneAccount,
    sessionBundle,
    [
      {
        to: paymentToken,
        data: approveData,
        value: 0n,
      },
    ],
    [{ address: 'USDC', amount: totalPrice }],
  )
  console.log('Approve hash:', approveHash)

  await sleep(2000)

  try {
    const allowance = await targetPublicClient.readContract({
      address: paymentToken,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [smartAccountAddress, ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar],
    })
    console.log('Allowance:', allowance.toString())
  } catch (error) {
    console.log('Failed to fetch allowance after approve:', error)
  }

  // Step 3: Register (cross-chain)
  console.log('')
  console.log('Step 3: Register (cross-chain)')
  const registerData = encodeFunctionData({
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'register',
    args: [
      cleanName,
      smartAccountAddress,
      secret,
      zeroAddress,
      ENS_SEPOLIA_CONTRACTS.PublicResolver,
      durationInSeconds,
      paymentToken,
      zeroHash,
    ],
  })
  const registerHash = await submitCrossChainSessionTransaction(
    rhinestoneAccount,
    sessionBundle,
    [
      {
        to: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
        data: registerData,
        value: 0n,
      },
    ],
  )
  console.log('Register hash:', registerHash)

  return {
    name: `${cleanName}.eth`,
    owner: smartAccountAddress,
    commitHash,
    approveHash,
    registerHash,
    price: totalPrice,
    paymentToken,
    sourceChain: SOURCE_CHAIN.name,
    targetChain: TARGET_CHAIN.name,
  }
}

async function main() {
  const result = await registerEnsDomainCrossChain({
    ensName: chosenName,
    paymentToken: TARGET_TOKENS.USDC,
  })

  console.log('')
  console.log('SUCCESS')
  console.log('Name:', result.name)
  console.log('Owner:', result.owner)
  console.log('Price:', result.price.toString())
  console.log('Payment token:', result.paymentToken)
  console.log('Source chain:', result.sourceChain)
  console.log('Target chain:', result.targetChain)
  console.log('Commit tx:', result.commitHash)
  console.log('Approve tx:', result.approveHash)
  console.log('Register tx:', result.registerHash)
}

main().catch((error) => {
  console.error('')
  console.error('Cross-chain ENS registration failed:')
  console.error(error)
  process.exit(1)
})
