import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ useL2PaymentRows: vi.fn() }))

vi.mock('@/features/register-v2/workflow/pricing/hooks/useL2Payment', () => ({
  useL2PaymentRows: mocks.useL2PaymentRows,
}))
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    signer: undefined,
    ownerAddress: undefined,
  }),
}))

import { useRenewalL2Payment } from './useRenewalL2Payment'

describe('useRenewalL2Payment', () => {
  it('leaves a method nobody picked to the fallback, as registration does', () => {
    renderHook(() =>
      useRenewalL2Payment({
        rentTotalRaw: 1_100_000n,
        feeRaw: 900_000n,
        hcaBalanceRaw: 0n,
        isEnabled: true,
        selectedChainId: undefined,
        selectedOrigin: undefined,
        onSelect: () => {},
      }),
    )

    expect(mocks.useL2PaymentRows).toHaveBeenCalledWith(
      expect.objectContaining({ selectedOrigin: undefined }),
    )
  })
})
