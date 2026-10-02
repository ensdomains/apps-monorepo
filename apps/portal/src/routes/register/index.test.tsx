import { act, render } from '@testing-library/react'
import type { Address } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { fromPromise } from 'xstate'
import type { useRegistrationTransactions } from '@/features/register/hooks/useRegistrationTransactions'
import { SUPPORTED_TOKENS } from '@/lib/constants/tokens'

const ACCOUNT: Address = '0x1111111111111111111111111111111111111111'

const search: { name?: string } = {}
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => search,
  }),
}))

// The EOA flow's first on-chain step resolves only when the test says so, and
// the step after it is a spy: a flow that is really stopped never reaches it.
// A test that needs the flow to go on past it resolves the spy once; the later
// steps then succeed until register, which the wallet rejects.
const deploy = vi.hoisted(() => ({ finish: () => {} }))
const waitForResolverDeployment = vi.hoisted(() =>
  vi.fn(() => new Promise(() => {})),
)
vi.mock('@ens-apps/transaction-manager', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ens-apps/transaction-manager')>()
  return {
    ...actual,
    registrationMachine: actual.registrationMachine.provide({
      actors: {
        deployResolver: fromPromise(
          () =>
            new Promise((resolve) => {
              deploy.finish = () => resolve({ txId: 'deploy', salt: 0n })
            }),
        ) as never,
        resolveResolverDeployment: fromPromise(() =>
          waitForResolverDeployment(),
        ) as never,
        generateCommitment: fromPromise(async () => ({
          commitment: '0x01',
          secret: '0x02',
        })) as never,
        submitCommitment: fromPromise(
          async () => actual.REGISTRATION_TX_IDS.commit,
        ) as never,
        pollTransactionStatus: fromPromise(async () => {}) as never,
        readMinCommitmentAge: fromPromise(async () => 0n) as never,
        readPaymentAuthorization: fromPromise(async () => ({
          allowance: 0n,
          livePrice: 1n,
        })) as never,
        submitApproval: fromPromise(
          async () => actual.REGISTRATION_TX_IDS.approve,
        ) as never,
        waitAfterCommitment: fromPromise(async () => {}) as never,
        submitRegistration: fromPromise(async () => {
          throw new Error('User rejected')
        }) as never,
      },
    }),
  }
})

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useConfig: () => ({}),
  useConnection: () => ({ address: ACCOUNT }),
  usePublicClient: () => ({}),
  // The flow re-reads the allowance on start instead of trusting the cache.
  useReadContract: () => ({
    data: undefined,
    refetch: async () => ({ data: undefined }),
  }),
}))

vi.mock('@wagmi/core/actions', () => ({
  getWalletClient: async () => ({ account: { address: ACCOUNT } }),
}))

vi.mock('@/features/registry/utils/signer.helpers', () => ({
  createEOASigner: () => ({ type: 'eoa' }),
}))

vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: async () => {},
}))

vi.mock('@/features/transaction-manager/hooks/useTransactionModal', () => ({
  useTransactionModal: () => ({
    closeModal: () => {},
    clearTransaction: () => {},
  }),
}))

vi.mock('@/components/RegisterSidebar', () => ({ RegisterSidebar: () => null }))
vi.mock('@/components/MobileHeader', () => ({ MobileHeader: () => null }))
vi.mock('@/components/SepoliaNoticeBanner', () => ({
  SepoliaNoticeBanner: () => null,
}))
vi.mock('@/components/ui/sidebar', () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
  SidebarInset: ({ children }: { children: React.ReactNode }) => children,
}))

// Only the registration flow matters here, so `RegisterName` is reduced to the
// hook that owns it; the latest render's flow is exposed to the test.
let flow: ReturnType<typeof useRegistrationTransactions>
vi.mock('@/features/register/components', async () => {
  const { useRegistrationTransactions } = await import(
    '@/features/register/hooks/useRegistrationTransactions'
  )
  return {
    RegisterName: ({ name }: { name: string }) => {
      flow = useRegistrationTransactions({ name, duration: 31_536_000 })
      return null
    },
  }
})

