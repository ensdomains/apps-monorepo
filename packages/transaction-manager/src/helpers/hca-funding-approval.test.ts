import { describe, expect, it } from 'vitest'
import {
  getHcaApprovalRecovery,
  validateHcaFundingBounds,
} from './hca-funding-approval'

const HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const

describe('approval recovery and funding bounds', () => {
  it.each([
    [null, 4n, 4n, 'ready'],
    [null, 3n, 4n, 'approve'],
    [{ kind: 'reserved', amount: '4' }, 4n, 4n, 'blocked'],
    [{ kind: 'submitted', amount: '4', hash: HASH }, 4n, 4n, 'wait'],
  ] as const)(
    'preserves reservations before using standing allowance',
    (pending, allowance, required, kind) => {
      expect(getHcaApprovalRecovery(pending, allowance, required).kind).toBe(
        kind,
      )
    },
  )

  it.each([
    [4n, 4n, true],
    [3n, 4n, true],
    [5n, 4n, false],
  ])(
    'requires fresh consent if the postapproval shortfall grows',
    (required, consented, allowed) => {
      expect(validateHcaFundingBounds(required, consented).isOk()).toBe(allowed)
    },
  )
})

import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeFunctionData,
  erc20Abi,
  UserRejectedRequestError,
} from 'viem'
import { mainnet } from 'viem/chains'
import { vi } from 'vitest'
import {
  approveHcaFunding,
  recoverHcaFundingApproval,
} from './hca-funding-approval'

const OWNER = '0x3333333333333333333333333333333333333333' as const
const TOKEN = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const
const SPENDER = '0x1111111111111111111111111111111111111111' as const
const deferred = <T>() => {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const makeRun = () => {
  const records = new Map<string, string>()
  let locked = false
  const storage = {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => {
      records.set(key, value)
    },
    removeItem: (key: string) => {
      records.delete(key)
    },
  }
  const transport = custom({ request: async () => undefined })
  const publicClient = {
    ...createPublicClient({ chain: mainnet, transport }),
    readContract: vi.fn().mockResolvedValue(0n),
    estimateContractGas: vi.fn().mockResolvedValue(50_000n),
    estimateFeesPerGas: vi
      .fn()
      .mockResolvedValue({ maxFeePerGas: 3n, maxPriorityFeePerGas: 1n }),
    simulateContract: vi.fn().mockResolvedValue({}),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 'success' }),
  }
  const walletClient = {
    ...createWalletClient({ chain: mainnet, transport }),
    getAddresses: vi.fn().mockResolvedValue([OWNER]),
    getChainId: vi.fn().mockResolvedValue(1),
    request: vi.fn().mockImplementation(async () => {
      publicClient.readContract.mockResolvedValue(4n)
      return HASH
    }),
  }
  const input = {
    publicClient,
    walletClient,
    owner: OWNER,
    token: TOKEN,
    spender: SPENDER,
    chainId: 1,
    amount: 4n,
    confirmApproval: vi.fn(() => true),
    onState: vi.fn(),
    environment: {
      storage,
      locks: {
        request: vi.fn(async (_key, _options, callback) => {
          if (locked) return callback(null)
          locked = true
          try {
            return await callback({ name: 'test', mode: 'exclusive' })
          } finally {
            locked = false
          }
        }),
      },
    },
  }
  return { input, records }
}

