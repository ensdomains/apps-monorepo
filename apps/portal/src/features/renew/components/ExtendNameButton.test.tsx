import {
  TransactionManagerProvider,
  transactionManager,
} from '@ens-apps/transaction-manager'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePublicClient } from 'wagmi'
import { chain } from '@/config'
import { paletteHandoff } from '@/features/command-palette/handoff'
import * as renewalTransactions from '@/features/renew/hooks/useRenewalTransactions'
import * as activeTransactions from '@/features/transaction-manager/hooks/useActiveTransactionState'
import { createTestWrapper } from '@/test-utils'
import type { ProtocolVersion } from '@/utils/types'
import { ExtendNameButton } from './ExtendNameButton'

// The renewal flow reads its referrer from the URL; there is no router here.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useSearch: () => ({}),
}))

// Whether a name can be renewed is decided by on-chain reads; here it can.
vi.mock('@/features/renew/hooks/useCanExtend', () => ({
  useCanExtend: ({
    name,
    protocolVersion,
  }: {
    readonly name: string
    readonly protocolVersion: ProtocolVersion
  }) => ({
    canExtend: true,
    selectedName: { name, isV2: protocolVersion === 'ENSv2' },
    expiryDate: undefined,
    isLoading: false,
  }),
}))

// The dialog prices the renewal when it opens; these tests stop at the button.
vi.mock('@/features/renew/components/ExtendNameModal', () => ({
  ExtendNameModal: () => null,
}))

/** Mirrors `__root.tsx`: the renewal flow reads the transaction manager's context. */
const TransactionManagerScope = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const publicClient = usePublicClient()
  if (!publicClient) return <>{children}</>
  return (
    <TransactionManagerProvider publicClient={publicClient}>
      {children}
    </TransactionManagerProvider>
  )
}

const renderButton = (protocolVersion: ProtocolVersion) => {
  const TestProviders = createTestWrapper()
  return render(
    <ExtendNameButton
      name="cosmic-fox.eth"
      protocolVersion={protocolVersion}
    />,
    {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <TestProviders>
          <TransactionManagerScope>{children}</TransactionManagerScope>
        </TestProviders>
      ),
    },
  )
}

describe('ExtendNameButton', () => {
  it('rejects a palette renewal while another operation is in flight without changing that operation', async () => {
    const openModal = vi.fn()
    const startFlow = vi.fn()
    const original = renewalTransactions.useRenewalTransactions
    vi.spyOn(renewalTransactions, 'useRenewalTransactions').mockImplementation(
      (options) => ({
        ...original(options),
        openModal,
        startFlow,
      }),
    )
    vi.spyOn(activeTransactions, 'useActiveTransactionState').mockReturnValue({
      txId: 'alice-active',
      machineState: 'pending',
      hash: undefined,
      error: undefined,
    })
    const cancelTransaction = vi.spyOn(transactionManager, 'cancelTransaction')
    const requestId = paletteHandoff.prepare({
      kind: 'renew',
      name: 'cosmic-fox.eth',
      chainId: chain.id,
    })
    try {
      renderButton('ENSv2')
      await waitFor(() =>
        expect(paletteHandoff.getSnapshot().outcome?.status).toBe('blocked'),
      )
      expect(paletteHandoff.getSnapshot().outcome).toEqual({
        requestId,
        status: 'blocked',
        reason:
          'Another operation is already in progress. Open its original page to view progress, then try renewing cosmic-fox.eth again.',
      })
      expect(openModal).not.toHaveBeenCalled()
      expect(startFlow).not.toHaveBeenCalled()
      expect(cancelTransaction).not.toHaveBeenCalled()
    } finally {
      paletteHandoff.cancel()
      vi.restoreAllMocks()
    }
  })
  // WEB-1546: V1 names use the manager app's word for this action.
  it.each([
    { protocolVersion: 'ENSv1', label: 'Renew' },
    { protocolVersion: 'ENSv2', label: 'Extend' },
  ] as const)(
    'reads $label for an $protocolVersion name',
    async ({ protocolVersion, label }) => {
      renderButton(protocolVersion)

      // wagmi settles its connection state after mount; findBy waits for it.
      expect(await screen.findByRole('button')).toHaveAccessibleName(label)
    },
  )
})
