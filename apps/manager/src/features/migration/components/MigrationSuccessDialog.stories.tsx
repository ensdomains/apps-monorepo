import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type ComponentProps, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { sepolia } from 'viem/chains'
import { buildCommemorativeNftCardData } from '../commemorative-nft/cardData'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import { PublishedNftStory, publishedNftStoryOwner } from './PublishedNftStory'
import { CommemorativeNftCard } from './success/CommemorativeNftCard'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

type Presentation =
  | 'readyToMint'
  | 'minting'
  | 'minted'
  | 'loadingEligibility'
  | 'ineligible'
type PreviewProps = {
  readonly ownerAddress: Address
  readonly context: ComponentProps<typeof MigrationSuccessDialog>['context']
  readonly presentation: Presentation
  readonly interactive?: boolean
  readonly inline?: boolean
}

const noop = () => undefined

const PreviewDialog = ({
  canRetry = true,
  state,
  context,
  interactive,
  retry,
}: {
  readonly canRetry?: boolean
  readonly state: MigrationSuccessDialogState
  readonly context: PreviewProps['context']
  readonly interactive?: boolean
  readonly retry: () => void
}) => {
  const [open, setOpen] = useState(true)
  const [mintStatus, setMintStatus] = useState<
    'readyToMint' | 'minting' | 'minted'
  >('readyToMint')
  useEffect(() => {
    if (!open || mintStatus !== 'minting') return
    const timer = window.setTimeout(() => setMintStatus('minted'), 1500)
    return () => window.clearTimeout(timer)
  }, [open, mintStatus])
  const displayedState: MigrationSuccessDialogState =
    interactive && 'card' in state && state.card && state.status !== 'error'
      ? {
          status: mintStatus,
          card: buildCommemorativeNftCardData({
            chainId: sepolia.id,
            eligibility: state.card.eligibility,
            migratedAt: state.card.migratedAt,
            migratedNameCount: state.card.migratedNameCount,
            minted: mintStatus === 'minted',
            ownerAddress: state.card.eligibility.ownerAddress,
          }),
        }
      : state

  return (
    <>
      <button
        className="rounded-sm bg-ens-garnet-900 px-5 py-3 text-ens-garnet-50"
        onClick={() => {
          setMintStatus('readyToMint')
          setOpen(true)
        }}
        type="button"
      >
        Open preview
      </button>
      <MigrationSuccessDialog
        canMint={
          interactive === true && displayedState.status === 'readyToMint'
        }
        canRetry={canRetry}
        context={context}
        migratedNameCount={1}
        onClose={() => setOpen(false)}
        onMint={interactive ? () => setMintStatus('minting') : noop}
        onOpenDashboard={() => setOpen(false)}
        onRetry={retry}
        onViewProfile={() => setOpen(false)}
        open={open}
        state={displayedState}
      />
    </>
  )
}

const DialogPreview = (args: PreviewProps) => (
  <PublishedNftStory
    minted={args.presentation === 'minted'}
    ownerAddress={args.ownerAddress}
  >
    {({ state, retry }) => {
      if (args.inline && state.status === 'minted') {
        return (
          <div className="w-[min(32rem,calc(100vw-2rem))] rounded-xl bg-ens-garnet-100 px-2 py-5">
            <CommemorativeNftCard state={state} />
          </div>
        )
      }
      const presentationState: MigrationSuccessDialogState =
        args.presentation === 'loadingEligibility' ||
        args.presentation === 'ineligible'
          ? { status: args.presentation }
          : args.presentation === 'minting' && state.status === 'readyToMint'
            ? { status: 'minting', card: state.card }
            : state
      return (
        <PreviewDialog
          context={args.context}
          interactive={args.interactive}
          retry={retry}
          state={presentationState}
        />
      )
    }}
  </PublishedNftStory>
)

const meta = {
  title: 'Features/Migration/Success dialog',
  component: DialogPreview,
  parameters: { layout: 'centered' },
  args: {
    context: 'migration',
    presentation: 'readyToMint',
    ownerAddress: publishedNftStoryOwner,
  },
} satisfies Meta<typeof DialogPreview>

export default meta
type Story = StoryObj<typeof meta>

export const ReadyToMint: Story = {}
export const Minting: Story = { args: { presentation: 'minting' } }
export const Minted: Story = { args: { presentation: 'minted' } }
export const InlineMintedProfile: Story = {
  args: { presentation: 'minted', inline: true },
}
export const MintLater: Story = { args: { context: 'mint-later' } }
export const LoadingEligibility: Story = {
  args: { presentation: 'loadingEligibility' },
}
export const MintLaterChecking: Story = {
  render: () => (
    <PreviewDialog
      context="mint-later"
      retry={noop}
      state={{ status: 'loadingEligibility' }}
    />
  ),
}
export const MintLaterCheckFailed: Story = {
  render: () => (
    <PreviewDialog
      context="mint-later"
      retry={noop}
      state={{
        status: 'error',
        stage: 'eligibility',
        message: 'Your account could not be checked. Please try again.',
      }}
    />
  ),
}
export const MintLaterOwnerMissing: Story = {
  render: () => (
    <PreviewDialog
      canRetry={false}
      context="mint-later"
      retry={noop}
      state={{
        status: 'error',
        stage: 'eligibility',
        message: 'Reconnect your owner wallet to continue.',
      }}
    />
  ),
}
export const Ineligible: Story = { args: { presentation: 'ineligible' } }

// This only simulates the button states. The artwork always comes from the
// published token, and this story has no wallet or transaction integration.
export const InteractiveRevealAndMint: Story = {
  name: 'Interactive mint preview',
  args: { interactive: true },
}
