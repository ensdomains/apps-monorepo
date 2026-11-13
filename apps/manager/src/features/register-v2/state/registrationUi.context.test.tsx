import '@testing-library/jest-dom'
import type { HcaBudgetBreakdown } from '@ens-apps/smart-account'
import type { RhinestoneSigner } from '@ens-apps/transaction-manager'
import type { PermitSignature } from '@ens-apps/transaction-manager/machines/registration/registration.actors'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { MutationObserver, QueryClient } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createWalletClient, custom } from 'viem'
import { mainnet } from 'viem/chains'
import { afterEach, expect, it, vi } from 'vitest'
import { createConfig, WagmiProvider } from 'wagmi'
import { fromPromise } from 'xstate'
import type { SmartAccountContextValue } from '@/lib/smart-account/SmartAccountContext'
import {
  RegistrationV2UiProvider,
  useRegistrationV2Context,
} from './registrationUi.context'

const OWNER = '0x2222222222222222222222222222222222222222' as const
const HCA = '0x1111111111111111111111111111111111111111' as const
const approvalDecided = vi.hoisted(() => vi.fn())

vi.mock('@ens-apps/transaction-manager', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@ens-apps/transaction-manager')>()
  return {
    ...original,
    registrationMachine: original.registrationMachine.provide({
      actors: {
        estimateHcaBudget: fromPromise(
          async (): Promise<HcaBudgetBreakdown> => ({
            total: 15_000_000n,
            expectedMaximum: 30_000_000n,
            source: 'quote',
            commitCost: 4_000_000n,
            registerCost: 6_000_000n,
            registrationPrice: 5_000_000n,
          }),
        ),
        readHcaUsdcBalance: fromPromise(async () => 0n),
        signFundingPermit: fromPromise(
          async (): Promise<PermitSignature> => ({
            owner: OWNER,
            spender: HCA,
            value: 15_000_000n,
            deadline: 1_900_000_000n,
            v: 27,
            r: `0x${'11'.repeat(32)}` as const,
            s: `0x${'22'.repeat(32)}` as const,
          }),
        ),
        // The funding decision is tested in the package. This test owns the
        // provider → UI machine → registration machine → real dialog wiring.
        submitFundingAndCommit: fromPromise(async ({ input }) => {
          const approved = await input.approvalFallback?.confirmApproval({
            kind: 'approval',
            chainId: 1,
            owner: OWNER,
            spender: HCA,
            token: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            amount: 15_000_000n,
            symbol: 'USDC',
            decimals: 6,
            nativeSymbol: 'ETH',
            maxGasCost: 100_000_000_000_000n,
          })
          approvalDecided(approved)
          return new Promise<never>(() => {})
        }),
      },
    }),
  }
})
vi.mock('./useRegistrationResume', () => ({
  useRegistrationResume: () => ({ status: 'idle' }),
}))
vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn(),
}))

const transport = custom({ request: async () => undefined })
const walletClient = createWalletClient({
  account: OWNER,
  chain: mainnet,
  transport,
})
const config = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: transport },
  storage: null,
})

const unused = (): never => {
  throw new Error('Unused account capability')
}
const mutation = new MutationObserver<
  { txHash: null },
  Error,
  `0x${string}`,
  unknown
>(new QueryClient(), {
  mutationFn: async () => ({ txHash: null }),
})
const account: SmartAccountContextValue = {
  type: 'rhinestone',
  signer: { type: 'rhinestone' } as RhinestoneSigner,
  accountAddress: HCA,
  ownerAddress: OWNER,
  walletClient,
  hasInitialized: true,
  isReady: true,
  infrastructure: 'warp',
  hasActiveSession: true,
  isEnablingSession: false,
  sessionError: null,
  enableSession: unused,
  reauthorizeSession: unused,
  isRevokingSession: false,
  revokeError: null,
  revokeSession: unused,
  isSessionAccessReset: false,
  revokeErrorReason: null,
  forgetLocalSession: unused,
  activeStoredSession: null,
  getSessionEnablePayload: async () => undefined,
  refreshAccount: async () => {},
  isLoading: false,
  error: null,
  isConnected: true,
  walletSource: 'external-wallet',
  stablecoinBalances: [],
  isLoadingBalances: false,
  autoFundingMutation: {
    ...mutation.getCurrentResult(),
    mutateAsync: mutation.mutate,
  },
  client: null,
  config: null,
  isAccountReady: true,
}

const StartRegistration = () => {
  const { uiActor } = useRegistrationV2Context()
  return (
    <button
      onClick={() => {
        uiActor.send({ type: 'pricing.step.next' })
        uiActor.send({
          type: 'registration.start',
          label: 'example',
          duration: 31_536_000n,
          token: 'USDC',
          totalPrice: 5_000_000n,
          basePriceNumber: 5,
          premiumPriceNumber: 0,
          account,
        })
      }}
      type="button"
    >
      Register
    </button>
  )
}

afterEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

it('asks for registration-specific USDC approval through the provider and both machines', async () => {
  i18n.loadAndActivate({ locale: 'en', messages: {} })
  render(
    <I18nProvider i18n={i18n}>
      <WagmiProvider config={config} reconnectOnMount={false}>
        <RegistrationV2UiProvider label="example">
          <StartRegistration />
        </RegistrationV2UiProvider>
      </WagmiProvider>
    </I18nProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Register' }))
  expect(
    await screen.findByRole('alertdialog', {
      name: 'Approve USDC for your registration?',
    }),
  ).toBeVisible()
  expect(screen.getByText('15 USDC')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => expect(approvalDecided).toHaveBeenCalledWith(false))
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})
