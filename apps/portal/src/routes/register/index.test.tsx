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
const deploy = vi.hoisted(() => ({ finish: () => {} }))
const waitForResolverDeployment = vi.hoisted(() => vi.fn())
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
        resolveResolverDeployment: fromPromise(() => {
          waitForResolverDeployment()
          return new Promise(() => {})
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
  useReadContract: () => ({ data: undefined }),
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
})
