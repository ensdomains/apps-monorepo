import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ok } from 'neverthrow'
import { createElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getTokenPrices } from '../../services/nameChainContractService'
import { usePricing } from './usePricing'

const mockOpenModal = vi.fn()
const mockOnSetDuration = vi.fn()
const mockOnConfirmPayment = vi.fn()
const mockOnSelectPayment = vi.fn()
const mockOnSelectCrypto = vi.fn()

vi.mock('@getpara/react-sdk-lite', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}))

vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({ client: null }),
}))

vi.mock('@/hooks/useFeatureFlag', () => ({
  useFeatureFlag: () => false,
}))

vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: number | null) => ({ debouncedValue: value }),
}))

vi.mock('../../services/nameChainContractService', () => ({
  getTokenPrices: vi.fn(),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children)
}

describe('usePricing', () => {
  const defaultProps = {
    domainName: 'test.eth',
    duration: 1,
    onSetDuration: mockOnSetDuration,
    onSelectPayment: mockOnSelectPayment,
    onSelectCrypto: mockOnSelectCrypto,
    onConfirmPayment: mockOnConfirmPayment,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTokenPrices).mockResolvedValue(
      ok({
        usdc: { formatted: '100' },
        dai: { formatted: '100' },
      }),
    )
  })

  it('returns initial state and handlers', () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    expect(result.current.selectedDuration).toBe(1)
    expect(result.current.durationInputValue).toBeDefined()
    expect(result.current.handleChange).toBeDefined()
    expect(result.current.handleConfirmPayment).toBeDefined()
    expect(result.current.handleConnect).toBeDefined()
    expect(result.current.setDurationInputValue).toBeDefined()
    expect(result.current.onSelectPayment).toBe(mockOnSelectPayment)
    expect(result.current.onSelectCrypto).toBe(mockOnSelectCrypto)
  })

  it('exposes isUsingAA as false when smart account client is null', () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })
    expect(result.current.isUsingAA).toBe(false)
  })

  it('calls onSetDuration when handleChange is called with a number', () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.handleChange(5)
    })

    expect(mockOnSetDuration).toHaveBeenCalledWith(5)
    expect(result.current.selectedDuration).toBe(5)
  })

  it('dispatches SET_DATE when handleChange is called with undefined', () => {
    const { result } = renderHook(
      () => usePricing({ ...defaultProps, duration: 3 }),
      {
        wrapper: createWrapper(),
      },
    )

    act(() => {
      result.current.handleChange(undefined)
    })

    expect(result.current.selectedDuration).toBe(3)
  })

  it('calls onSetDuration with calculated duration when handleChange is called with a Date', () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })
    const futureDate = new Date()
    futureDate.setFullYear(futureDate.getFullYear() + 2)

    act(() => {
      result.current.handleChange(futureDate)
    })

    expect(mockOnSetDuration).toHaveBeenCalled()
    const callArg = mockOnSetDuration.mock.calls[0]?.[0]
    expect(callArg).toBeDefined()
    expect(typeof callArg).toBe('number')
    expect(callArg as number).toBeGreaterThan(0)
  })

  it('calls onConfirmPayment when handleConfirmPayment is invoked', () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    act(() => {
      result.current.handleConfirmPayment(1000n, 'USDC', { fast: true })
    })

    expect(mockOnConfirmPayment).toHaveBeenCalledWith(1000n, 'USDC', {
      fast: true,
    })
  })

  it('calls openModal when handleConnect is invoked', async () => {
    mockOpenModal.mockResolvedValue(undefined)
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handleConnect()
    })

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })

  it('catches and logs error when handleConnect openModal rejects', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOpenModal.mockRejectedValue(new Error('Modal failed'))
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    await act(async () => {
      await result.current.handleConnect()
    })

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to open Para modal:',
      expect.any(Error),
    )
    consoleSpy.mockRestore()
  })

  it('provides pricing data when base price query succeeds', async () => {
    const { result } = renderHook(() => usePricing(defaultProps), {
      wrapper: createWrapper(),
    })

    await waitFor(
      () => {
        expect(result.current.isPricingLoading).toBe(false)
      },
      { timeout: 2000 },
    )

    expect(result.current.pricingOptions).toBeDefined()
    expect(result.current.finalPrice).toBeDefined()
  })

  it('uses initial duration from props', () => {
    const { result } = renderHook(
      () => usePricing({ ...defaultProps, duration: 5 }),
      { wrapper: createWrapper() },
    )
    expect(result.current.selectedDuration).toBe(5)
  })
})
