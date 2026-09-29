import type { V1Domain } from '@ens-apps/migration'
import {
  decodeFunctionData,
  type Hex,
  type PublicClient,
  type WalletClient,
  zeroAddress,
  zeroHash,
} from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import {
  encodeGraceRenewal,
  executeGraceRenewal,
  GRACE_RENEWAL_ABI,
  GRACE_RENEWAL_EXTENSION,
  getGraceRenewalDuration,
  getGraceRenewalQuote,
} from './graceRenewal'
import {
  pendingGraceRenewalForQuote,
  readPendingGraceRenewal,
  writePendingGraceRenewal,
} from './graceRenewalPending'

const OWNER = '0x1111111111111111111111111111111111111111' as const
const OTHER = '0x2222222222222222222222222222222222222222' as const
const APPROVAL_HASH = `0x${'a'.repeat(64)}` as Hex
const RENEWAL_HASH = `0x${'b'.repeat(64)}` as Hex
const DAY = 86_400n
const NOW = 2_000_000_000n

const domain = (name: string, wrapped = false): V1Domain => ({
  id: namehash(name),
  name,
  labelName: name.slice(0, -4),
  labelhash: labelhash(name.slice(0, -4)),
  parent: { name: 'eth', wrappedDomain: null },
  owner: { id: wrapped ? V1_CONTRACTS.NameWrapper : OWNER },
  registrant: { id: wrapped ? V1_CONTRACTS.NameWrapper : OWNER },
  wrappedOwner: wrapped ? { id: OWNER } : null,
  registration: { expiryDate: (NOW - 30n * DAY).toString() },
  wrappedDomain: wrapped
    ? { expiryDate: (NOW + 60n * DAY).toString(), fuses: 1 }
    : null,
  resolver: null,
})

const setup = (domains = [domain('alice.eth'), domain('bob.eth', true)]) => {
  const state = {
    now: NOW,
    balance: 1_000_000n,
    allowance: 0n,
    price: 100n,
    renewable: true,
    account: OWNER as `0x${string}`,
    chainId: chain.id as number,
    approvalStatus: 'success' as 'success' | 'reverted',
    renewalStatus: 'success' as 'success' | 'reverted',
    expiry: new Map(
      domains.map((d) => [
        d.labelhash,
        BigInt(d.registration?.expiryDate ?? '0'),
      ]),
    ),
  }
  const pending = new Map<string, bigint>()
  const findToken = (tokenId: bigint) =>
    domains.find((d) => BigInt(d.labelhash) === tokenId)
  const getWrapperData = (node: unknown) => {
    const d = domains.find((item) => BigInt(item.id) === node)
    if (!d?.wrappedDomain) return [zeroAddress, 0, 0n]
    return [OWNER, 1, (state.expiry.get(d.labelhash) ?? 0n) + 90n * DAY]
  }
  const readContract = vi.fn(
    async (request: {
      functionName: string
      args?: readonly unknown[]
      address: string
    }) => {
      switch (request.functionName) {
        case 'MIN_RENEW_DURATION':
          return 1n
        case 'balanceOf':
          return state.balance
        case 'allowance':
          return state.allowance
        case 'isRenewable':
          return state.renewable
        case 'getRenewPrice':
          return state.price
        case 'nameExpires': {
          const d = findToken(request.args?.[0] as bigint)
          return d ? state.expiry.get(d.labelhash) : 0n
        }
        case 'getData':
          return getWrapperData(request.args?.[0])
        case 'owner': {
          const d = domains.find((item) => item.id === request.args?.[0])
          return d?.owner.id ?? zeroAddress
        }
        case 'ownerOf': {
          const d = findToken(request.args?.[0] as bigint)
          if (d && (state.expiry.get(d.labelhash) ?? 0n) <= state.now)
            throw new Error('ownerOf reverts during grace')
          return d?.wrappedDomain ? V1_CONTRACTS.NameWrapper : OWNER
        }
        default:
          throw new Error(`Unexpected read ${request.functionName}`)
      }
    },
  )
  const waitForTransactionReceipt = vi.fn(async ({ hash }: { hash: Hex }) => {
    if (hash === APPROVAL_HASH) {
      if (state.approvalStatus === 'success') state.allowance = 1_000_000n
      return { status: state.approvalStatus }
    }
    if (state.renewalStatus === 'success') {
      for (const [label, duration] of pending) {
        const hash = labelhash(label)
        state.expiry.set(hash, (state.expiry.get(hash) ?? 0n) + duration)
      }
      pending.clear()
    }
    return { status: state.renewalStatus }
  })
  const publicClient = {
    chain,
    getBlock: vi.fn(async () => ({ number: 100n, timestamp: state.now })),
    readContract,
    waitForTransactionReceipt,
    simulateContract: vi.fn(async () => ({})),
  } as unknown as PublicClient
  const writeContract = vi.fn(
    async ({
      functionName,
      args,
    }: {
      functionName: string
      args: readonly unknown[]
    }) => {
      if (functionName === 'approve') return APPROVAL_HASH
      for (const item of args[0] as readonly {
        label: string
        duration: bigint
      }[])
        pending.set(item.label, item.duration)
      return RENEWAL_HASH
    },
  )
  const walletClient = {
    getChainId: vi.fn(async () => state.chainId),
    getAddresses: vi.fn(async () => [state.account]),
    writeContract,
  } as unknown as WalletClient
  const quote = async () => {
    const result = await getGraceRenewalQuote({
      domains,
      ownerAddress: OWNER,
      publicClient,
    })
    if (result.isErr()) throw result.error
    return result.value
  }
  return {
    state,
    quote,
    domains,
    publicClient,
    walletClient,
    writeContract,
    readContract,
    waitForTransactionReceipt,
  }
}

