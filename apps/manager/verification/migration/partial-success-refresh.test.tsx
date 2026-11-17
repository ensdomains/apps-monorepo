import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invalidateMigrationQueries: vi.fn(),
  recordRecentlyMigratedNames: vi.fn(),
  recordVerifiedNftMigration: vi.fn(),
  send: vi.fn(),
}))

vi.mock('@ens-apps/transaction-manager', () => ({
  useAtomicBatchSupport: () => true,
}))
vi.mock('@ens-apps/utils/gasAffordability', () => ({
  assessGasAffordability: () => ({ status: 'ready' }),
}))
vi.mock('@lingui/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lingui/react')>()),
  Plural: () => null,
  Trans: () => null,
  useLingui: () => ({ _: (message: string) => message }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@tanstack/react-router', () => ({
  useCanGoBack: () => false,
  useNavigate: () => vi.fn(),
}))
vi.mock('@xstate/react', () => ({
  useSelector: (_actor: unknown, selector: (snapshot: unknown) => unknown) =>
    selector({
      can: () => false,
      context: {
        plan: {
          migrationOwner: '0x0000000000000000000000000000000000000001',
          hcaAddress: '0x0000000000000000000000000000000000000002',
          classified: [],
        },
        renewal: undefined,
        renewedDomains: undefined,
        renewalDiscardConfirmation: undefined,
      },
    }),
}))
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children }: { readonly children?: ReactNode }) => (
      <div>{children}</div>
    ),
  },
}))
vi.mock('wagmi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi')>()),
  useBalance: () => ({ data: undefined }),
  useConnection: () => ({ connector: undefined }),
}))
vi.mock('@/components/ui/alert-dialog', () => ({
  Root: ({ children }: { readonly children?: ReactNode }) => children,
  Content: ({ children }: { readonly children?: ReactNode }) => children,
  Header: ({ children }: { readonly children?: ReactNode }) => children,
  Title: ({ children }: { readonly children?: ReactNode }) => children,
  Description: ({ children }: { readonly children?: ReactNode }) => children,
  Footer: ({ children }: { readonly children?: ReactNode }) => children,
  Cancel: ({ children }: { readonly children?: ReactNode }) => children,
  Action: ({ children }: { readonly children?: ReactNode }) => children,
}))
vi.mock('@/features/migration/commemorative-nft/verifiedMigration', () => ({
  recordVerifiedNftMigration: mocks.recordVerifiedNftMigration,
}))
vi.mock('@/features/migration/components/GameStep', () => ({
  GameStep: () => null,
}))
vi.mock('@/features/migration/components/GrainOverlay', () => ({
  GrainOverlay: () => null,
}))
vi.mock('@/features/migration/components/MigrationPrimaryButton', () => ({
  MigrationPrimaryButton: ({ children }: { readonly children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
}))
vi.mock('@/features/migration/components/MigrationSuccessDialog', () => ({
  MigrationSuccessDialog: () => null,
}))
vi.mock('@/features/migration/components/SelectNamesStep', () => ({
  SelectNamesStep: () => null,
}))
vi.mock('@/features/migration/components/SubnameMigrationDialog', () => ({
  SubnameMigrationDialog: () => null,
}))
vi.mock(
  '@/features/migration/components/success/CommemorativeNftClaimDialog',
  () => ({ CommemorativeNftClaimDialog: () => null }),
)
vi.mock('@/features/migration/hooks/useEligibleV1Names', () => ({
  useEligibleV1Names: () => ({
    gracePeriodNames: [],
    unrecoverableSubnames: [],
  }),
}))
vi.mock('@/features/migration/hooks/useGraceRenewalGasEstimate', () => ({
  useGraceRenewalGasEstimate: () => ({ status: 'idle' }),
}))
vi.mock('@/features/migration/hooks/useGraceRenewalQuote', () => ({
  useGraceRenewalQuote: () => ({ status: 'idle' }),
  withRenewalAccountReadiness: (value: unknown) => value,
}))
vi.mock('@/features/migration/hooks/useMigrationGasEstimate', () => ({
  useMigrationGasEstimate: () => ({ status: 'idle' }),
}))
vi.mock('@/features/migration/hooks/useMigrationGasFunding', () => ({
  useMigrationGasFunding: () => ({ status: 'ready' }),
}))
vi.mock('@/features/migration/hooks/useSubnameMigrationConfirmation', () => ({
  useSubnameMigrationConfirmation: () => ({
    acknowledgeImpact: vi.fn(),
    cancel: vi.fn(),
    confirm: vi.fn(),
    hasAcknowledgedImpact: false,
    isChecking: false,
    isOpen: false,
    request: vi.fn(),
    restoreFocus: vi.fn(),
  }),
}))
vi.mock('@/features/migration/hooks/useSubnameMigrationImpact', () => ({
  useSubnameMigrationImpact: () => ({ status: 'ready' }),
}))
vi.mock('@/features/migration/hooks/useSyncRenewedV1Names', () => ({
  useSyncRenewedV1Names: () => undefined,
}))
vi.mock('@/features/migration/hooks/useV1Names', () => ({
  useV1Names: () => ({ data: [] }),
}))
vi.mock('@/features/migration/service/recentlyMigratedNames', () => ({
  recordRecentlyMigratedNames: mocks.recordRecentlyMigratedNames,
}))
vi.mock('@/features/migration/state/migrationUi.context', () => ({
  useMigrationUiContext: () => ({ uiActor: { send: mocks.send } }),
}))
vi.mock('@/features/migration/state/migrationUi.selectors', () => ({
  useMigrationCompletedOperations: () => [
    { name: 'alice.eth', action: 'migrate' },
  ],
  useMigrationLastError: () => ({ type: 'generic', message: 'batch failed' }),
  useMigrationManagerRestorationNames: () => [],
  useMigrationSelectedNames: () => ['alice.eth', 'bob.eth'],
  useMigrationStep: () => 'failure',
}))
vi.mock('@/lib/posthog/useMigrationNftEnabled', () => ({
  useMigrationNftEnabled: () => false,
}))
vi.mock('@/lib/smart-account', () => ({
  useSmartAccountContext: () => ({
    ownerAddress: '0x0000000000000000000000000000000000000001',
    accountAddress: '0x0000000000000000000000000000000000000002',
    client: {},
    error: undefined,
    refreshAccount: vi.fn(),
    walletClient: undefined,
  }),
}))
vi.mock('@/features/migration/pages/MigrationPage.helpers', () => ({
  invalidateMigrationQueries: mocks.invalidateMigrationQueries,
}))

import { MigrationPage } from '../../src/features/migration/pages/MigrationPage'

describe('partial migration refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refreshes every successful side effect when completed names remain after failure', () => {
    render(<MigrationPage />)

    expect.soft(mocks.invalidateMigrationQueries).toHaveBeenCalledOnce()
    expect
      .soft(mocks.recordRecentlyMigratedNames)
      .toHaveBeenCalledWith(['alice.eth'])
    expect.soft(mocks.recordVerifiedNftMigration).toHaveBeenCalledOnce()
  })
})
