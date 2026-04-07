/**
 * Complete ENS Registration Test with Rhinestone Warp + Smart Sessions
 *
 * Purpose:
 * - Reproduce the ENS registration flow from `complete-ens-test.ts`
 * - Use Rhinestone warp intents instead of bundler/user-op flow
 * - Enable a smart session first, then submit commit/approve/register via the session
 *
 * Usage:
 *   RHINESTONE_API_KEY=... \
 *   node --experimental-strip-types apps/manager/complete-ens-warp-session-test.ts --name yourname
 *
 * Optional env:
 *   PRIVATE_KEY      Override the built-in public dev key
 *   SEPOLIA_RPC_URL  Override Sepolia RPC endpoint
 */

import {
  type RhinestoneAccount,
  RhinestoneSDK,
  type Session,
} from '@rhinestone/sdk'
import { experimental_enableSession } from '@rhinestone/sdk/actions/smart-sessions'
import {
  type Address,
  type Chain,
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
import { sepolia } from 'viem/chains'

const RHINESTONE_API_KEY = process.env.RHINESTONE_API_KEY
const DEFAULT_TEST_PRIVATE_KEY = '' as const
const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? DEFAULT_TEST_PRIVATE_KEY) as Hex
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'

const SUPPORTED_TOKENS = {
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as const,
  DAI: '0xd030a2465ee661338de1f02d05042bbf20d5d127' as const,
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
Complete ENS Registration Test with Rhinestone Warp + Smart Sessions

Required env:
  RHINESTONE_API_KEY

Optional env:
  PRIVATE_KEY
  SEPOLIA_RPC_URL

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

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
})

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function replacer(_: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function checkEthBalance(address: Address) {
  const balance = await publicClient.getBalance({ address })
  return {
    balance,
    formatted: `${formatUnits(balance, 18)} ETH`,
  }
}

type SessionBundle = {
  session: Session
  sessionOwnerKey: Hex
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

  const deployed = await rhinestoneAccount.isDeployed(sepolia)
  console.log('Already deployed:', deployed)

  if (!deployed) {
    console.log('Deploying smart account via warp intent...')
    const deployTx = await rhinestoneAccount.deploy(sepolia, {
      sponsored: true,
    })
    console.log('Deploy result:')
    console.log(JSON.stringify(deployTx, replacer, 2))
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
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: ownerAccount,
  })

  const hash = await walletClient.sendTransaction({
    account: ownerAccount,
    to: toAddress,
    value: parseUnits(amountEth, 18),
  })

  console.log(`ETH funding tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
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
    chain: sepolia,
    transport: http(SEPOLIA_RPC_URL),
    account: ownerAccount,
  })

  const decimals = await publicClient.readContract({
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

  console.log(`${tokenName} mint tx: ${hash}`)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  console.log(`${tokenName} mint confirmed in block ${receipt.blockNumber}`)
}

async function autoFundSmartAccount(params: {
  ownerAccount: PrivateKeyAccount
  smartAccountAddress: Address
}) {
  const { ownerAccount, smartAccountAddress } = params

  console.log('')
  console.log('Checking whether smart account needs funding...')

  const ownerEth = await checkEthBalance(ownerAccount.address)
  console.log(`Owner EOA ETH: ${ownerEth.formatted}`)

  if (ownerEth.balance < parseUnits('0.003', 18)) {
    throw new Error(
      `Owner EOA ${ownerAccount.address} does not have enough Sepolia ETH to autofund the smart account`,
    )
  }

  const smartEth = await checkEthBalance(smartAccountAddress)
  const smartUsdc = await checkTokenBalance(
    smartAccountAddress,
    SUPPORTED_TOKENS.USDC,
  )
  const smartDai = await checkTokenBalance(
    smartAccountAddress,
    SUPPORTED_TOKENS.DAI,
  )

  console.log(`Smart account ETH: ${smartEth.formatted}`)
  console.log(`Smart account USDC: ${smartUsdc.formatted}`)
  console.log(`Smart account DAI: ${smartDai.formatted}`)

  if (smartEth.balance < parseUnits('0.01', 18)) {
    console.log('Auto-funding smart account with 0.01 ETH...')
    await sendEth(ownerAccount, smartAccountAddress, '0.01')
  }

  if (smartUsdc.balance < parseUnits('100', 6)) {
    console.log('Auto-funding smart account with 1000 USDC...')
    await mintMockToken(
      ownerAccount,
      SUPPORTED_TOKENS.USDC,
      smartAccountAddress,
      '1000',
      'USDC',
    )
  }

  if (smartDai.balance < parseUnits('100', 18)) {
    console.log('Auto-funding smart account with 1000 DAI...')
    await mintMockToken(
      ownerAccount,
      SUPPORTED_TOKENS.DAI,
      smartAccountAddress,
      '1000',
      'DAI',
    )
  }

  const finalEth = await checkEthBalance(smartAccountAddress)
  const finalUsdc = await checkTokenBalance(
    smartAccountAddress,
    SUPPORTED_TOKENS.USDC,
  )
  const finalDai = await checkTokenBalance(
    smartAccountAddress,
    SUPPORTED_TOKENS.DAI,
  )

  console.log('Final smart account balances:')
  console.log(`ETH: ${finalEth.formatted}`)
  console.log(`USDC: ${finalUsdc.formatted}`)
  console.log(`DAI: ${finalDai.formatted}`)
}

async function enableSmartSession(
  rhinestoneAccount: RhinestoneAccount,
): Promise<SessionBundle> {
  const sessionOwnerKey = generatePrivateKey()
  const sessionOwnerAccount = privateKeyToAccount(sessionOwnerKey)

  const session: Session = {
    chain: sepolia,
    owners: {
      type: 'ecdsa',
      accounts: [sessionOwnerAccount],
    },
    actions: [{ policies: [{ type: 'sudo' }] }],
  }

  console.log('Getting session details...')
  const sessionDetails = await rhinestoneAccount.experimental_getSessionDetails(
    [session],
  )
  console.log(JSON.stringify(sessionDetails, replacer, 2))

  console.log('Requesting owner signature for enable session...')
  const enableSignature =
    await rhinestoneAccount.experimental_signEnableSession(sessionDetails)
  console.log('Enable signature:', enableSignature)

  const sessionToEnableIndex = 0
  const alreadyEnabled =
    typeof rhinestoneAccount.experimental_isSessionEnabled === 'function'
      ? await rhinestoneAccount.experimental_isSessionEnabled(session)
      : false

  if (alreadyEnabled) {
    console.log('Session already enabled, skipping install tx.')
  } else {
    const enableCall = experimental_enableSession(
      session,
      enableSignature,
      sessionDetails.hashesAndChainIds,
      sessionToEnableIndex,
    )

    console.log('Sending sponsored warp tx to enable session...')
    const enableTx = await rhinestoneAccount.sendTransaction({
      sourceChains: [sepolia],
      targetChain: sepolia,
      calls: [enableCall],
      sponsored: true,
    })
    console.log(JSON.stringify(enableTx, replacer, 2))

    const enableReceipt = await rhinestoneAccount.waitForExecution(
      enableTx,
      false,
    )
    console.log('Enable receipt:')
    console.log(JSON.stringify(enableReceipt, replacer, 2))
  }

  return {
    session,
    sessionOwnerKey,
    sessionOwnerAccount,
    enableSignature,
    hashesAndChainIds: sessionDetails.hashesAndChainIds,
  }
}

async function submitSponsoredSessionTransaction(
  rhinestoneAccount: RhinestoneAccount,
  chain: Chain,
  sessionBundle: SessionBundle,
  calls: Array<{ to: Address; data: Hex; value: bigint }>,
) {
  console.log('Submitting session-signed sponsored warp transaction...')
  console.log(JSON.stringify({ callCount: calls.length, calls }, replacer, 2))

  const transaction = await rhinestoneAccount.sendTransaction({
    sourceChains: [chain],
    targetChain: chain,
    calls,
    sponsored: true,
    signers: {
      type: 'experimental_session',
      session: sessionBundle.session,
      enableData: {
        userSignature: sessionBundle.enableSignature,
        hashesAndChainIds: sessionBundle.hashesAndChainIds,
        sessionToEnableIndex: 0,
      },
    },
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

async function checkTokenBalance(address: Address, token: Address) {
  const [balance, decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
    }),
    publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
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

async function registerHcaOwnership(params: {
  ownerAddress: Address
  smartAccountAddress: Address
  rhinestoneAccount: RhinestoneAccount
}) {
  const { ownerAddress, smartAccountAddress, rhinestoneAccount } = params

  console.log('')
  console.log('Checking HCA ownership registration...')
  const currentOwner = await publicClient.readContract({
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
    sourceChains: [sepolia],
    targetChain: sepolia,
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

async function registerEnsDomainWithSession(params: {
  ensName: string
  paymentToken?: Address
}) {
  const { ensName, paymentToken = SUPPORTED_TOKENS.USDC } = params
  const durationYears = 1
  const durationInSeconds = BigInt(durationYears * 365 * 24 * 60 * 60)
  const cleanName = ensName.replace('.eth', '')

  console.log('Starting ENS registration with warp + smart session')
  console.log('Name:', `${cleanName}.eth`)
  console.log('Payment token:', paymentToken)
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
  const isAvailable = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isAvailable',
    args: [cleanName],
  })
  if (!isAvailable) {
    throw new Error(`Name ${cleanName}.eth is not available`)
  }

  console.log('Checking payment token support...')
  const isTokenSupported = await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'isPaymentToken',
    args: [paymentToken],
  })
  if (!isTokenSupported) {
    throw new Error(`Token ${paymentToken} is not supported by registrar`)
  }

  console.log('Fetching price...')
  const [basePrice, premium] = (await publicClient.readContract({
    address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'rentPrice',
    args: [cleanName, ownerAccount.address, durationInSeconds, paymentToken],
  })) as [bigint, bigint]
  const totalPrice = basePrice + premium
  console.log('Base:', basePrice.toString())
  console.log('Premium:', premium.toString())
  console.log('Total:', totalPrice.toString())

  const tokenBalance = await checkTokenBalance(
    smartAccountAddress,
    paymentToken,
  )
  console.log(`Token balance for smart account: ${tokenBalance.formatted}`)
  console.log(
    `Required: ${formatUnits(totalPrice, tokenBalance.decimals)} ${tokenBalance.symbol}`,
  )

  if (tokenBalance.balance < totalPrice) {
    throw new Error(
      `Insufficient ${tokenBalance.symbol} balance on smart account ${smartAccountAddress}`,
    )
  }

  console.log('')
  console.log('Enabling smart session...')
  const sessionBundle = await enableSmartSession(rhinestoneAccount)

  console.log('')
  console.log('Generating commitment...')
  const secret = keccak256(toHex(Math.random().toString()))
  const commitment = await publicClient.readContract({
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

  console.log('')
  console.log('Step 1: Commit')
  const commitData = encodeFunctionData({
    abi: FAST_TEST_REGISTRAR_ABI,
    functionName: 'commit',
    args: [commitment],
  })
  const commitHash = await submitSponsoredSessionTransaction(
    rhinestoneAccount,
    sepolia,
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
    const minAge = (await publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'MIN_COMMITMENT_AGE',
    })) as bigint
    const committedAt = (await publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar,
      abi: FAST_TEST_REGISTRAR_ABI,
      functionName: 'commitmentAt',
      args: [commitment],
    })) as bigint

    if (committedAt === 0n) {
      console.log('Commitment timestamp not yet visible, waiting 3s...')
      await sleep(3000)
    }

    const latestBlock = await publicClient.getBlock()
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

  console.log('')
  console.log('Step 2: Approve token')
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, totalPrice],
  })
  const approveHash = await submitSponsoredSessionTransaction(
    rhinestoneAccount,
    sepolia,
    sessionBundle,
    [
      {
        to: paymentToken,
        data: approveData,
        value: 0n,
      },
    ],
  )
  console.log('Approve hash:', approveHash)

  await sleep(2000)

  try {
    const allowance = await publicClient.readContract({
      address: paymentToken,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [smartAccountAddress, ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar],
    })
    console.log('Allowance:', allowance.toString())
  } catch (error) {
    console.log('Failed to fetch allowance after approve:', error)
  }

  console.log('')
  console.log('Step 3: Register')
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
  const registerHash = await submitSponsoredSessionTransaction(
    rhinestoneAccount,
    sepolia,
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
  }
}

async function main() {
  const result = await registerEnsDomainWithSession({
    ensName: chosenName,
    paymentToken: SUPPORTED_TOKENS.USDC,
  })

  console.log('')
  console.log('SUCCESS')
  console.log('Name:', result.name)
  console.log('Owner:', result.owner)
  console.log('Price:', result.price.toString())
  console.log('Payment token:', result.paymentToken)
  console.log('Commit tx:', result.commitHash)
  console.log('Approve tx:', result.approveHash)
  console.log('Register tx:', result.registerHash)
}

main().catch((error) => {
  console.error('')
  console.error('Warp + session ENS registration failed:')
  console.error(error)
  process.exit(1)
})
