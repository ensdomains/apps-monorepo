import type {
  HcaFundingApprovalPrompt,
  HcaFundingPrompt,
} from '@ens-apps/transaction-manager'
import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useHcaFundingPrompt } from './useHcaFundingPrompt'

const funding: HcaFundingPrompt = {
  permitValue: 4n,
  requiresPermit: true,
  quotedFeeUsdc: 1n,
  hcaBalanceUsdc: 0n,
  requiredUsdc: 3n,
}
const approval: HcaFundingApprovalPrompt = {
  kind: 'approval',
  chainId: 1,
  owner: '0x3333333333333333333333333333333333333333',
  token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  spender: '0x1111111111111111111111111111111111111111',
  amount: 4n,
  symbol: 'USDC',
  decimals: 6,
  nativeSymbol: 'ETH',
  maxGasCost: 150000n,
}

it('keeps the existing funding consent separate from the approval wallet and receipt states', async () => {
  const { result } = renderHook(() => useHcaFundingPrompt())
  let decision: Promise<boolean> = Promise.resolve(false)
  act(() => {
    decision = result.current.confirmFunding(funding)
  })
  expect(result.current.prompt).toBe(funding)
  expect(result.current.approvalState.kind).toBe('idle')
  act(() => result.current.approve())
  expect(await decision).toBe(true)
  act(() => {
    decision = result.current.confirmApproval(approval)
  })
  expect(result.current.prompt).toBeNull()
  expect(result.current.approvalState.kind).toBe('approval')
  act(() => result.current.approve())
  expect(await decision).toBe(true)
  act(() =>
    result.current.onApprovalState({
      kind: 'approval-wallet',
      prompt: approval,
    }),
  )
  expect(result.current.approvalState.kind).toBe('approval-wallet')
  act(() =>
    result.current.onApprovalState({
      kind: 'approval-receipt',
      prompt: approval,
      hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
    }),
  )
  expect(result.current.approvalState.kind).toBe('approval-receipt')
})

it.each(['funding', 'approval'] as const)(
  'declines unresolved %s consent when its screen unmounts',
  async (kind) => {
    const { result, unmount } = renderHook(() => useHcaFundingPrompt())
    let decision: Promise<boolean> = Promise.resolve(true)
    act(() => {
      decision =
        kind === 'funding'
          ? result.current.confirmFunding(funding)
          : result.current.confirmApproval(approval)
    })
    unmount()
    expect(await decision).toBe(false)
  },
)

import { approveHcaFunding } from '@ens-apps/transaction-manager/helpers/hca-funding-approval'
import { createPublicClient, createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { vi } from 'vitest'

it('keeps a newer mounted funding consent when an aborted approval finishes its fee read', async () => {
  const { result } = renderHook(() => useHcaFundingPrompt())
  let release: (fees: {
    readonly maxFeePerGas: bigint
    readonly maxPriorityFeePerGas: bigint
  }) => void = () => undefined
  const feeRead = new Promise<{
    readonly maxFeePerGas: bigint
    readonly maxPriorityFeePerGas: bigint
  }>((resolve) => {
    release = resolve
  })
  const transport = custom({ request: async () => undefined })
  const client = createPublicClient({ chain: mainnet, transport })
  vi.spyOn(client, 'readContract').mockResolvedValue(0n)
  vi.spyOn(client, 'estimateContractGas').mockResolvedValue(50_000n)
  const estimateFeesPerGas = vi
    .spyOn(client, 'estimateFeesPerGas')
    .mockReturnValue(feeRead)
  const wallet = createWalletClient({ chain: mainnet, transport })
  vi.spyOn(wallet, 'getAddresses').mockResolvedValue([approval.owner])
  vi.spyOn(wallet, 'getChainId').mockResolvedValue(1)
  const request = vi.spyOn(wallet, 'request')
  const cancelled = new AbortController()
  const old = approveHcaFunding({
    publicClient: client,
    walletClient: wallet,
    chainId: 1,
    owner: approval.owner,
    token: approval.token,
    spender: approval.spender,
    amount: approval.amount,
    signal: cancelled.signal,
    confirmApproval: result.current.confirmApproval,
    environment: {
      storage: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      locks: {
        async request<T>(
          name: string,
          options: LockOptions | LockGrantedCallback<T>,
          callback?: LockGrantedCallback<T>,
        ) {
          const granted = typeof options === 'function' ? options : callback
          if (!granted) throw new Error('Missing lock callback')
          return await granted({ name, mode: 'exclusive' })
        },
      },
    },
  })
  await vi.waitFor(() => expect(estimateFeesPerGas).toHaveBeenCalledOnce())
  cancelled.abort()
  const decided = vi.fn()
  let newer: Promise<boolean> = Promise.resolve(false)
  act(() => {
    newer = result.current.confirmFunding(funding)
    void newer.then(decided)
  })
  await act(async () => {
    release({ maxFeePerGas: 3n, maxPriorityFeePerGas: 1n })
    for (let index = 0; index < 30; index += 1) await Promise.resolve()
  })
  try {
    expect(result.current.prompt).toBe(funding)
    expect(decided).not.toHaveBeenCalled()
    expect(request).not.toHaveBeenCalled()
  } finally {
    act(() => result.current.decline())
    await old
    await newer
  }
})
