/**
 * Rhinestone Warp + Smart Session EOA Test
 *
 * Purpose:
 * - Reproduce the smart-session flow outside the app UI
 * - Use a local EOA private key instead of MetaMask
 * - Verify whether warp deploy + session enable + session-signed tx succeed
 *
 * Usage:
 *   RHINESTONE_API_KEY=... PRIVATE_KEY=0x... npx tsx apps/manager/rhinestone-warp-session-test.ts
 *   RHINESTONE_API_KEY=... PRIVATE_KEY=0x... npx tsx apps/manager/rhinestone-warp-session-test.ts --skip-session-tx
 */

import {
  type RhinestoneAccount,
  RhinestoneSDK,
  type Session,
} from '@rhinestone/sdk'
import { experimental_enableSession } from '@rhinestone/sdk/actions/smart-sessions'
import {
  createPublicClient,
  encodeFunctionData,
  formatUnits,
  type Hex,
  http,
} from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const RHINESTONE_API_KEY = process.env.RHINESTONE_API_KEY
const DEFAULT_TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const
const PRIVATE_KEY = (process.env.PRIVATE_KEY ?? DEFAULT_TEST_PRIVATE_KEY) as Hex
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ?? 'https://ethereum-sepolia-rpc.publicnode.com'

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

const ENS_SEPOLIA_CONTRACTS = {
  FastTestETHRegistrar: '0xe37a1366c827d18dc0ad57f3767de4b3025ceac2' as const,
  USDC: '0x2c3d8dfac22def2947e94432bcd6bb51e1ac55e6' as const,
} as const

const args = new Set(process.argv.slice(2))
const shouldSkipSessionTx = args.has('--skip-session-tx')

if (args.has('--help')) {
  console.log(`
Rhinestone Warp + Smart Session EOA Test

Required env:
  RHINESTONE_API_KEY
  
Optional env:
  PRIVATE_KEY        Override the built-in public dev key
  SEPOLIA_RPC_URL

Default dev key:
  ${DEFAULT_TEST_PRIVATE_KEY}
  This is a public test key. Only use tiny disposable funds.

Flags:
  --skip-session-tx   Only test deploy + session enable, skip the follow-up session-signed tx
  --help              Show this help
`)
  process.exit(0)
}

if (!RHINESTONE_API_KEY) {
  throw new Error('RHINESTONE_API_KEY is required. Run with --help for usage.')
}

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(SEPOLIA_RPC_URL),
})

function replacer(_: string, value: unknown) {
  return typeof value === 'bigint' ? value.toString() : value
}

async function logTokenBalance(accountAddress: `0x${string}`) {
  const [balance, decimals, symbol] = await Promise.all([
    publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [accountAddress],
    }),
    publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'decimals',
    }),
    publicClient.readContract({
      address: ENS_SEPOLIA_CONTRACTS.USDC,
      abi: ERC20_ABI,
      functionName: 'symbol',
    }),
  ])

  console.log(
    `USDC balance for ${accountAddress}: ${formatUnits(balance, decimals)} ${symbol}`,
  )
}

async function createWarpAccount() {
  if (!RHINESTONE_API_KEY) {
    throw new Error('RHINESTONE_API_KEY is required.')
  }

  const ownerAccount = privateKeyToAccount(PRIVATE_KEY)
  const sdk = new RhinestoneSDK({ apiKey: RHINESTONE_API_KEY })

  console.log('EOA:', ownerAccount.address)
  console.log(
    'Creating Rhinestone account with experimental sessions enabled...',
  )

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
    console.log('Deploy result:', JSON.stringify(deployTx, replacer, 2))
  }

  return {
    ownerAccount,
    rhinestoneAccount,
    smartAccountAddress,
  }
}

async function enableSudoSession(rhinestoneAccount: RhinestoneAccount) {
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
  console.log('Session details:')
  console.log(JSON.stringify(sessionDetails, replacer, 2))

  console.log('Requesting owner signature for enableSession typed data...')
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
    console.log('Building enableSession call...')
    const enableCall = experimental_enableSession(
      session,
      enableSignature,
      sessionDetails.hashesAndChainIds,
      sessionToEnableIndex,
    )

    console.log('Sending sponsored warp tx to install session...')
    const enableTransaction = await rhinestoneAccount.sendTransaction({
      sourceChains: [sepolia],
      targetChain: sepolia,
      calls: [enableCall],
      sponsored: true,
    })
    console.log('Enable tx submitted:')
    console.log(JSON.stringify(enableTransaction, replacer, 2))

    const enableReceipt = await rhinestoneAccount.waitForExecution(
      enableTransaction,
      false,
    )
    console.log('Enable receipt:')
    console.log(JSON.stringify(enableReceipt, replacer, 2))
  }

  return {
    session,
    sessionOwnerAccount,
    sessionOwnerKey,
    enableSignature,
    hashesAndChainIds: sessionDetails.hashesAndChainIds,
  }
}

async function submitSessionSignedTx(
  rhinestoneAccount: RhinestoneAccount,
  sessionData: Awaited<ReturnType<typeof enableSudoSession>>,
) {
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [ENS_SEPOLIA_CONTRACTS.FastTestETHRegistrar, 0n],
  })

  console.log(
    'Submitting harmless session-signed tx: USDC approve(registrar, 0)',
  )
  const sessionTransaction = await rhinestoneAccount.sendTransaction({
    sourceChains: [sepolia],
    targetChain: sepolia,
    sponsored: true,
    calls: [
      {
        to: ENS_SEPOLIA_CONTRACTS.USDC,
        data: approveData,
        value: 0n,
      },
    ],
    signers: {
      type: 'experimental_session',
      session: sessionData.session,
      enableData: {
        userSignature: sessionData.enableSignature,
        hashesAndChainIds: sessionData.hashesAndChainIds,
        sessionToEnableIndex: 0,
      },
    },
  })

  console.log('Session tx submitted:')
  console.log(JSON.stringify(sessionTransaction, replacer, 2))

  const sessionReceipt = await rhinestoneAccount.waitForExecution(
    sessionTransaction,
    false,
  )
  console.log('Session tx receipt:')
  console.log(JSON.stringify(sessionReceipt, replacer, 2))
}

async function main() {
  console.log('Rhinestone warp + smart-session EOA harness')
  console.log('RPC:', SEPOLIA_RPC_URL)
  if (!process.env.PRIVATE_KEY) {
    console.log('Using built-in public dev private key.')
    console.log('Only use tiny disposable test funds with this account.')
  }
  console.log('')

  const { rhinestoneAccount, smartAccountAddress } = await createWarpAccount()

  await logTokenBalance(smartAccountAddress)

  const sessionData = await enableSudoSession(rhinestoneAccount)

  if (shouldSkipSessionTx) {
    console.log('Skipping follow-up session-signed tx by request.')
  } else {
    await submitSessionSignedTx(rhinestoneAccount, sessionData)
  }

  console.log('')
  console.log('Done.')
  console.log(
    'If this succeeds here but still fails in the browser, the issue is likely specific to the browser wallet signing path.',
  )
}

main().catch((error) => {
  console.error('')
  console.error('Harness failed:')
  console.error(error)
  process.exit(1)
})