describe('approval wallet and persistence boundaries', () => {
  it('asks separately for exact set-allowance and capped ETH gas, then writes once without retries', async () => {
    const { input, records } = makeRun()
    expect((await approveHcaFunding(input)).isOk()).toBe(true)
    expect(input.confirmApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'approval',
        amount: 4n,
        spender: SPENDER,
        nativeSymbol: 'ETH',
        maxGasCost: 150_000n,
      }),
    )
    expect(input.walletClient.request).toHaveBeenCalledTimes(1)
    const [request, options] = input.walletClient.request.mock.calls[0] ?? []
    expect(options).toEqual({ retryCount: 0 })
    expect(
      decodeFunctionData({ abi: erc20Abi, data: request.params[0].data }),
    ).toEqual({ functionName: 'approve', args: [SPENDER, 4n] })
    expect(records.size).toBe(0)
  })

  it('does not turn partial allowance into an increment or repeat a sufficient approval', async () => {
    const { input } = makeRun()
    input.publicClient.readContract.mockResolvedValue(3n)
    expect((await approveHcaFunding(input)).isOk()).toBe(true)
    expect(input.confirmApproval.mock.calls[0]?.[0].amount).toBe(4n)
    input.walletClient.request.mockClear()
    expect((await approveHcaFunding(input)).isOk()).toBe(true)
    expect(input.walletClient.request).not.toHaveBeenCalled()
  })

  it('decline never reserves or opens the wallet', async () => {
    const { input, records } = makeRun()
    input.confirmApproval.mockReturnValue(false)
    const result = await approveHcaFunding(input)
    expect(result.isErr() && result.error.message).toContain(
      'renewal was not submitted',
    )
    expect(input.walletClient.request).not.toHaveBeenCalled()
    expect(records.size).toBe(0)
  })

  it.each(['account', 'chain'] as const)(
    'stops a live %s change immediately before the write',
    async (change) => {
      const { input, records } = makeRun()
      input.confirmApproval.mockImplementation(() => {
        if (change === 'account')
          input.walletClient.getAddresses.mockResolvedValue([SPENDER])
        else input.walletClient.getChainId.mockResolvedValue(10)
        return true
      })
      expect((await approveHcaFunding(input)).isErr()).toBe(true)
      expect(input.walletClient.request).not.toHaveBeenCalled()
      expect(records.size).toBe(0)
    },
  )

  it('retains an ambiguous hashless write and blocks another send even if allowance later appears sufficient', async () => {
    const { input, records } = makeRun()
    input.walletClient.request.mockRejectedValue(
      new Error('Connection dropped'),
    )
    expect((await approveHcaFunding(input)).isErr()).toBe(true)
    expect([...records.values()]).toEqual([
      JSON.stringify({ kind: 'reserved', amount: '4' }),
    ])
    input.publicClient.readContract.mockResolvedValue(4n)
    expect((await approveHcaFunding(input)).isErr()).toBe(true)
    expect(input.walletClient.request).toHaveBeenCalledTimes(1)
  })

  it('clears only a definite wallet rejection so a fresh explicit attempt can retry', async () => {
    const { input, records } = makeRun()
    input.walletClient.request.mockRejectedValueOnce(
      new UserRejectedRequestError(new Error('rejected')),
    )
    expect((await approveHcaFunding(input)).isErr()).toBe(true)
    expect(records.size).toBe(0)
    expect((await approveHcaFunding(input)).isOk()).toBe(true)
    expect(input.walletClient.request).toHaveBeenCalledTimes(2)
  })

  it('keeps a late hash after detach and resumes its uncertain receipt without sending again', async () => {
    const { input, records } = makeRun()
    const send = deferred<typeof HASH>()
    const abort = new AbortController()
    input.walletClient.request.mockReturnValueOnce(send.promise)
    input.publicClient.waitForTransactionReceipt.mockRejectedValueOnce(
      new Error('receipt RPC down'),
    )
    const running = approveHcaFunding({ ...input, signal: abort.signal })
    await vi.waitFor(() =>
      expect(input.walletClient.request).toHaveBeenCalledOnce(),
    )
    abort.abort()
    input.onState.mockClear()
    expect(
      (await approveHcaFunding({ ...input, onState: () => undefined })).isErr(),
    ).toBe(true)
    send.resolve(HASH)
    expect((await running).isErr()).toBe(true)
    // A newer bulk consent may now use the same mounted hook. Old progress must stay silent.
    expect(input.onState).not.toHaveBeenCalled()
    expect([...records.values()]).toEqual([
      JSON.stringify({ kind: 'submitted', amount: '4', hash: HASH }),
    ])
    input.publicClient.readContract.mockResolvedValue(4n)
    expect((await recoverHcaFundingApproval(input)).isOk()).toBe(true)
    expect(input.walletClient.request).toHaveBeenCalledOnce()
    expect(records.size).toBe(0)
  })

  it.each(['revert', 'account', 'chain', 'detach'] as const)(
    'cannot continue after receipt on %s',
    async (change) => {
      const { input, records } = makeRun()
      const abort = new AbortController()
      input.publicClient.waitForTransactionReceipt.mockImplementation(
        async () => {
          if (change === 'account')
            input.walletClient.getAddresses.mockResolvedValue([SPENDER])
          if (change === 'chain')
            input.walletClient.getChainId.mockResolvedValue(10)
          if (change === 'detach') abort.abort()
          return { status: change === 'revert' ? 'reverted' : 'success' }
        },
      )
      expect(
        (await approveHcaFunding({ ...input, signal: abort.signal })).isErr(),
      ).toBe(true)
      expect(records.size).toBe(0)
    },
  )

  it('fails closed when reservation storage is unavailable or corrupted', async () => {
    const { input } = makeRun()
    input.environment.storage.getItem = () => '{broken'
    expect((await approveHcaFunding(input)).isErr()).toBe(true)
    expect(input.walletClient.request).not.toHaveBeenCalled()
  })
})

