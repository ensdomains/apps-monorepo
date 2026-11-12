import { TransactionManagerProvider } from '@ens-apps/transaction-manager'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import type { Address } from 'viem'
import { describe, expect, it } from 'vitest'
import { usePublicClient } from 'wagmi'
import {
  getV1NameStateQueryOptions,
  type V1NameState,
} from '@/features/transfer/v1/getV1NameState'
import { createTestQueryClient, createTestWrapper } from '@/test-utils'
import { ManagerActions } from './ManagerActions'

const REGISTRANT: Address = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'
const MANAGER: Address = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
const RECIPIENT: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906'

/** Mirrors `__root.tsx`: the flows read the transaction manager's context. */
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

const renderActions = () => {
  const queryClient = createTestQueryClient()
  const { queryKey } = getV1NameStateQueryOptions({ name: 'alice.eth' })
  queryClient.setQueryDefaults(queryKey, {
    staleTime: Number.POSITIVE_INFINITY,
  })
  const state: V1NameState = {
    subject: {
      kind: 'v1-registrar',
      registrant: REGISTRANT,
      controller: MANAGER,
    },
    registration: 'active',
    resolverAddress: null,
    parent: null,
    ancestorRegistration: null,
  }
  queryClient.setQueryData(queryKey, state)
  const TestProviders = createTestWrapper(queryClient)
  return render(
    <ManagerActions
      name="alice.eth"
      protocolVersion="ENSv1"
      account={REGISTRANT}
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

describe('ManagerActions', () => {
  it('opens one modal when a reclaim starts after a dismissed change', async () => {
    const user = userEvent.setup()
    renderActions()

    await user.click(
      await screen.findByRole('button', { name: 'Change manager' }),
    )
    await user.type(screen.getByLabelText('New manager'), RECIPIENT)
    await user.click(
      await screen.findByRole('button', {
        name: 'Change manager',
        hidden: false,
      }),
    )
    await screen.findByRole('dialog', { name: 'Transaction overview' })
    await user.click(screen.getByRole('button', { name: 'Close' }))

    await user.click(screen.getByRole('button', { name: /Reclaim manager/ }))

    // `hidden`: a second Radix modal marks the first aria-hidden.
    await waitFor(() =>
      expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1),
    )
    expect(screen.getByRole('dialog')).toHaveTextContent('Reclaim manager role')
  })
})
