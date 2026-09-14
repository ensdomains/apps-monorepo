import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { MigrationError } from '../service/decodeMigrationError'
import { GrainOverlay } from './GrainOverlay'
import { MigrationFailureResult } from './MigrationFailureResult'

const noop = () => undefined

type FailurePreset =
  | 'walletRequestRejected'
  | 'permissionsChanged'
  | 'retryBlocked'
  | 'cleanupFailed'
  | 'accountOwnerMismatch'
  | 'nameLocked'
  | 'parentFirst'
  | 'providerError'

// Presets keep bigint token ids out of Storybook args, which are serialised.
const errorFor = (preset: FailurePreset): MigrationError => {
  switch (preset) {
    case 'walletRequestRejected':
      return { type: 'user-rejected' }
    case 'permissionsChanged':
      return { type: 'plan-changed' }
    case 'retryBlocked':
      return { type: 'retry-blocked' }
    case 'cleanupFailed':
      return { type: 'cleanup-failed' }
    case 'accountOwnerMismatch':
      return { type: 'hca-owner-mismatch' }
    case 'nameLocked':
      return { type: 'name-is-locked', tokenId: 1n }
    case 'parentFirst':
      return {
        type: 'generic',
        message: 'Upgrade the parent name first, then its subnames.',
      }
    case 'providerError':
      return {
        type: 'generic',
        message:
          'Transaction reverted (tx 0x9f1c2b3a4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80)',
      }
  }
}

const FailurePreview = ({ preset }: { readonly preset: FailurePreset }) => (
  <div className="relative h-140 w-full overflow-clip bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200">
    <GrainOverlay className="opacity-70" />
    <MigrationFailureResult
      error={errorFor(preset)}
      onBack={noop}
      onRetry={noop}
    />
  </div>
)

const meta = {
  title: 'Features/Migration/Failure result',
  component: FailurePreview,
  parameters: { layout: 'fullscreen' },
  args: { preset: 'walletRequestRejected' },
} satisfies Meta<typeof FailurePreview>

export default meta
type Story = StoryObj<typeof meta>

export const WalletRequestRejected: Story = {}
export const PermissionsChanged: Story = {
  args: { preset: 'permissionsChanged' },
}
export const RetryBlocked: Story = { args: { preset: 'retryBlocked' } }
export const CleanupFailed: Story = { args: { preset: 'cleanupFailed' } }
export const AccountOwnerMismatch: Story = {
  args: { preset: 'accountOwnerMismatch' },
}
export const NameLocked: Story = { args: { preset: 'nameLocked' } }
export const ParentFirst: Story = { args: { preset: 'parentFirst' } }
export const ProviderError: Story = { args: { preset: 'providerError' } }
