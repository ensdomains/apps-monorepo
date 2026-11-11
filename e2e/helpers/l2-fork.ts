/**
 * The opt-in L2 forks (`--profile l2`: anvil-base, anvil-arb, anvil-op) that a
 * registration can be paid from. Specs that use one skip unless E2E_L2 enables
 * it: `true` for all of them, or a comma-separated subset of their keys
 * (e.g. `E2E_L2=base,arbitrum`).
 */
import type { Page } from '@playwright/test'
import {
  type Address,
  type Chain,
  createPublicClient,
  createTestClient,
  encodeAbiParameters,
  erc20Abi,
  http,
  keccak256,
  numberToHex,
  pad,
} from 'viem'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'

// FiatToken's `balances` mapping, as on every Circle USDC (checked on each fork).
const USDC_BALANCE_SLOT = 9n

const defineL2Fork = <const Key extends string>(
  key: Key,
  chain: Chain,
  /** Circle's USDC on this L2, as in apps/manager/src/l2Sources.ts. */
  usdc: Address,
  rpcEnvVar: string,
  defaultRpcUrl: string,
) => {
  const rpcUrl = process.env[rpcEnvVar] ?? defaultRpcUrl
  const localChain = {
    ...chain,
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const satisfies Chain
  // Cold fork reads go to the public upstream and can be slow.
  const transport = http(rpcUrl, { timeout: 120_000 })
  return {
    key,
    chain: localChain,
    usdc,
    rpcUrl,
    client: createPublicClient({ chain: localChain, transport }),
    testClient: createTestClient({
      chain: localChain,
      mode: 'anvil',
      transport,
    }),
  }
}

/** Host ports match e2e/infra/docker-compose.yml. */
export const L2_FORKS = [
  defineL2Fork(
    'base',
    baseSepolia,
    '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    'ANVIL_BASE_RPC_URL',
    'http://127.0.0.1:8547',
  ),
  defineL2Fork(
    'arbitrum',
    arbitrumSepolia,
    '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    'ANVIL_ARB_RPC_URL',
    'http://127.0.0.1:8549',
  ),
  defineL2Fork(
    'optimism',
    optimismSepolia,
    '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
    'ANVIL_OP_RPC_URL',
    'http://127.0.0.1:8550',
  ),
] as const

export type L2Fork = (typeof L2_FORKS)[number]

const parseEnabledL2Keys = (value: string | undefined): ReadonlySet<string> => {
  if (!value || value === 'false') return new Set()
  if (value === 'true') return new Set(L2_FORKS.map((fork) => fork.key))
  const keys = value.split(',').map((key) => key.trim())
  const unknown = keys.filter((key) => !L2_FORKS.some((f) => f.key === key))
  if (unknown.length > 0) {
    throw new Error(
      `E2E_L2: unknown L2 ${unknown.join(', ')}; expected true or a subset of ${L2_FORKS.map((f) => f.key).join(',')}`,
    )
  }
  return new Set(keys)
}

const enabledL2Keys = parseEnabledL2Keys(process.env.E2E_L2)

export const isL2ForkEnabled = (fork: L2Fork) => enabledL2Keys.has(fork.key)

export const l2SkipReason = (fork: L2Fork) =>
  `Needs the ${fork.chain.name} fork: \`docker compose --profile l2 up -d anvil-base anvil-arb anvil-op mockestrator\`, the manager run with VITE_L2_RPC_URLS=${L2_FORKS.map((f) => `${f.chain.id}=${f.rpcUrl}`).join(',')}, and E2E_L2=true (or E2E_L2=${fork.key})`

export const l2UsdcBalance = (fork: L2Fork, owner: Address) =>
  fork.client.readContract({
    address: fork.usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })

/**
 * Make `owner` a plain EOA on the L2. Anvil account 0 carries leftover contract
 * code on the L2 testnets as on Sepolia (the manager fixture clears it there),
 * and Permit2 checks a contract owner's signature through ERC-1271, which reverts.
 */
export async function clearL2Code(fork: L2Fork, owner: Address) {
  await fork.testClient.setCode({ address: owner, bytecode: '0x' })
}

/** Set `owner`'s USDC balance on the L2 outright. */
export async function setL2UsdcBalance(
  fork: L2Fork,
  owner: Address,
  amount: bigint,
) {
  await fork.testClient.setStorageAt({
    address: fork.usdc,
    index: keccak256(
      encodeAbiParameters(
        [{ type: 'address' }, { type: 'uint256' }],
        [owner, USDC_BALANCE_SLOT],
      ),
    ),
    value: pad(numberToHex(amount)),
  })
}

/**
 * Move the L2's clock to the page's. The app checks a quote's permit
 * deadlines against its own clock, the mockestrator issues them by the L2's,
 * and USDC and Permit2 enforce them by the L2's; with the dev time-travel
 * clock the page follows the (often warped) Sepolia fork instead of the wall.
 */
export async function alignL2ClockWithPage(fork: L2Fork, page: Page) {
  const pageNow = await page.evaluate(() => Math.floor(Date.now() / 1000))
  await fork.testClient.request({
    method: 'evm_setTime',
    params: [pageNow],
  } as never)
  await fork.testClient.mine({ blocks: 1 })
}