// `createFileRoute` is mocked to hand back the options object, so `Route` is
// really `{ component, useSearch, ... }`, hence the cast.
const { Route } = await import('./index')
const { REGISTRATION_TX_IDS, transactionManager } = await import(
  '@ens-apps/transaction-manager'
)
const RegisterRoute = (Route as unknown as { component: () => React.ReactNode })
  .component

describe('/register', () => {
  it('stops the flow for the old name when ?name= changes', async () => {
    search.name = 'expensive.eth'
    const { rerender } = render(<RegisterRoute />)

    act(() => flow.startFlow(SUPPORTED_TOKENS.USDC, 160_000_000n))
    await act(() => flow.transactions[0].onStart?.())
    const expensive = flow.actor
    expect(expensive.getSnapshot().context.name).toBe('expensive.eth')
    expect(expensive.getSnapshot().value).toBe('deployingResolver')

    search.name = 'cheap.eth'
    rerender(<RegisterRoute />)

    expect(flow.actor).not.toBe(expensive)
    expect(flow.actor.getSnapshot().value).toBe('idle')

    // A flow left running for the old name would go on to register and pay
    // for it while the page shows the new one.
    await act(async () => deploy.finish())
    expect(waitForResolverDeployment).not.toHaveBeenCalled()
  })

  it("stops the old name's transactions, which outlive the registration actor", async () => {
    search.name = 'expensive.eth'
    const { rerender } = render(<RegisterRoute />)

    act(() => flow.startFlow(SUPPORTED_TOKENS.USDC, 160_000_000n))
    await act(() => flow.transactions[0].onStart?.())
    const cancel = vi.spyOn(transactionManager, 'cancelTransaction')
    const clear = vi.spyOn(transactionManager, 'clear')

    rerender(<RegisterRoute />)
    expect(cancel).not.toHaveBeenCalled()

    search.name = 'cheap.eth'
    rerender(<RegisterRoute />)
    // Only this flow's transactions: others in the shared manager survive.
    expect(cancel.mock.calls.map(([id]) => id).sort()).toEqual(
      Object.values(REGISTRATION_TX_IDS).sort(),
    )
    expect(clear).not.toHaveBeenCalled()

    cancel.mockRestore()
    clear.mockRestore()
  })

  it('keeps completed steps when retrying a rejected register', async () => {
    search.name = 'retry.eth'
    waitForResolverDeployment.mockResolvedValueOnce({
      resolverAddress: ACCOUNT,
    })
    render(<RegisterRoute />)

    act(() => flow.startFlow(SUPPORTED_TOKENS.USDC, 160_000_000n))
    await act(() => flow.transactions[0].onStart?.())
    await act(async () => deploy.finish())
    await vi.waitFor(() =>
      expect(flow.actor.getSnapshot().context.retryTarget).toBe(
        'registeringDomain',
      ),
    )

    // The steps before register landed; the wallet rejected register itself.
    const attempt = (error?: Error) =>
      ({ getSnapshot: () => ({ context: { error } }) }) as never
    const attempts: Record<string, never> = {
      [REGISTRATION_TX_IDS.deployResolver]: attempt(),
      [REGISTRATION_TX_IDS.commit]: attempt(),
      [REGISTRATION_TX_IDS.approve]: attempt(),
      [REGISTRATION_TX_IDS.register]: attempt(new Error('User rejected')),
    }
    const get = vi
      .spyOn(transactionManager, 'getTransaction')
      .mockImplementation((id) => attempts[id])
    const cancel = vi.spyOn(transactionManager, 'cancelTransaction')
    const clear = vi.spyOn(transactionManager, 'clear')

    // "Try again" on the register step.
    act(() => flow.transactions.at(-1)?.onStart?.())

    // The overview reads each step's status from the manager, so the steps
    // that landed must stay there; only the rejected attempt is retired.
    expect(cancel.mock.calls).toEqual([[REGISTRATION_TX_IDS.register]])
    expect(clear).not.toHaveBeenCalled()

    get.mockRestore()
    cancel.mockRestore()
    clear.mockRestore()
  })
})
