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
