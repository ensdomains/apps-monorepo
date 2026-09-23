import '@testing-library/jest-dom'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const freshSessionEnable = {
    enableData: 'fresh-enable-data',
    permissionId: '0x1234',
    sessionKey: '0x1111111111111111111111111111111111111111',
    validUntil: 1n,
  }
  const freshSigner = { type: 'rhinestone' as const, id: 'fresh-session' }
  return {
    fetchQuery: vi.fn(),
    freshSessionEnable,
    freshSigner,
    gate: vi.fn(
      (
        onProceed: (session: {
          signer: unknown
          sessionEnable: unknown
        }) => void,
      ) =>
        onProceed({ signer: freshSigner, sessionEnable: freshSessionEnable }),
    ),
    getSessionEnablePayload: vi.fn(async () => ({
      enableData: 'stale-enable-data',
      permissionId: '0x5678',
      sessionKey: '0x2222222222222222222222222222222222222222',
      validUntil: 1n,
    })),
    mutate: vi.fn(),
    refreshBudget: vi.fn(),
    send: vi.fn(),
    useMutation: vi.fn(),
    useQuery: vi.fn(),
  }
})

vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useMutation: mocks.useMutation,
  useQuery: mocks.useQuery,
  useQueryClient: () => ({ fetchQuery: mocks.fetchQuery }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => vi.fn(),
}))

vi.mock('@xstate/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xstate/react')>()),
  useSelector: vi.fn(() => [31_536_000, 'USDC']),
}))

vi.mock('../../../data/queries/hcaBudget.query', () => ({
  getHcaBudgetQueryOptions: vi.fn(() => ({ queryKey: ['hca-budget'] })),
  refreshHcaBudgetQuery: mocks.refreshBudget,
}))

vi.mock('../../../state/registrationUi.context', () => ({
  useRegistrationV2Context: () => ({
    label: 'jeff',
    uiActor: { send: mocks.send },
  }),
}))

vi.mock('@/features/wallet/hooks/useSmartSessionGate', () => ({
  useSmartSessionGate: () => ({ gate: mocks.gate, sessionModal: null }),
}))

vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ({
    accountAddress: '0x1111111111111111111111111111111111111111',
    getSessionEnablePayload: mocks.getSessionEnablePayload,
    isConnected: true,
    isLoadingBalances: false,
    ownerAddress: null,
    signer: { type: 'rhinestone', id: 'stale-session' },
    stablecoinBalances: [
      {
        address: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        symbol: 'USDC',
        decimals: 6,
        balance: '1000000000',
      },
      {
        address: '0xff34b3d4aee8ddcd6f9afffb6fe49bd371b8a357',
        symbol: 'DAI',
        decimals: 18,
        balance: '1000000000000000000000',
      },
    ],
  }),
}))

import { TokenPickerContent } from './TokenPickerContent'

i18n.loadAndActivate({ locale: 'en', messages: {} })

describe('TokenPickerContent registration flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.useQuery
      .mockReturnValueOnce({
        data: {
          basePriceNumber: 9,
          premiumPriceNumber: 1,
          totalPriceNumber: 10,
          rawPrice: 10_000_000n,
        },
        isLoading: false,
      })
      .mockReturnValueOnce({ data: null })
      .mockReturnValueOnce({ data: 0 })
      .mockReturnValueOnce({
        data: undefined,
        isFetching: false,
        isLoading: false,
      })

    mocks.refreshBudget.mockResolvedValue({
      hcaBalance: 1_000_000n,
      total: 11_000_000n,
    })
    mocks.fetchQuery.mockResolvedValue({ isAvailable: true })
    mocks.useMutation.mockImplementation((options) => ({
      error: null,
      isError: false,
      isPending: false,
      mutate: (attempt: unknown, callbacks: { onSettled: () => void }) => {
        mocks.mutate(attempt)
        Promise.resolve(options.mutationFn(attempt))
          .then((result) => options.onSuccess(result, attempt))
          .finally(callbacks.onSettled)
      },
    }))
  })

  it('refreshes funding and confirms availability before dispatching registration', async () => {
    render(
      <I18nProvider i18n={i18n}>
        <TokenPickerContent />
      </I18nProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Select USDC' }))
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'pricing.token.select',
      token: 'USDC',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Register name' }))

    await waitFor(() =>
      expect(mocks.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'registration.start',
          label: 'jeff',
          token: 'USDC',
          totalPrice: 10_000_000n,
          hcaSessionEnable: mocks.freshSessionEnable,
        }),
      ),
    )
    expect(mocks.gate).toHaveBeenCalledOnce()
    expect(mocks.refreshBudget).toHaveBeenCalledOnce()
    const budgetParams = mocks.refreshBudget.mock.calls[0]?.[1]
    expect(budgetParams.signer).toEqual(mocks.freshSigner)
    await expect(budgetParams.getSessionEnablePayload()).resolves.toEqual(
      mocks.freshSessionEnable,
    )
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({ signer: mocks.freshSigner }),
      }),
    )
    expect(mocks.getSessionEnablePayload).not.toHaveBeenCalled()
    expect(mocks.fetchQuery).toHaveBeenCalledOnce()
  })
})