describe('grace renewal duration', () => {
  it('covers elapsed expiry and seven additional days', () => {
    expect(getGraceRenewalDuration(NOW - 30n * DAY, NOW, 1n)).toBe(37n * DAY)
    expect(getGraceRenewalDuration(NOW, NOW, 1n)).toBe(GRACE_RENEWAL_EXTENSION)
  })

  it('respects the contract minimum and skips names already renewed', () => {
    expect(getGraceRenewalDuration(NOW, NOW, 10n * DAY)).toBe(10n * DAY)
    expect(getGraceRenewalDuration(NOW + DAY, NOW, 1n)).toBe(0n)
  })
})

describe('bulk grace renewal', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Number(NOW) * 1000)
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    })
    const locks = new Set<string>()
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          key: string,
          _options: unknown,
          callback: (lock: object | null) => Promise<unknown>,
        ) => {
          if (locks.has(key)) return callback(null)
          locks.add(key)
          try {
            return await callback({})
          } finally {
            locks.delete(key)
          }
        },
      },
    })
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('quotes each name from chain expiry and encodes one batch', async () => {
    const s = setup()
    s.state.expiry.set(labelhash('bob'), NOW - DAY)
    const quote = await s.quote()
    expect(quote.totalAmount).toBe(200n)
    expect(quote.balance).toBe(1_000_000n)
    expect(quote.items.map((item) => item.duration)).toEqual([
      37n * DAY,
      8n * DAY,
    ])
    expect(
      quote.items.every((item) => item.targetExpiry === NOW + 7n * DAY),
    ).toBe(true)
    expect(
      decodeFunctionData({
        abi: GRACE_RENEWAL_ABI,
        data: encodeGraceRenewal(quote),
      }),
    ).toEqual({
      functionName: 'renewBatch',
      args: [
        [
          { label: 'alice', duration: 37n * DAY, referrer: zeroHash },
          { label: 'bob', duration: 8n * DAY, referrer: zeroHash },
        ],
        quote.paymentToken,
      ],
    })
    expect(
      s.readContract.mock.calls.some(
        ([read]) => read.functionName === 'ownerOf',
      ),
    ).toBe(false)
  })

  it('rejects a name whose grace period ended, and does not trust a mismatched labelhash', async () => {
    const s = setup()
    s.state.expiry.set(labelhash('alice'), NOW - 90n * DAY)
    expect(
      await getGraceRenewalQuote({
        domains: s.domains,
        ownerAddress: OWNER,
        publicClient: s.publicClient,
      }),
    ).toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining('no longer in its grace period'),
      }),
    })
    s.state.expiry.set(labelhash('alice'), NOW - DAY)
    const invalid = {
      ...domain('alice.eth'),
      labelhash: labelhash('someone-else'),
    }
    expect(
      (
        await getGraceRenewalQuote({
          domains: [invalid],
          ownerAddress: OWNER,
          publicClient: s.publicClient,
        })
      ).isErr(),
    ).toBe(true)
  })

  it('rejects nonrenewable names and caps the quote at the grace boundary', async () => {
    const s = setup()
    s.state.expiry.set(labelhash('alice'), NOW - 90n * DAY + 10n)
    expect((await s.quote()).expiresAt).toBe(NOW + 10n)
    s.state.renewable = false
    expect(
      (
        await getGraceRenewalQuote({
          domains: s.domains,
          ownerAddress: OWNER,
          publicClient: s.publicClient,
        })
      ).isErr(),
    ).toBe(true)
  })

  it('approves once, renews once, then returns chain expiry including wrapper sync', async () => {
    const s = setup()
    const quote = await s.quote()
    const onRenewalSubmitted = vi.fn()
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      onRenewalSubmitted,
    })
    expect(result.isOk()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve', 'renewBatch'])
    expect(s.writeContract.mock.calls[0]?.[0].args[1]).toBe(200n)
    expect(onRenewalSubmitted).toHaveBeenCalledWith(RENEWAL_HASH)
    if (result.isOk()) {
      expect(result.value[0]?.registration?.expiryDate).toBe(
        (NOW + 7n * DAY).toString(),
      )
      expect(result.value[1]?.wrappedDomain?.expiryDate).toBe(
        (NOW + 97n * DAY).toString(),
      )
    }
    expect(
      s.readContract.mock.calls.some(
        ([read]) => read.functionName === 'ownerOf',
      ),
    ).toBe(true)
  })

  it('skips approval when allowance is sufficient', async () => {
    const s = setup()
    s.state.allowance = 1_000n
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isOk()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['renewBatch'])
  })

  it('does not submit renewal when approval reverts', async () => {
    const s = setup()
    s.state.approvalStatus = 'reverted'
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve'])
  })

  it('resumes a known transaction after a timeout without submitting again', async () => {
    const s = setup()
    s.state.allowance = 1_000n
    const quote = await s.quote()
    s.waitForTransactionReceipt.mockRejectedValueOnce(
      new Error('receipt timeout'),
    )
    const onRenewalSubmitted = vi.fn()
    const first = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      onRenewalSubmitted,
    })
    expect(first.isErr()).toBe(true)
    expect(onRenewalSubmitted).toHaveBeenCalledWith(RENEWAL_HASH)
    const retry = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(retry.isOk()).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
    expect(readPendingGraceRenewal(quote)).toBeNull()
  })

  it('does not resubmit a known reverted renewal', async () => {
    const s = setup()
    s.state.renewalStatus = 'reverted'
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      renewalHash: RENEWAL_HASH,
    })
    expect(result.isErr()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('blocks another tab while a renewal is awaiting its receipt', async () => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    let finish: ((receipt: { status: 'reverted' }) => void) | undefined
    s.waitForTransactionReceipt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const first = executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    await vi.waitFor(() =>
      expect(readPendingGraceRenewal(quote)?.hash).toBe(RENEWAL_HASH),
    )
    const second = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(second.isErr()).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
    finish?.({ status: 'reverted' })
    expect((await first).isErr()).toBe(true)
    expect(readPendingGraceRenewal(quote)).toBeNull()
  })

  it('reconciles a previous batch before requiring a new selection quote', async () => {
    const s = setup()
    const original = await s.quote()
    writePendingGraceRenewal(
      pendingGraceRenewalForQuote(original, RENEWAL_HASH),
    )
    for (const item of original.items)
      s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
    const changed = { ...original, items: original.items.slice(0, 1) }
    const result = await executeGraceRenewal({
      quote: changed,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(s.waitForTransactionReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ hash: RENEWAL_HASH }),
    )
    expect(s.writeContract).not.toHaveBeenCalled()
    expect(readPendingGraceRenewal(original)).toBeNull()
  })

  it('preserves an unresolved wallet submission without a hash across retries', async () => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    s.writeContract.mockImplementationOnce(async () => {
      expect(readPendingGraceRenewal(quote)?.hash).toBeUndefined()
      expect(readPendingGraceRenewal(quote)?.items).toHaveLength(2)
      throw new Error('wallet response lost')
    })
    const run = () =>
      executeGraceRenewal({
        quote,
        publicClient: s.publicClient,
        walletClient: s.walletClient,
      })
    expect((await run()).isErr()).toBe(true)
    expect((await run()).isErr()).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
    expect(readPendingGraceRenewal(quote)?.items).toHaveLength(2)
  })

  it('clears a reservation only when the wallet definitively rejects the request', async () => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    s.writeContract.mockRejectedValueOnce(
      Object.assign(new Error('rejected'), { code: 4001 }),
    )
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(readPendingGraceRenewal(quote)).toBeNull()
  })

  it('refuses submission without cross-tab locks or usable durable storage', async () => {
    const s = setup()
    const quote = await s.quote()
    vi.spyOn(localStorage, 'getItem').mockReturnValue('invalid json')
    expect(
      (
        await executeGraceRenewal({
          quote,
          publicClient: s.publicClient,
          walletClient: s.walletClient,
        })
      ).isErr(),
    ).toBe(true)
    vi.stubGlobal('navigator', {})
    expect(
      (
        await executeGraceRenewal({
          quote,
          publicClient: s.publicClient,
          walletClient: s.walletClient,
        })
      ).isErr(),
    ).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('skips renewed names after an indexer-lagged reload', async () => {
    const s = setup()
    for (const d of s.domains) s.state.expiry.set(d.labelhash, NOW + DAY)
    const quote = await s.quote()
    expect(quote.totalAmount).toBe(0n)
    expect(quote.items).toHaveLength(2)
    expect(quote.items.every((item) => item.duration === 0n)).toBe(true)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isOk()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('does not charge again when every quoted name was renewed elsewhere', async () => {
    const s = setup()
    const quote = await s.quote()
    for (const item of quote.items) {
      s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
    }
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isOk()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('uses elapsed wall time independently of a time-shifted chain', async () => {
    const s = setup()
    vi.mocked(Date.now).mockReturnValue(1_700_000_000_000)
    const quote = await s.quote()
    expect(quote.quotedAtMs).toBe(1_700_000_000_000)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isOk()).toBe(true)
  })

  it('requires requoting after five wall-clock minutes even when the chain has not advanced', async () => {
    const s = setup()
    const quote = await s.quote()
    vi.mocked(Date.now).mockReturnValue(quote.quotedAtMs + 300_000)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('does not accept an old receipt whose renewed names have expired again', async () => {
    const s = setup()
    const quote = await s.quote()
    for (const item of quote.items)
      s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
    s.state.now = NOW + 8n * DAY
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      renewalHash: RENEWAL_HASH,
    })
    expect(result.isErr()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('rechecks the quote after waiting for approval', async () => {
    const s = setup()
    const quote = await s.quote()
    s.waitForTransactionReceipt.mockImplementationOnce(async () => {
      s.state.now = quote.expiresAt
      return { status: 'success' }
    })
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve'])
  })

  it('requires a fresh quote after partial external renewal', async () => {
    const s = setup()
    const quote = await s.quote()
    s.state.expiry.set(labelhash('alice'), NOW + DAY)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isErr()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('rejects changed prices, insufficient funds, stale quotes and a different wallet', async () => {
    const s = setup()
    const quote = await s.quote()
    const execute = () =>
      executeGraceRenewal({
        quote,
        publicClient: s.publicClient,
        walletClient: s.walletClient,
      })
    s.state.price = 101n
    expect((await execute()).isErr()).toBe(true)
    s.state.price = 100n
    s.state.balance = 1n
    expect((await execute()).isErr()).toBe(true)
    s.state.balance = 1000n
    s.state.now = quote.expiresAt
    expect((await execute()).isErr()).toBe(true)
    s.state.now = NOW
    s.state.account = OTHER
    expect((await execute()).isErr()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('does not continue from approval to renewal after cancellation', async () => {
    const s = setup()
    const controller = new AbortController()
    s.waitForTransactionReceipt.mockImplementationOnce(async () => {
      controller.abort()
      return { status: 'success' }
    })
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      signal: controller.signal,
    })
    expect(result.isErr()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve'])
  })
})
