import type { V1Domain } from '@ens-apps/migration'
import {
  type Address,
  ChainMismatchError,
  createWalletClient,
  custom,
  decodeFunctionData,
  type Hex,
  InsufficientFundsError,
  InvalidInputRpcError,
  NonceTooLowError,
  type PublicClient,
  type WalletClient,
  zeroAddress,
  zeroHash,
} from 'viem'
import { labelhash, namehash } from 'viem/ens'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { chain } from '@/config'
import { V1_CONTRACTS } from '../contracts/addresses'
import { classifyNames } from './classifyNames'
import {
  encodeGraceRenewal,
  executeGraceRenewal,
  GRACE_RENEWAL_ABI,
  GRACE_RENEWAL_EXTENSION,
  type GraceRenewalStatus,
  getGraceRenewalDuration,
  getGraceRenewalQuote,
  readGraceRenewalDomains,
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
    reservationStatus: undefined as number | undefined,
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
  const getWrapperData = (node: unknown): [Address, number, bigint] => {
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
        case 'getStatus': {
          const d = findToken(request.args?.[0] as bigint)
          const expiry = d ? (state.expiry.get(d.labelhash) ?? 0n) : 0n
          return (
            state.reservationStatus ?? (expiry + 62n * DAY > state.now ? 1 : 0)
          )
        }
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
    request: vi.fn(
      async ({ params }: { params: readonly [{ readonly data: Hex }] }) => {
        const { functionName, args } = decodeFunctionData({
          abi: GRACE_RENEWAL_ABI,
          data: params[0].data,
        })
        return writeContract({ functionName, args: args ?? [] })
      },
    ),
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

  it.each([
    false,
    true,
  ])('makes a late-grace name eligible after confirmed renewal (wrapped: %s)', async (isWrapped) => {
    const lateGrace = {
      ...domain('late.eth', isWrapped),
      registration: { expiryDate: (NOW - 70n * DAY).toString() },
      isUnreserved: true as const,
    }
    const s = setup([lateGrace])
    const quote = await s.quote()
    expect(quote.items[0]?.domain.isUnreserved).toBe(true)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    const renewed = result._unsafeUnwrap()

    expect(classifyNames(renewed, OWNER, chain.id).ineligible).toEqual([])
    expect(classifyNames(renewed, OWNER, chain.id).classified).toHaveLength(1)
    expect(lateGrace.isUnreserved).toBe(true)
    expect(s.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: chain.contracts.ensRegistry.address,
        functionName: 'getStatus',
        args: [BigInt(lateGrace.labelhash)],
        blockNumber: 100n,
      }),
    )
  })

  it.each([
    false,
    true,
  ])('refreshes a stale reservation after renewal elsewhere (resuming: %s)', async (resuming) => {
    const lateGrace = {
      ...domain('late.eth'),
      registration: { expiryDate: (NOW - 70n * DAY).toString() },
      isUnreserved: true as const,
    }
    const s = setup([lateGrace])
    const quote = await s.quote()
    s.state.expiry.set(lateGrace.labelhash, NOW + 7n * DAY)

    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      ...(resuming && { renewalHash: RENEWAL_HASH }),
    })

    expect(
      classifyNames(result._unsafeUnwrap(), OWNER, chain.id).classified,
    ).toHaveLength(1)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('keeps a live name ineligible when its onchain reservation is absent', async () => {
    const s = setup([domain('alice.eth')])
    s.state.expiry.set(labelhash('alice'), NOW + 7n * DAY)
    s.state.reservationStatus = 0
    const result = await readGraceRenewalDomains({
      domains: s.domains,
      ownerAddress: OWNER,
      publicClient: s.publicClient,
    })

    expect(
      classifyNames(result._unsafeUnwrap(), OWNER, chain.id).ineligible,
    ).toMatchObject([{ reason: 'not-reserved' }])
  })

  it('fails before requesting payment if reservation status cannot be read', async () => {
    const s = setup()
    const originalRead = s.readContract.getMockImplementation()
    if (!originalRead) throw new Error('Missing contract mock')
    s.readContract.mockImplementation(async (request) => {
      if (request.functionName === 'getStatus')
        throw new Error('RPC unavailable')
      return originalRead(request)
    })

    const result = await getGraceRenewalQuote({
      domains: s.domains,
      ownerAddress: OWNER,
      publicClient: s.publicClient,
    })

    expect(result.isErr()).toBe(true)
    expect(s.walletClient.request).not.toHaveBeenCalled()
  })

  it.each([
    false,
    true,
  ])('rejects a foreign owner before quoting or paying (wrapped: %s)', async (isWrapped) => {
    const s = setup([domain('alice.eth', isWrapped)])
    const quote = await s.quote()
    const foreign = {
      ...domain('alice.eth', isWrapped),
      registrant: { id: OTHER },
    }
    if (isWrapped) {
      const originalRead = s.readContract.getMockImplementation()
      if (!originalRead) throw new Error('Missing contract mock')
      s.readContract.mockImplementation(async (request) =>
        request.functionName === 'getData'
          ? [OTHER, 1, NOW + 60n * DAY]
          : originalRead(request),
      )
    }
    const result = await getGraceRenewalQuote({
      domains: [foreign],
      ownerAddress: OWNER,
      publicClient: s.publicClient,
    })
    expect(result).toMatchObject({
      error: { message: 'alice.eth is no longer owned by this wallet.' },
    })
    const execution = await executeGraceRenewal({
      quote: {
        ...quote,
        items: quote.items.map((item) => ({ ...item, domain: foreign })),
      },
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(execution).toMatchObject({
      error: { message: 'alice.eth is no longer owned by this wallet.' },
    })
    expect(s.writeContract).not.toHaveBeenCalled()
    expect(s.walletClient.request).not.toHaveBeenCalled()
  })

  it.each([
    false,
    true,
  ])('discards a hashless reservation only after confirmation: %s', async (confirmed) => {
    const s = setup()
    const quote = await s.quote()
    const pending = pendingGraceRenewalForQuote(quote)
    writePendingGraceRenewal(pending)
    const confirmDiscardUnsubmittedRenewal = vi.fn(async () => confirmed)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      confirmDiscardUnsubmittedRenewal,
    })
    expect(result.isErr()).toBe(true)
    expect(confirmDiscardUnsubmittedRenewal).toHaveBeenCalledWith(pending)
    expect(readPendingGraceRenewal(quote)).toEqual(confirmed ? null : pending)
    expect(s.writeContract).not.toHaveBeenCalled()
    if (confirmed) {
      expect(
        (
          await executeGraceRenewal({
            quote: await s.quote(),
            publicClient: s.publicClient,
            walletClient: s.walletClient,
          })
        ).isOk(),
      ).toBe(true)
    }
  })

  it('holds the lock during discard confirmation and reconciles a late broadcast', async () => {
    const s = setup()
    const quote = await s.quote()
    writePendingGraceRenewal(pendingGraceRenewalForQuote(quote))
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      confirmDiscardUnsubmittedRenewal: async () => {
        const concurrent = await executeGraceRenewal({
          quote,
          publicClient: s.publicClient,
          walletClient: s.walletClient,
        })
        expect(concurrent.isErr()).toBe(true)
        for (const item of quote.items)
          s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
        return true
      },
    })
    expect(result.isOk()).toBe(true)
    expect(readPendingGraceRenewal(quote)).toBeNull()
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('retains the reservation when confirmation is aborted', async () => {
    const s = setup()
    const quote = await s.quote()
    const pending = pendingGraceRenewalForQuote(quote)
    writePendingGraceRenewal(pending)
    const controller = new AbortController()
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      signal: controller.signal,
      confirmDiscardUnsubmittedRenewal: async () => {
        controller.abort()
        return true
      },
    })
    expect(result.isErr()).toBe(true)
    expect(readPendingGraceRenewal(quote)).toEqual(pending)
    expect(s.writeContract).not.toHaveBeenCalled()
  })

  it('does not offer discard for a renewal with a transaction hash', async () => {
    const s = setup()
    const quote = await s.quote()
    writePendingGraceRenewal(pendingGraceRenewalForQuote(quote, RENEWAL_HASH))
    const confirmDiscardUnsubmittedRenewal = vi.fn(async () => true)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      confirmDiscardUnsubmittedRenewal,
    })
    expect(result.isErr()).toBe(true)
    expect(confirmDiscardUnsubmittedRenewal).not.toHaveBeenCalled()
    expect(readPendingGraceRenewal(quote)?.hash).toBe(RENEWAL_HASH)
    expect(s.writeContract).not.toHaveBeenCalled()
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
    expect(s.walletClient.request).toHaveBeenCalledExactlyOnceWith(
      {
        method: 'eth_sendTransaction',
        params: [
          {
            from: OWNER,
            to: quote.renewerAddress,
            chainId: `0x${quote.chainId.toString(16)}`,
            data: encodeGraceRenewal(quote),
          },
        ],
      },
      { retryCount: 0 },
    )
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
    const onStatus = vi.fn<(status: GraceRenewalStatus) => void>()
    const onApprovalRequired = vi.fn<(required: boolean) => void>()
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      onStatus,
      onApprovalRequired,
    })
    expect(result.isOk()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['renewBatch'])
    expect(onApprovalRequired).toHaveBeenCalledExactlyOnceWith(false)
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      'renewing',
      'confirming',
    ])
  })

  it('marks approval complete only after its successful receipt', async () => {
    const s = setup()
    const onStatus = vi.fn<(status: GraceRenewalStatus) => void>()
    const onApprovalRequired = vi.fn<(required: boolean) => void>()
    let completeApproval: ((receipt: { status: 'success' }) => void) | undefined
    s.waitForTransactionReceipt.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          completeApproval = resolve
        }),
    )
    const result = executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      onStatus,
      onApprovalRequired,
    })

    await vi.waitFor(() =>
      expect(s.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: APPROVAL_HASH,
      }),
    )
    expect(onApprovalRequired).toHaveBeenCalledExactlyOnceWith(true)
    expect(onApprovalRequired).toHaveBeenCalledBefore(onStatus)
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      'approving',
      'approval-confirming',
    ])
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve'])

    s.state.allowance = 1_000n
    completeApproval?.({ status: 'success' })

    expect((await result).isOk()).toBe(true)
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      'approving',
      'approval-confirming',
      'approval-complete',
      'renewing',
      'confirming',
    ])
  })

  it('does not submit renewal when approval reverts', async () => {
    const s = setup()
    s.state.approvalStatus = 'reverted'
    const onStatus = vi.fn<(status: GraceRenewalStatus) => void>()
    const onApprovalRequired = vi.fn<(required: boolean) => void>()
    const result = await executeGraceRenewal({
      quote: await s.quote(),
      publicClient: s.publicClient,
      walletClient: s.walletClient,
      onStatus,
      onApprovalRequired,
    })
    expect(result.isErr()).toBe(true)
    expect(
      s.writeContract.mock.calls.map(([call]) => call.functionName),
    ).toEqual(['approve'])
    expect(onApprovalRequired).toHaveBeenCalledExactlyOnceWith(true)
    expect(onStatus.mock.calls.map(([status]) => status)).toEqual([
      'approving',
      'approval-confirming',
    ])
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

  it.each([
    new Error('wallet response lost'),
    Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
    Object.assign(new Error('provider disconnected'), { code: 4900 }),
    Object.assign(new Error('internal RPC error'), { code: -32603 }),
    new InvalidInputRpcError(new Error('already known')),
    new NonceTooLowError(),
  ])('preserves an unresolved wallet submission after $message', async (error) => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    s.writeContract.mockImplementationOnce(async () => {
      expect(readPendingGraceRenewal(quote)?.hash).toBeUndefined()
      expect(readPendingGraceRenewal(quote)?.items).toHaveLength(2)
      throw new Error('Wallet request failed', { cause: error })
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

  it.each([
    { code: -32603, message: 'wallet response lost' },
    { code: -32603, message: 'insufficient funds for gas * price + value' },
    { code: -32000, message: 'wallet response lost' },
    { code: -32000, message: 'already known' },
    { code: -32003, message: 'nonce too low' },
  ])('preserves ambiguous RPC failure $code: $message without a fallback submission', async ({
    code,
    message,
  }) => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return `0x${chain.id.toString(16)}`
      if (method === 'eth_accounts') return [OWNER]
      if (method === 'eth_sendTransaction')
        throw Object.assign(new Error(message), {
          code,
        })
      if (method === 'wallet_sendTransaction')
        throw Object.assign(new Error('account unauthorized'), { code: 4100 })
      throw new Error(`Unexpected wallet request: ${method}`)
    })
    const walletClient = createWalletClient({
      chain,
      transport: custom({ request }),
    })
    const run = () =>
      executeGraceRenewal({
        quote,
        publicClient: s.publicClient,
        walletClient,
      })
    expect((await run()).isErr()).toBe(true)
    expect(readPendingGraceRenewal(quote)?.items).toHaveLength(2)
    expect((await run()).isErr()).toBe(true)
    expect(
      request.mock.calls.filter(
        ([{ method }]) => method === 'eth_sendTransaction',
      ),
    ).toHaveLength(1)
    expect(
      request.mock.calls.some(
        ([{ method }]) => method === 'wallet_sendTransaction',
      ),
    ).toBe(false)
  })

  it.each([
    { code: -32000, message: 'insufficient funds for gas * price + value' },
    { code: -32000, message: 'max fee per gas less than block base fee' },
    { code: -32003, message: 'intrinsic gas too low' },
  ])('allows retry after the provider refuses creation with $message', async ({
    code,
    message,
  }) => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    const sendTransaction = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error(message), { code }))
      .mockResolvedValue(RENEWAL_HASH)
    const walletClient = createWalletClient({
      chain,
      transport: custom({
        request: async ({ method }) => {
          if (method === 'eth_chainId') return `0x${chain.id.toString(16)}`
          if (method === 'eth_accounts') return [OWNER]
          if (method === 'eth_sendTransaction') return sendTransaction()
          throw new Error(`Unexpected wallet request: ${method}`)
        },
      }),
    })
    s.waitForTransactionReceipt.mockImplementationOnce(async () => {
      for (const item of quote.items)
        s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
      return { status: 'success' }
    })
    const run = () =>
      executeGraceRenewal({
        quote,
        publicClient: s.publicClient,
        walletClient,
      })
    expect((await run()).isErr()).toBe(true)
    expect(sendTransaction).toHaveBeenCalledOnce()
    expect(s.waitForTransactionReceipt).not.toHaveBeenCalled()
    expect(readPendingGraceRenewal(quote)).toBeNull()
    expect((await run()).isOk()).toBe(true)
    expect(sendTransaction).toHaveBeenCalledTimes(2)
    expect(s.waitForTransactionReceipt).toHaveBeenCalledOnce()
    expect(readPendingGraceRenewal(quote)).toBeNull()
  })

  it.each([
    ...[4001, 4100, 4200, -32700, -32600, -32601, -32602, -32004].map((code) =>
      Object.assign(new Error(`RPC rejection ${code}`), { code }),
    ),
    new InsufficientFundsError(),
    new ChainMismatchError({ chain, currentChainId: chain.id + 1 }),
  ])('allows retry after a definitive submission failure: $message', async (error) => {
    const s = setup()
    const quote = await s.quote()
    s.state.allowance = 1000n
    s.writeContract.mockRejectedValueOnce(
      new Error('Wallet request failed', { cause: error }),
    )
    const run = () =>
      executeGraceRenewal({
        quote,
        publicClient: s.publicClient,
        walletClient: s.walletClient,
      })
    expect((await run()).isErr()).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(1)
    expect(s.waitForTransactionReceipt).not.toHaveBeenCalled()
    expect(readPendingGraceRenewal(quote)).toBeNull()
    expect((await run()).isOk()).toBe(true)
    expect(s.writeContract).toHaveBeenCalledTimes(2)
    expect(s.waitForTransactionReceipt).toHaveBeenCalledOnce()
    expect(readPendingGraceRenewal(quote)).toBeNull()
  })

  it('reconciles a lost hash once the renewal lands without resubmitting', async () => {
    const s = setup()
    const quote = await s.quote()
    writePendingGraceRenewal(pendingGraceRenewalForQuote(quote))
    for (const item of quote.items)
      s.state.expiry.set(item.domain.labelhash, item.targetExpiry)
    const result = await executeGraceRenewal({
      quote,
      publicClient: s.publicClient,
      walletClient: s.walletClient,
    })
    expect(result.isOk()).toBe(true)
    expect(s.writeContract).not.toHaveBeenCalled()
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
