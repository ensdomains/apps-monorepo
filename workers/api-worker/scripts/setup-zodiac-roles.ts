/**
 * Generates the Safe Transaction Builder batch that scopes the Crossmint
 * fulfilment role on a Zodiac Roles v2 modifier (see services/crossmint/roles.ts
 * for the threat model and docs/zodiac-roles.md for the full runbook).
 *
 * Prereqs (one-time, via the Safe UI):
 *   1. Create the treasury Safe (keep the default fallback handler — the Safe
 *      must receive ERC-1155 names from the registrar).
 *   2. Add the "Roles Modifier" (v2) to the Safe via the Zodiac Safe App.
 *
 * Run:
 *   SAFE_ADDRESS=0x<safe> ROLES_MODULE_ADDRESS=0x<modifier> \
 *   MEMBER_ADDRESS=0x<worker EOA> pnpm exec tsx scripts/setup-zodiac-roles.ts
 *
 * Optional env:
 *   MAX_REGISTRATION_YEARS  per-register duration cap (default 5)
 *   APPROVE_CAP_USDC        per-approve cap in whole USDC (default 10000)
 *   APPROVE_CAP_DAI         per-approve cap in whole DAI (default 10000)
 *
 * Then upload the emitted zodiac-roles.json in the Safe's Transaction Builder
 * app (the printed URL) and execute the batch. The permission set is exactly
 * the fulfilment surface:
 *
 *   ETHRegistrar.commit(bytes32)                     wildcard (harmless writes)
 *   ETHRegistrar.register(...)                       duration <= cap,
 *                                                    paymentToken in {USDC, DAI}
 *   USDC/DAI.approve(spender, amount)                spender == registrar, amount <= cap
 *   VerifiableFactory.deployProxy(...)               wildcard (resolver deploys)
 *
 * Voucher.burn is deliberately NOT in the role — a blanket burn(uint256) lets a
 * leaked key destroy arbitrary customers' vouchers, and burning is only cosmetic
 * cleanup (soulbound, single-use). It stays an ops-only path; the Safe is not
 * granted BURNER_ROLE.
 *
 * Names register straight to the buyer (the registrar charges msg.sender = the
 * Safe, not the owner arg), so there is no registry transfer in the role and the
 * register `owner` is unconstrained. The blast radius of a leaked worker key is
 * the Safe's standing registrar allowance: at worst it registers junk names to
 * arbitrary owners (recoverable value is only the allowance, capped below).
 * Everything else — token transfers out, approvals to arbitrary spenders,
 * delegatecalls, ETH value — is not in the role. Revoke = one `revokeRole` tx.
 */
import { writeFileSync } from 'node:fs'
import { ensL1Contracts, supportedL1Chains } from '@ensdomains/ensjs/chain'
import {
  type Address,
  encodeFunctionData,
  erc20Abi,
  getAbiItem,
  getAddress,
  type Hex,
  pad,
  parseAbi,
  parseUnits,
  toFunctionSelector,
  toHex,
} from 'viem'
import {
  ETH_REGISTRAR_ABI,
  VERIFIABLE_FACTORY_ABI,
} from '#services/crossmint/abis.js'
import { REGISTRAR_ROLE_KEY } from '#services/crossmint/roles.js'

// --- config ----------------------------------------------------------------------------------------

const requireAddress = (key: string): Address => {
  const raw = process.env[key]
  if (!raw) throw new Error(`Missing env var: ${key}`)
  return getAddress(raw)
}

const SAFE = requireAddress('SAFE_ADDRESS')
const ROLES_MODULE = requireAddress('ROLES_MODULE_ADDRESS')
const MEMBER = requireAddress('MEMBER_ADDRESS')

const MAX_YEARS = BigInt(process.env.MAX_REGISTRATION_YEARS ?? '5')
const APPROVE_CAP_USDC = parseUnits(process.env.APPROVE_CAP_USDC ?? '10000', 6)
const APPROVE_CAP_DAI = parseUnits(process.env.APPROVE_CAP_DAI ?? '10000', 18)

const contracts = ensL1Contracts[supportedL1Chains.sepolia]
const TARGETS = {
  registrar: contracts.ensEthRegistrar.address,
  usdc: contracts.usdc.address,
  dai: contracts.dai.address,
  factory: contracts.ensVerifiableFactory.address,
} as const

