import type { V1Domain } from '@ens-apps/migration'
import {
  createWalletClient,
  custom,
  type Hex,
  isAddressEqual,
  type PublicClient,
  zeroAddress,
} from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { executeGraceRenewal, getGraceRenewalQuote } from './graceRenewal'

const OWNER = '0x1111111111111111111111111111111111111111' as const
const APPROVAL_HASH = `0x${'a'.repeat(64)}` as Hex
const DAY = 86_400n
const NOW = 2_000_000_000n
const EXPIRY = NOW - 30n * DAY
const SEND_METHODS: ReadonlySet<string> = new Set([
  'eth_sendTransaction',
  'wallet_sendTransaction',
])

const alice: V1Domain = {
  id: namehash('alice.eth'),
  name: 'alice.eth',
  labelName: 'alice',
  labelhash: labelhash('alice'),
  parent: { name: 'eth', wrappedDomain: null },
  owner: { id: OWNER },
  registrant: { id: OWNER },
  wrappedOwner: null,
  registration: { expiryDate: EXPIRY.toString() },
  wrappedDomain: null,
  resolver: null,
}

const readContract = vi.fn(
  async ({ functionName }: { functionName: string }) => {
    switch (functionName) {
      case 'MIN_RENEW_DURATION':
        return 1n
      case 'balanceOf':
        return 1_000_000n
      case 'allowance':
        return 0n
      case 'isRenewable':
        return true
      case 'getRenewPrice':
        return 100n
      case 'nameExpires':
        return EXPIRY
      case 'getStatus':
        return 1
      case 'owner':
        return OWNER
      case 'getData':
        return [zeroAddress, 0, 0n]
      default:
        throw new Error(`Unexpected read ${functionName}`)
    }
  },
)

const publicClient = {
  chain,
  getBlock: vi.fn(async () => ({ number: 100n, timestamp: NOW })),
  readContract,
  waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  simulateContract: vi.fn(async () => ({})),
} as unknown as PublicClient

type WalletRequest = {
  readonly method: string
  readonly params?: readonly [{ readonly to?: Hex }]
}

const walletFor = (sendError: { readonly code: number }) => {
  const request = vi.fn(async ({ method }: WalletRequest) => {
    if (method === 'eth_chainId') return `0x${chain.id.toString(16)}`
    if (method === 'eth_accounts') return [OWNER]
    if (method === 'eth_sendTransaction')
      throw Object.assign(new Error('wallet refused the request'), sendError)
    if (method === 'wallet_sendTransaction') return APPROVAL_HASH
    throw new Error(`Unexpected wallet request: ${method}`)
  })
  return {
    request,
    walletClient: createWalletClient({ chain, transport: custom({ request }) }),
  }
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Number(NOW) * 1000)
  const stored = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  })
  vi.stubGlobal('navigator', {
    locks: {
      request: (
        _key: string,
        _options: unknown,
        callback: (lock: object) => Promise<unknown>,
      ) => callback({}),
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('graceRenewal known bugs (WEB-1942)', () => {
  // The USDC approval uses writeContract, which viem retries through wallet_sendTransaction after these eth_sendTransaction errors. Remove .fails when fixed.
  it.fails.each([
    { name: 'InvalidInput', code: -32000 },
    { name: 'InvalidParams', code: -32602 },
    { name: 'MethodNotFound', code: -32601 },
    { name: 'MethodNotSupported', code: -32004 },
  ])(
    'WEB-1942 #9: sends the approval once when eth_sendTransaction fails with $name',
    async ({ code }) => {
      const quote = await getGraceRenewalQuote({
        domains: [alice],
        ownerAddress: OWNER,
        publicClient,
      })
      if (quote.isErr()) throw quote.error
      const { request, walletClient } = walletFor({ code })

      await executeGraceRenewal({
        quote: quote.value,
        publicClient,
        walletClient,
      })

      const approvalSends = request.mock.calls.filter(
        ([{ method, params }]) =>
          SEND_METHODS.has(method) &&
          params?.[0].to !== undefined &&
          isAddressEqual(params[0].to, quote.value.paymentToken),
      )
      expect(approvalSends.map(([{ method }]) => method)).toEqual([
        'eth_sendTransaction',
      ])
    },
  )
})