describe('definite refusal and receipt recovery', () => {
  it.each([4001, 4100, 4200, -32601, -32602])(
    'allows explicit retry after definite provider refusal %s',
    async (code) => {
      const { input, records } = makeRun()
      input.walletClient.request.mockRejectedValueOnce({ cause: { code } })
      expect((await approveHcaFunding(input)).isErr()).toBe(true)
      expect(records.size).toBe(0)
      expect((await approveHcaFunding(input)).isOk()).toBe(true)
    },
  )

  it('does not re-estimate an approval when recovering an already broadcast hash', async () => {
    const { input, records } = makeRun()
    input.publicClient.waitForTransactionReceipt.mockRejectedValueOnce(
      new Error('temporarily unavailable'),
    )
    expect((await approveHcaFunding(input)).isErr()).toBe(true)
    input.publicClient.estimateContractGas.mockRejectedValue(
      new Error('wallet now has no ETH'),
    )
    expect((await recoverHcaFundingApproval(input)).isOk()).toBe(true)
    expect(input.walletClient.request).toHaveBeenCalledOnce()
    expect(records.size).toBe(0)
  })

  it('surfaces replacement hash storage failure and retains the original reservation', async () => {
    const { input, records } = makeRun()
    input.publicClient.waitForTransactionReceipt.mockImplementation(
      async ({ onReplaced }) => {
        input.environment.storage.setItem = () => {
          throw new Error('disk full')
        }
        onReplaced({ transaction: { hash: HASH } })
        return { status: 'success' }
      },
    )
    const result = await approveHcaFunding(input)
    expect(result.isErr() && result.error.message).toContain('disk full')
    expect(records.size).toBe(1)
  })
})

it('holds a Promise-only Web Lock boundary while consent is unresolved', async () => {
  const { input } = makeRun()
  const consent = deferred<boolean>()
  input.confirmApproval.mockImplementationOnce(() => consent.promise)
  let isLocked = false
  const environment = {
    ...input.environment,
    locks: {
      request: vi.fn(async (_key, _options, callback) => {
        if (isLocked) return callback(null)
        isLocked = true
        const response = callback({ name: 'test', mode: 'exclusive' })
        // Native Node Web Locks releases bare thenables; only a native Promise holds it.
        if (response instanceof Promise) {
          try {
            return await response
          } finally {
            isLocked = false
          }
        }
        isLocked = false
        return response
      }),
    },
  }
  const first = approveHcaFunding({ ...input, environment })
  await vi.waitFor(() => expect(input.confirmApproval).toHaveBeenCalledOnce())
  const second = await approveHcaFunding({ ...input, environment })
  expect(second.isErr()).toBe(true)
  expect(input.walletClient.request).not.toHaveBeenCalled()
  consent.resolve(true)
  expect((await first).isOk()).toBe(true)
})

import { isDefiniteHcaApprovalRefusal } from './hca-funding-approval'

it.each([
  [{ cause: { code: 4100 } }, true],
  [{ cause: { name: 'ChainMismatchError' } }, true],
  [{ code: -32000, message: 'already known' }, false],
  [{ code: -32603 }, false],
  [new Error('User rejected'), false],
])(
  'classifies structural refusal without treating ambiguity as safe to resend',
  (cause, definite) => {
    expect(isDefiniteHcaApprovalRefusal(cause)).toBe(definite)
  },
)

import {
  reconcileHcaFundingBalances,
  validateHcaFundingWallet,
} from './hca-funding-approval'

it.each([
  [0n, 0n, 4n, 2n, 4n, 2n, true],
  [3n, 1n, 4n, 2n, 1n, 1n, true],
  [5n, 3n, 4n, 2n, 0n, 0n, true],
  [0n, 0n, 3n, 2n, 0n, 0n, false],
  [0n, 0n, 4n, 1n, 0n, 0n, false],
] as const)(
  'reconciles both token balances under the original per-token consent bounds',
  (hcaUsdc, hcaToken, consentedUsdc, consentedToken, usdc, token, allowed) => {
    const result = reconcileHcaFundingBalances({
      requiredUsdc: 3n,
      quotedFeeUsdc: 1n,
      requiredToken: 2n,
      hcaUsdc,
      hcaToken,
      consentedUsdc,
      consentedToken,
    })
    expect(result.isOk()).toBe(allowed)
    expect(result.isOk() ? result.value : null).toEqual(
      allowed ? { usdcShortfall: usdc, tokenShortfall: token } : null,
    )
  },
)

it.each([
  [{}, true],
  [{ connectedAddress: SPENDER }, false],
  [{ connectedAddress: undefined }, false],
  [{ walletChainId: 10 }, false],
  [{ publicChainId: 10 }, false],
])(
  'validates the live provider identity against both expected owner and chain',
  (overrides, allowed) => {
    const result = validateHcaFundingWallet({
      owner: OWNER,
      connectedAddress: OWNER,
      chainId: 1,
      walletChainId: 1,
      publicChainId: 1,
      ...overrides,
    })
    expect(result.isOk()).toBe(allowed)
  },
)
