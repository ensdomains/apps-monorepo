/**
 * Quote-only probe: the WEB-7 fulfilment worker EOA as an EIP-7702 Rhinestone
 * account, single-chain Sepolia intent wrapping the REAL Zodiac Roles call
 * (`execTransactionWithRole(registrar.commit)`), stables-funded gas.
 *
 * Prints the quoted spend + the orchestrator's own price data — WITHOUT
 * signing or submitting anything (no on-chain delegation, no execution).
 * This grounds the order-time fulfilment-fee quote design: the orchestrator
 * quote IS the gas-in-stables oracle (no Chainlink, no gasPrice math).
 *
 * Validated 2026-07-21 against orchestrator v1 (SDK 1.11.0):
 * - accountType ERC7579, settlementLayer INTENT_EXECUTOR, using7579 ✓
 * - sponsor == worker EOA address → existing role membership works unchanged ✓
 * - 7702 delegation rides the first intent via setupOps (signEip7702InitData) ✓
 * - fees observed (Sepolia, 3.7 gwei): ~$1 fixed + gas at ~2-3× solver
 *   premium — commit-leg (150k) ≈ $2.1, register-leg (500k) ≈ $4.6
 * - `sourceAssets: ['USDC']` pins USDC-funded gas; requires the worker float
 *   to cover the fee (errors with "Insufficient available balance" otherwise)
 *
 * NOTE: requires @rhinestone/sdk >= 1.8 (`account.signEip7702InitData()`);
 * this package currently pins 1.7.0, so run it from a scratch dir with the
 * latest SDK (e.g. `pnpm add @rhinestone/sdk@latest viem tsx` in /tmp).
 *
 * Run:
 *   RHINESTONE_API_KEY=rs_… pnpm exec tsx scripts/rhinestone-7702-quote.ts
 * The worker key is read from ~/.secrets/registrar-member.key unless
 * PRIVATE_KEY is set.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { RhinestoneSDK } from '@rhinestone/sdk'
import { encodeFunctionData, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'

const pk = (process.env.PRIVATE_KEY ??
  readFileSync(
    `${homedir()}/.secrets/registrar-member.key`,
    'utf8',
  ).trim()) as `0x${string}`
const apiKey = process.env.RHINESTONE_API_KEY
if (!apiKey) throw new Error('RHINESTONE_API_KEY required')

const ROLES_MODIFIER = '0x250f3a370fA3Bb0704B9998B4F0A33057b248EbD'
const ETH_REGISTRAR = '0x8c2E866B439358c41AE05De9cbE8A00BFEFafFcA'
const USDC_L1 = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'
const ROLE_KEY =
  '0x656e732d63726f73736d696e742d726567697374726172000000000000000000'

const rolesAbi = parseAbi([
  'function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) returns (bool)',
])
const registrarAbi = parseAbi(['function commit(bytes32 commitment)'])

const wrapInRole = (to: `0x${string}`, data: `0x${string}`) =>
  encodeFunctionData({
    abi: rolesAbi,
    functionName: 'execTransactionWithRole',
    args: [to, 0n, data, 0, ROLE_KEY, true],
  })

// biome-ignore lint/suspicious/noExplicitAny: probe script, response shape explored ad hoc
const summarize = (label: string, prepared: any) => {
  const el = prepared.intentRoute.intentOp.elements[0]
  const meta = prepared.intentRoute.intentOp.signedMetadata
  const spends = el.spendTokens.map(([id, amt]: [string, string]) => ({
    // Compact-style token id: address in the low 160 bits (0x0 = native).
    token: `0x${(BigInt(id) & ((1n << 160n) - 1n)).toString(16).padStart(40, '0')}`,
    amount: amt,
  }))
  console.log(
    label,
    JSON.stringify(
      {
        spends,
        tokenPrices: meta.tokenPrices,
        gasPrice: meta.gasPrices['11155111'],
        strategy: meta.strategy,
      },
      null,
      1,
    ),
  )
}

const main = async () => {
  const eoa = privateKeyToAccount(pk)
  console.log('worker EOA (7702 account address):', eoa.address)

  const rhinestone = new RhinestoneSDK({ apiKey })
  const account = await rhinestone.createAccount({
    owners: { type: 'ecdsa', accounts: [eoa] },
    eoa,
  })
  const initSig = await account.signEip7702InitData()

  const commitCall = wrapInRole(
    ETH_REGISTRAR,
    encodeFunctionData({
      abi: registrarAbi,
      functionName: 'commit',
      args: [
        '0x1111111111111111111111111111111111111111111111111111111111111111',
      ],
    }),
  )

  for (const [label, gasLimit] of [
    ['commit-leg (150k):', 150_000n],
    ['register-leg (500k):', 500_000n],
  ] as const) {
    const prepared = await account.prepareTransaction({
      chain: sepolia,
      eip7702InitSignature: initSig,
      calls: [{ to: ROLES_MODIFIER, value: 0n, data: commitCall }],
      tokenRequests: [{ address: USDC_L1, amount: 1n }],
      feeAsset: 'USDC',
      // Pin stables-funded gas (the whole point: no ETH in ops). Falls back
      // to native if omitted and the account holds ETH.
      sourceAssets: ['USDC'],
      gasLimit,
    })
    summarize(label, prepared)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
