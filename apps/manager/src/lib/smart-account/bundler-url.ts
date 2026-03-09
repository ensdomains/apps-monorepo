/**
 * Bundler RPC URL for ERC-4337 (Pimlico / Alto).
 * When VITE_PIMLICO_BUNDLER_URL is set (e.g. http://localhost:4337 for local Alto),
 * the app sends UserOps to that endpoint instead of api.pimlico.io.
 * Use with a local Alto instance pointed at your Anvil fork so registration runs on the fork.
 */

import type { Transport } from 'viem'
import { custom, http } from 'viem'
import type { PaymasterClient } from 'viem/account-abstraction'
import { createPaymasterClient } from 'viem/account-abstraction'
import { customSepolia, publicClient } from '@/lib/wagmi'

/** Placeholder gas limits so Alto's eth_estimateUserOperationGas simulation does not run with 0 and revert (0x). */
const ESTIMATE_GAS_PATCH = {
  callGasLimit: '0x493E0' as const, // 300000
  preVerificationGas: '0x186A0' as const, // 100000
  verificationGasLimit: '0x30D40' as const, // 200000
}

const DEBUG_BUNDLER =
  typeof import.meta !== 'undefined' &&
  import.meta.env?.VITE_DEBUG_BUNDLER === 'true'

function isUserOpParam(obj: unknown): obj is Record<string, unknown> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sender' in obj &&
    ('callData' in obj || 'callGasLimit' in obj)
  )
}

function isZeroOrEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (value === 0 || value === '0' || value === '0x0') return true
  if (typeof value === 'bigint' && value === 0n) return true
  return false
}

function needsGasPatch(uo: Record<string, unknown>): boolean {
  return (
    isZeroOrEmpty(uo.callGasLimit) ||
    isZeroOrEmpty(uo.preVerificationGas) ||
    isZeroOrEmpty(uo.verificationGasLimit)
  )
}

function patchUserOpGas(uo: Record<string, unknown>): Record<string, unknown> {
  return { ...uo, ...ESTIMATE_GAS_PATCH }
}

async function bundlerFetch(
  url: string,
  method: string,
  params: unknown[],
): Promise<unknown> {
  const body = { jsonrpc: '2.0', id: 1, method, params }

  if (DEBUG_BUNDLER) {
    // This shows the *actual* UserOp & gas values we send to Alto.
    // Useful when viem's error message still prints pre-patch zeros.
    // Beware: this can log signatures & addresses; only use in local dev.
    // eslint-disable-next-line no-console
    console.log('[BUNDLER RPC BODY]', JSON.stringify(body, null, 2))
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  type BundlerResponse = { result?: unknown; error?: { message: string } }
  const data: BundlerResponse = await res.json()
  if (data.error) {
    throw new Error(data.error.message ?? 'Bundler RPC error')
  }
  return data.result
}

/**
 * Transport that patches eth_estimateUserOperationGas requests to use non-zero gas limits
 * before forwarding to the local bundler (Alto). The SDK sends 0 for gas during estimation;
 * Alto simulates with those values and reverts with reason 0x. This wrapper fixes that.
 * Uses fetch directly so we don't depend on viem's http transport internals.
 */
export function getLocalBundlerTransport(url: string): Transport {
  return custom({
    request: async (args) => {
      const params: unknown[] = Array.isArray(args.params)
        ? [...args.params]
        : []
      const first = params[0]

      if (DEBUG_BUNDLER) {
        console.log('[BUNDLER]', args.method, {
          paramCount: params.length,
          firstKeys:
            typeof first === 'object' && first !== null
              ? Object.keys(first as object)
              : [],
        })
      }

      if (isUserOpParam(first) && needsGasPatch(first)) {
        params[0] = patchUserOpGas(first)
        if (DEBUG_BUNDLER) console.log('[BUNDLER] patched params[0] gas')
      } else if (
        typeof first === 'object' &&
        first !== null &&
        'userOperation' in (first as Record<string, unknown>)
      ) {
        const wrapper = first as Record<string, unknown>
        const uo = wrapper.userOperation as Record<string, unknown>
        if (isUserOpParam(uo) && needsGasPatch(uo)) {
          params[0] = { ...wrapper, userOperation: patchUserOpGas(uo) }
          if (DEBUG_BUNDLER)
            console.log('[BUNDLER] patched params[0].userOperation gas')
        }
      }

      return bundlerFetch(url, args.method, params)
    },
  })
}

export function getPimlicoBundlerUrl(): string {
  const custom = import.meta.env.VITE_PIMLICO_BUNDLER_URL
  if (typeof custom === 'string' && custom.length > 0) {
    return custom
  }
  const apiKey = import.meta.env.VITE_PIMLICO_API_KEY
  if (!apiKey) {
    throw new Error('Pimlico API key not configured (VITE_PIMLICO_API_KEY)')
  }
  return `https://api.pimlico.io/v2/${customSepolia.id}/rpc?apikey=${apiKey}`
}

/** True when using a local bundler (e.g. Alto); no Pimlico API key or paymaster. */
export function isLocalBundler(): boolean {
  const url = import.meta.env.VITE_PIMLICO_BUNDLER_URL
  return typeof url === 'string' && url.length > 0
}

/** Paymaster URL for local E2E (e.g. mock-verifying-paymaster at http://127.0.0.1:3000). */
export function getLocalPaymasterUrl(): string | undefined {
  const url = import.meta.env.VITE_PAYMASTER_URL
  return typeof url === 'string' && url.length > 0 ? url : undefined
}

/** ERC-7677 paymaster client for local stack when VITE_PAYMASTER_URL is set. */
export function getLocalPaymasterClient(): PaymasterClient | undefined {
  const url = getLocalPaymasterUrl()
  if (!url) return undefined
  return createPaymasterClient({
    transport: http(url),
  }) as PaymasterClient
}

/**
 * Gas fees for UserOps when using a local bundler (Alto).
 * Alto does not support pimlico_getUserOperationGasPrice; use chain gas instead.
 *
 * When using the local bundler, the Kernel client also passes placeholder gas limits
 * (preVerificationGas, verificationGasLimit, callGasLimit) so eth_estimateUserOperationGas
 * does not simulate with 0 gas and revert with reason 0x.
 */
export async function getChainFeesForUserOp(): Promise<{
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}> {
  const block = await publicClient.getBlock({ blockTag: 'pending' })
  const baseFeePerGas = block.baseFeePerGas ?? 0n
  const maxPriorityFeePerGas = 1_000_000_000n // 1 gwei
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas
  return { maxFeePerGas, maxPriorityFeePerGas }
}
