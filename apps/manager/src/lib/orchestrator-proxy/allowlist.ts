/**
 * Allowlist + call-validation for the Rhinestone orchestrator proxy.
 *
 * The proxy only sponsors gas for ENS operations, so every call in an
 * incoming Intent must target an allowlisted ENS contract and invoke an
 * allowlisted function selector. Contract addresses are resolved from
 * `@ensdomains/ensjs` chain config (single source of truth) and selectors
 * are derived from ensjs-abi snippets via viem (no hardcoded hex).
 */

import {
  l2EthRegistrarCommitSnippet,
  l2EthRegistrarMakeCommitmentSnippet,
  l2EthRegistrarRegisterSnippet,
  l2EthRegistrarRenewSnippet,
} from '@ensdomains/ensjs/contracts'
import { type Abi, type AbiFunction, erc20Abi, toFunctionSelector } from 'viem'

// Rhinestone OwnableValidator — fixed address across chains (not an ENS
// contract, so it has no canonical source in ensjs).
const OWNABLE_VALIDATOR = '0x000000000000000000000000000000000000fffe'

/**
 * Extract the single function item from an ensjs-abi snippet (an ABI array
 * that bundles the function together with its error definitions) so its
 * 4-byte selector can be derived. Throws if the snippet has no function —
 * a build-time misconfiguration we want to fail loudly on.
 */
function selectorFromSnippet(abi: Abi, name?: string): `0x${string}` {
  const fn = abi.find(
    (item): item is AbiFunction =>
      item.type === 'function' && (name === undefined || item.name === name),
  )
  if (!fn) {
    throw new Error(
      `No function${name ? ` "${name}"` : ''} found in ABI snippet`,
    )
  }
  return toFunctionSelector(fn)
}

// Derive selectors from ABIs once (same across chains).
export const ALLOWED_SELECTORS: ReadonlySet<string> = new Set([
  selectorFromSnippet(l2EthRegistrarCommitSnippet),
  selectorFromSnippet(l2EthRegistrarRegisterSnippet),
  selectorFromSnippet(l2EthRegistrarRenewSnippet),
  selectorFromSnippet(l2EthRegistrarMakeCommitmentSnippet),
  selectorFromSnippet(erc20Abi, 'approve'),
  toFunctionSelector({
    name: 'addOwner',
    type: 'function',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'expiry', type: 'uint48' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  }),
  toFunctionSelector({
    name: 'removeOwner',
    type: 'function',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  }),
])

/**
 * Build the set of allowlisted contract addresses for the given chain,
 * resolved from ensjs chain config.
 */
export async function buildContractAllowlist(
  chain: 'sepolia' | 'mainnet',
): Promise<ReadonlySet<string>> {
  const { ensL1Contracts, supportedL1Chains } = await import(
    '@ensdomains/ensjs/chain'
  )
  const contracts = ensL1Contracts[supportedL1Chains[chain]]

  return new Set([
    contracts.ensRegistry.address.toLowerCase(),
    contracts.ensLegacyRegistry.address.toLowerCase(),
    contracts.ensEthRegistrar.address.toLowerCase(),
    contracts.ensEthRegistrarController.address.toLowerCase(),
    contracts.ensPublicResolver.address.toLowerCase(),
    contracts.ensReverseRegistrar.address.toLowerCase(),
    contracts.ensVerifiableFactory.address.toLowerCase(),
    contracts.ensHcaFactory.address.toLowerCase(),
    contracts.usdc.address.toLowerCase(),
    contracts.dai.address.toLowerCase(),
    OWNABLE_VALIDATOR,
  ])
}

type Call = { to: string; data?: string }

/**
 * Pull the executed calls out of an orchestrator request body. Warp Intents
 * expose them as either `calls` or `destinationExecutions`.
 */
export function extractCalls(body: unknown): Call[] {
  const obj = body as Record<string, unknown> | undefined
  if (!obj) return []
  if (Array.isArray(obj.calls)) return obj.calls as Call[]
  if (Array.isArray(obj.destinationExecutions)) {
    return obj.destinationExecutions as Call[]
  }
  return []
}

/** Pull the smart-account address out of a request body, for rate-limiting. */
export function extractAccount(body: unknown): string | null {
  const obj = body as Record<string, unknown> | undefined
  if (!obj) return null
  if (typeof obj.account === 'string') return obj.account.toLowerCase()
  return null
}

/** Validate that every call targets an allowlisted contract + selector. */
export function validateCalls(
  calls: Call[],
  allowlist: {
    contracts: ReadonlySet<string>
    selectors: ReadonlySet<string>
  },
): { ok: true } | { ok: false; reason: string } {
  for (const call of calls) {
    const to = call.to?.toLowerCase()
    if (!to) return { ok: false, reason: 'Call missing "to" address' }
    if (!allowlist.contracts.has(to)) {
      return { ok: false, reason: `Contract not allowlisted: ${to}` }
    }
    const selector = call.data?.slice(0, 10).toLowerCase()
    if (selector && selector !== '0x' && !allowlist.selectors.has(selector)) {
      return {
        ok: false,
        reason: `Selector not allowlisted: ${selector} on ${to}`,
      }
    }
  }
  return { ok: true }
}