// --- Roles v2 admin surface ------------------------------------------------------------------------

const ROLES_ADMIN_ABI = parseAbi([
  'function assignRoles(address module, bytes32[] roleKeys, bool[] memberOf)',
  'function scopeTarget(bytes32 roleKey, address targetAddress)',
  'function allowFunction(bytes32 roleKey, address targetAddress, bytes4 selector, uint8 options)',
  'function scopeFunction(bytes32 roleKey, address targetAddress, bytes4 selector, (uint8 parent, uint8 paramType, uint8 operator, bytes compValue)[] conditions, uint8 options)',
])

// Mirrors zodiac-modifier-roles v2 Types.sol. Only the members used here.
const ParamType = { None: 0, Static: 1, Dynamic: 2, Calldata: 5 } as const
const Operator = {
  Pass: 0,
  Or: 2,
  Matches: 5,
  EqualTo: 16,
  LessThan: 18,
} as const
/** ExecutionOptions.None — no ETH value, no delegatecall, anywhere in this role. */
const EXEC_NONE = 0

interface ConditionFlat {
  parent: number
  paramType: number
  operator: number
  compValue: Hex
}

/** 32-byte abi-encoded compValues (EqualTo/LessThan compare the raw calldata word). */
const addressWord = (a: Address): Hex => pad(a, { size: 32 })
const uintWord = (v: bigint): Hex => toHex(v, { size: 32 })

const node = (
  parent: number,
  paramType: number,
  operator: number,
  compValue: Hex = '0x',
): ConditionFlat => ({ parent, paramType, operator, compValue })

// --- condition trees (flat arrays, BFS order, parent indices non-decreasing) -----------------------

// register(string label, address owner, bytes32 secret, address subregistry,
//          address resolver, uint64 duration, address paymentToken, bytes32 referrer)
const DURATION_BOUND = MAX_YEARS * 365n * 24n * 60n * 60n + 1n // LessThan => duration <= cap
const registerConditions: ConditionFlat[] = [
  node(0, ParamType.Calldata, Operator.Matches), // 0: root
  node(0, ParamType.Dynamic, Operator.Pass), //     1: label (any)
  node(0, ParamType.Static, Operator.Pass), //      2: owner = buyer (any; charge hits msg.sender)
  node(0, ParamType.Static, Operator.Pass), //      3: secret (any)
  node(0, ParamType.Static, Operator.Pass), //      4: subregistry (any)
  node(0, ParamType.Static, Operator.Pass), //      5: resolver (any)
  node(0, ParamType.Static, Operator.LessThan, uintWord(DURATION_BOUND)), // 6: duration cap
  node(0, ParamType.None, Operator.Or), //          7: paymentToken: one of...
  node(0, ParamType.Static, Operator.Pass), //      8: referrer (any)
  node(7, ParamType.Static, Operator.EqualTo, addressWord(TARGETS.usdc)), // 9: ...USDC
  node(7, ParamType.Static, Operator.EqualTo, addressWord(TARGETS.dai)), // 10: ...DAI
]

// approve(address spender, uint256 amount) — the allowance is the blast-radius
// budget, so the spender is pinned to the registrar and the amount is capped.
const approveConditions = (cap: bigint): ConditionFlat[] => [
  node(0, ParamType.Calldata, Operator.Matches), // 0: root
  node(0, ParamType.Static, Operator.EqualTo, addressWord(TARGETS.registrar)), // 1: spender
  node(0, ParamType.Static, Operator.LessThan, uintWord(cap + 1n)), // 2: amount <= cap
]

// --- batch assembly --------------------------------------------------------------------------------

// Selectors derived from the exact ABIs the worker calls with, so the
// permission set can never drift from the code.
const selector = {
  commit: toFunctionSelector(
    getAbiItem({ abi: ETH_REGISTRAR_ABI, name: 'commit' }),
  ),
  register: toFunctionSelector(
    getAbiItem({ abi: ETH_REGISTRAR_ABI, name: 'register' }),
  ),
  approve: toFunctionSelector(getAbiItem({ abi: erc20Abi, name: 'approve' })),
  deployProxy: toFunctionSelector(
    getAbiItem({ abi: VERIFIABLE_FACTORY_ABI, name: 'deployProxy' }),
  ),
} as const

