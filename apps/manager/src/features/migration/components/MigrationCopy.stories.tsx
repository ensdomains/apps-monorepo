import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useEffect } from 'react'
import { createConfig, http, WagmiProvider } from 'wagmi'
import { sepolia } from 'wagmi/chains'
import type { MigrationGasEstimateState } from '@/features/migration/hooks/useMigrationGasEstimate'
import type { MigrationStepDescriptor } from '@/features/migration/service/buildStepDescriptors'
import type { MigrationError } from '@/features/migration/service/decodeMigrationError'
import {
  MigrationUiProvider,
  useMigrationUiContext,
} from '@/features/migration/state/migrationUi.context'
import { SmartAccountContextProvider } from '@/lib/smart-account'
import { MigrationPage } from '../pages/MigrationPage'
import { GameStep } from './GameStep'
import { SelectNamesStepFooter } from './SelectNamesStepFooter'
import { WalletConfirmationStepsDialog } from './WalletConfirmationStepsDialog'

const storyWagmiConfig = createConfig({
  chains: [sepolia],
  transports: { [sepolia.id]: http('http://127.0.0.1:1') },
})

const oneBatch: MigrationStepDescriptor = {
  type: 'atomic-batch',
  index: 0,
  total: 1,
  count: 1,
  migrateCount: 1,
  copyCount: 0,
}

const walletSteps: readonly MigrationStepDescriptor[] = [
  { type: 'deploy-hca' },
  {
    type: 'approval',
    approvalId: 'base-registrar:hca-token',
    name: 'a-very-long-name-for-copy-review.eth',
    tokenId: 1n,
  },
  { type: 'approval', approvalId: 'base-registrar:hca', count: 2 },
  { type: 'approval', approvalId: 'name-wrapper:hca' },
  { type: 'approval', approvalId: 'eth-registry:hca' },
  {
    type: 'atomic-batch',
    index: 0,
    total: 2,
    count: 1,
    migrateCount: 1,
    copyCount: 0,
  },
  { type: 'cleanup', approvalId: 'eth-registry:hca' },
]

const StoryProviders = ({
  children,
}: {
  readonly children: React.ReactNode
}) => (
  <WagmiProvider config={storyWagmiConfig}>
    <SmartAccountContextProvider>
      <MigrationUiProvider>{children}</MigrationUiProvider>
    </SmartAccountContextProvider>
  </WagmiProvider>
)

const MigrationStateSeeder = ({
  error,
  names,
}: {
  readonly error?: MigrationError
  readonly names: readonly string[]
}) => {
  const { uiActor } = useMigrationUiContext()

  useEffect(() => {
    uiActor.send({ type: 'selection.set', names: [...names] })
    if (error) uiActor.send({ type: 'migration.failed', error })
  }, [error, names, uiActor])

  return null
}

const ProgressPreview = ({ names }: { readonly names: readonly string[] }) => (
  <StoryProviders>
    <MigrationStateSeeder names={names} />
    <div className="relative min-h-[700px] overflow-hidden bg-ens-garnet-100">
      <GameStep />
    </div>
  </StoryProviders>
)

const FailurePreview = ({
  error,
  names,
}: {
  readonly error: MigrationError
  readonly names: readonly string[]
}) => (
  <StoryProviders>
    <MigrationStateSeeder error={error} names={names} />
    <div className="flex min-h-[700px] bg-ens-garnet-100">
      <MigrationPage />
    </div>
  </StoryProviders>
)

const readyEstimate = (
  steps: readonly MigrationStepDescriptor[],
): MigrationGasEstimateState => ({
  status: 'ready',
  formattedEth: '0.0042',
  gasUnits: 420_000n,
  feeWei: 4_200_000_000_000_000n,
  transactionCount: steps.length,
  plan: { stepDescriptors: steps } as never,
})

const SelectionFooterPreview = ({
  gasEstimate,
  totalSelected,
}: {
  readonly gasEstimate: MigrationGasEstimateState
  readonly totalSelected: number
}) => (
  <StoryProviders>
    <div className="flex min-h-64 items-end bg-ens-garnet-100">
      <SelectNamesStepFooter
        gasEstimate={gasEstimate}
        isEstimatingGas={gasEstimate.status === 'loading'}
        isStarting={false}
        isUpgradeDisabled={gasEstimate.status !== 'ready'}
        isWaitingForGasFunding={false}
        onUpgrade={() => undefined}
        totalSelected={totalSelected}
        visibleCount={totalSelected}
      />
    </div>
  </StoryProviders>
)

const meta = {
  title: 'Features/Migration/Copy QA',
  parameters: { layout: 'fullscreen' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const ProgressOneName: Story = {
  render: () => <ProgressPreview names={['alice.eth']} />,
}

export const ProgressManyNames: Story = {
  render: () => <ProgressPreview names={['alice.eth', 'bob.eth']} />,
}

const setProgressPreviewText = (canvasElement: HTMLElement, text: string) => {
  const status = canvasElement.querySelector('span.font-semi-mono')
  if (!status) throw new Error('Progress status was not rendered')
  status.textContent = text
}

export const ProgressRecovery: Story = {
  render: () => <ProgressPreview names={['alice.eth', 'bob.eth']} />,
  play: ({ canvasElement }) => {
    setProgressPreviewText(
      canvasElement,
      '123 already upgraded, 456 already copied',
    )
  },
}

export const ProgressLongName: Story = {
  render: () => <ProgressPreview names={['alice.eth']} />,
  play: ({ canvasElement }) => {
    setProgressPreviewText(
      canvasElement,
      `Upgrading ${'very-long-label-'.repeat(5)}.eth`,
    )
  },
}

export const SelectionFeeOne: Story = {
  render: () => (
    <SelectionFooterPreview
      gasEstimate={readyEstimate([oneBatch])}
      totalSelected={1}
    />
  ),
}

export const SelectionFeeMany: Story = {
  render: () => (
    <SelectionFooterPreview
      gasEstimate={readyEstimate(walletSteps)}
      totalSelected={3}
    />
  ),
}

export const SelectionFeeError: Story = {
  render: () => (
    <SelectionFooterPreview
      gasEstimate={{ status: 'error', message: 'Account setup failed' }}
      totalSelected={2}
    />
  ),
}

export const WalletExplainer: Story = {
  render: () => (
    <div className="flex min-h-64 items-center justify-center bg-ens-garnet-200">
      <WalletConfirmationStepsDialog steps={walletSteps} />
    </div>
  ),
}

export const FailureGeneric: Story = {
  render: () => (
    <FailurePreview
      error={{ type: 'generic', message: 'RPC request failed' }}
      names={['alice.eth']}
    />
  ),
}

export const FailureRetry: Story = {
  render: () => (
    <FailurePreview
      error={{ type: 'retry-blocked' }}
      names={['alice.eth', 'bob.eth']}
    />
  ),
}

export const FailureCleanup: Story = {
  render: () => (
    <FailurePreview error={{ type: 'cleanup-failed' }} names={['alice.eth']} />
  ),
}

export const FailureParentFirst: Story = {
  render: () => (
    <FailurePreview
      error={{ type: 'parent-not-upgraded' }}
      names={['sub.alice.eth']}
    />
  ),
}
