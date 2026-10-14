/**
 * A registration that failed, met again after a reload.
 *
 * Runs the pieces that decide it together: the stored record, the resume
 * preflight, `useRegistrationResume`, the UI machine and its real
 * registration child, and the Try Again button on `FailureStep`. Each has unit
 * tests against fakes of the others; this is where the button, the hook and
 * the machine have to agree about a restored failure. Only the chain, the
 * price quote and the wallet are stubbed.
 */

import '@testing-library/jest-dom'
import {
  buildRegistrationRecord,
  type PersistedRegistrationRecord,
} from '@ens-apps/transaction-manager'
import { i18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Address, Hash, Hex, PublicClient } from 'viem'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const OWNER = '0x2222222222222222222222222222222222222222' as Address
const RESOLVER = '0x9999999999999999999999999999999999999999' as Address
const COMMITMENT = `0x${'ab'.repeat(32)}` as Hash
const SECRET = `0x${'cd'.repeat(32)}` as Hex

/**
 * The chain, as both the preflight and the resumed run read it: the commitment
 * is recorded and well inside its reveal window. Anything else the run reads
 * never answers, so it parks once it has taken the run back.
 */
const chain = vi.hoisted(() => ({
  publicClient: {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'commitmentAt') return 1_800_000_000n - 600n
      if (functionName === 'MIN_COMMITMENT_AGE') return 60n
      if (functionName === 'MAX_COMMITMENT_AGE') return 86_400n
      return new Promise(() => {})
    },
    getBlock: async () => ({ timestamp: 1_800_000_000n }),
    request: () => new Promise(() => {}),
  },
}))

vi.mock('@/lib/wagmi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/wagmi')>()
  return {
    ...actual,
    // The app's chain, contracts included: the run looks its registrar up
    // there.
    publicClient: { ...chain.publicClient, chain: actual.publicClient.chain },
  }
})

vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useChainId: () => 11155111,
  useConnection: () => ({ isDisconnected: false }),
}))

const walletClient = { account: { address: OWNER } }
const ownerAccount = {
  hasInitialized: true,
  ownerAddress: OWNER,
  accountAddress: OWNER,
  signer: { type: 'eoa', walletClient },
  walletClient,
  enableSession: async () => null,
  getSessionEnablePayload: async () => undefined,
}
vi.mock('@/lib/smart-account/SmartAccountContext', () => ({
  useSmartAccountContext: () => ownerAccount,
}))
vi.mock('@/lib/smart-account/sessionGate', () => ({
  needsSessionBeforeRegistration: () => false,
}))
vi.mock('@/utils/blockExplorer/verifyProxyContract', () => ({
  verifyProxyContract: vi.fn(),
}))
vi.mock('../data/queries/pricing.query', async (importOriginal) => {
  const { ok } = await import('neverthrow')
  return {
    ...(await importOriginal<typeof import('../data/queries/pricing.query')>()),
    getRegisterPrice: async () => ok({ basePrice: 5_000_000n, premium: 0n }),
  }
})

import {
  acquireRegistrationLock,
  releaseRegistrationLock,
} from '../service/registrationLock'
import {
  createRegistrationPersistenceAdapter,
  loadStoredRegistration,
} from '../service/registrationPersistence'
import { FailureStep } from '../workflow/result/FailureStep'
import {
  RegistrationV2UiProvider,
  useRegistrationV2Context,
} from './registrationUi.context'
import { getRegistrationV2ChildActor } from './registrationUi.machine'
import { useRegistrationStep } from './registrationUi.selectors'

i18n.loadAndActivate({ locale: 'en', messages: {} })

let uiActor: ReturnType<typeof useRegistrationV2Context>['uiActor'] | null =
  null

/** The registration page, cut down to the step it is on. */
const Page = () => {
  const context = useRegistrationV2Context()
  uiActor = context.uiActor
  const step = useRegistrationStep(context.uiActor)
  return step === 'failure' ? <FailureStep /> : <output>{step}</output>
}

const renderPage = () =>
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <RegistrationV2UiProvider label="leon">
          <Page />
        </RegistrationV2UiProvider>
      </QueryClientProvider>
    </I18nProvider>,
  )

/**
 * What a run that failed after its commit landed leaves behind. With
 * `registerSent`, its register went out before it failed: it may have landed,
 * or still be filling.
 */