type AdminCall =
  | {
      functionName: 'assignRoles'
      args: readonly [Address, readonly Hex[], readonly boolean[]]
    }
  | { functionName: 'scopeTarget'; args: readonly [Hex, Address] }
  | {
      functionName: 'allowFunction'
      args: readonly [Hex, Address, Hex, number]
    }
  | {
      functionName: 'scopeFunction'
      args: readonly [Hex, Address, Hex, readonly ConditionFlat[], number]
    }

const calls: AdminCall[] = [
  { functionName: 'assignRoles', args: [MEMBER, [REGISTRAR_ROLE_KEY], [true]] },
  {
    functionName: 'scopeTarget',
    args: [REGISTRAR_ROLE_KEY, TARGETS.registrar],
  },
  { functionName: 'scopeTarget', args: [REGISTRAR_ROLE_KEY, TARGETS.usdc] },
  { functionName: 'scopeTarget', args: [REGISTRAR_ROLE_KEY, TARGETS.dai] },
  { functionName: 'scopeTarget', args: [REGISTRAR_ROLE_KEY, TARGETS.factory] },
  {
    functionName: 'allowFunction',
    args: [REGISTRAR_ROLE_KEY, TARGETS.registrar, selector.commit, EXEC_NONE],
  },
  {
    functionName: 'scopeFunction',
    args: [
      REGISTRAR_ROLE_KEY,
      TARGETS.registrar,
      selector.register,
      registerConditions,
      EXEC_NONE,
    ],
  },
  {
    functionName: 'scopeFunction',
    args: [
      REGISTRAR_ROLE_KEY,
      TARGETS.usdc,
      selector.approve,
      approveConditions(APPROVE_CAP_USDC),
      EXEC_NONE,
    ],
  },
  {
    functionName: 'scopeFunction',
    args: [
      REGISTRAR_ROLE_KEY,
      TARGETS.dai,
      selector.approve,
      approveConditions(APPROVE_CAP_DAI),
      EXEC_NONE,
    ],
  },
  {
    functionName: 'allowFunction',
    args: [
      REGISTRAR_ROLE_KEY,
      TARGETS.factory,
      selector.deployProxy,
      EXEC_NONE,
    ],
  },
]

const transactions = calls.map((call) => ({
  to: ROLES_MODULE,
  value: '0',
  // Raw calldata entries — the Transaction Builder renders them as custom data,
  // which sidesteps hand-maintaining the ConditionFlat tuple JSON shape.
  data: encodeFunctionData({ abi: ROLES_ADMIN_ABI, ...call } as Parameters<
    typeof encodeFunctionData
  >[0]),
  contractMethod: null,
  contractInputsValues: null,
}))

const batch = {
  version: '1.0',
  chainId: '11155111',
  meta: {
    name: 'Scope Crossmint fulfilment role (Zodiac Roles v2)',
    description:
      'Assigns the worker EOA to the ens-crossmint-registrar role and scopes it to the exact fulfilment surface.',
    txBuilderVersion: '1.18.2',
    createdFromSafeAddress: SAFE,
  },
  transactions,
}

const OUT = 'zodiac-roles.json'
writeFileSync(OUT, JSON.stringify(batch, null, 2))

console.log(`Safe (payer/avatar):   ${SAFE}`)
console.log(`Roles modifier:        ${ROLES_MODULE}`)
console.log(`Role member (worker):  ${MEMBER}`)
console.log(`Role key:              ${REGISTRAR_ROLE_KEY}`)
console.log(`Duration cap:          ${MAX_YEARS} years`)
console.log(
  `Approve caps:          ${APPROVE_CAP_USDC} USDC-wei / ${APPROVE_CAP_DAI} DAI-wei`,
)
console.log(`Targets: ${JSON.stringify(TARGETS, null, 2)}`)
console.log(`\nWrote ${transactions.length} transactions to ${OUT}`)
console.log(
  `\nUpload it in the Transaction Builder:\n  https://app.safe.global/apps/open?safe=sep:${SAFE}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`,
)
console.log(`\nAfter executing the batch, finish the runbook (docs/zodiac-roles.md):
  1. Fund the Safe with USDC/DAI float (+ keep the worker EOA on gas dust only).
  2. Set REGISTRAR_SAFE_ADDRESS + REGISTRAR_ROLES_MODULE_ADDRESS on the worker.
  (Voucher burning is an ops-only path — do NOT grant the Safe BURNER_ROLE.)`)