const storeFailedRun = ({ registerSent }: { registerSent: boolean }) => {
  const record: PersistedRegistrationRecord = buildRegistrationRecord(
    'error',
    {
      chainId: 11155111,
      name: 'leon.eth',
      duration: 31_536_000n,
      selectedToken: 'USDC',
      tokenPrice: 5_000_000n,
      signer: { type: 'eoa', walletClient } as never,
      accountAddress: OWNER,
      ownerAddress: OWNER,
      resolverAddress: RESOLVER,
      commitment: { commitment: COMMITMENT, secret: SECRET },
      commitmentTxId: 'tx-reg-commit',
      ...(registerSent ? { registrationTxId: 'tx-reg-register' } : {}),
      publicClient: {} as PublicClient,
    },
    Date.now(),
  )
  createRegistrationPersistenceAdapter({
    label: 'leon',
    getAppState: () => ({
      confirmedData: {
        label: 'leon',
        duration: 31_536_000n,
        ownerAddress: OWNER,
        token: 'USDC',
        totalPrice: 5_000_000n,
        basePriceNumber: 5,
        premiumPriceNumber: 0,
      },
    }),
  }).save(record)
}

/** Run as a second tab: same storage, its own holder id. */
const asAnotherTab = <T,>(run: () => T): T => {
  const held = sessionStorage.getItem('ens-registration-holder')
  sessionStorage.setItem('ens-registration-holder', 'other-tab')
  try {
    return run()
  } finally {
    if (held) sessionStorage.setItem('ens-registration-holder', held)
    else sessionStorage.removeItem('ens-registration-holder')
  }
}

const childState = () => {
  if (!uiActor) throw new Error('page not rendered')
  return getRegistrationV2ChildActor(uiActor.getSnapshot())?.getSnapshot().value
}

const tryAgain = () =>
  act(() => {
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }))
  })

describe('a failed registration, after a reload', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    uiActor = null
  })

  it('comes back on the failure screen, and Try Again continues it once the wallet is free', async () => {
    storeFailedRun({ registerSent: false })
    const page = renderPage()

    // Back on the failure screen, with nothing re-run: the child never
    // received the run, so no wallet prompt and no replayed verification.
    expect(await screen.findByText('Registration Failed')).toBeVisible()
    expect(childState()).toBe('idle')

    // Another tab holds the wallet: the resume is turned down, and the screen
    // says so without losing the restored run.
    asAnotherTab(() => acquireRegistrationLock(OWNER, 'other.eth'))
    await tryAgain()

    expect(
      await screen.findByText('Another Registration Is Running'),
    ).toBeVisible()
    expect(childState()).toBe('idle')
    expect(loadStoredRegistration()?.record.stage).toBe('error')

    // Once the wallet is free, the same button goes back through the resume
    // and the run picks up from its commitment: validated on-chain first, and
    // no new commit.
    asAnotherTab(() => releaseRegistrationLock(OWNER))
    await tryAgain()

    await waitFor(() => expect(childState()).toBe('validatingCommitment'))
    expect(screen.getByRole('status')).toHaveTextContent('registering')
    const stored = loadStoredRegistration()
    expect(stored?.record.stage).toBe('validatingCommitment')
    expect(stored?.record.context.commitment).toEqual({
      commitment: COMMITMENT,
      secret: SECRET,
    })

    page.unmount()
  })

  it('checks a register that already went out before revealing again', async () => {
    // It may have landed, consuming the commitment, or still be filling.
    // Revalidating the commitment would fail a name the user may now own.
    storeFailedRun({ registerSent: true })
    const page = renderPage()
    expect(await screen.findByText('Registration Failed')).toBeVisible()

    await tryAgain()

    await waitFor(() => expect(childState()).toBe('verifyingRegistration'))
    expect(screen.getByRole('status')).toHaveTextContent('registering')

    page.unmount()
  })

  it('discards the stored run on Back to Quote', async () => {
    storeFailedRun({ registerSent: false })
    const page = renderPage()
    expect(await screen.findByText('Registration Failed')).toBeVisible()

    await act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Back to Quote' }))
    })

    expect(screen.getByRole('status')).toHaveTextContent('pricing')
    expect(loadStoredRegistration()).toBeNull()

    page.unmount()
  })
})
