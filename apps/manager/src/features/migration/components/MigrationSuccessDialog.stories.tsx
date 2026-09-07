import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { MotionConfig } from 'motion/react'
import { type ComponentProps, useCallback, useEffect, useState } from 'react'
import { MigrationSuccessDialog } from './MigrationSuccessDialog'
import { migrationSuccessDialogMockStates } from './MigrationSuccessDialog.mock'
import { CommemorativeNftCard } from './success/CommemorativeNftCard'
import type { MigrationSuccessDialogState } from './success/MigrationSuccessDialog.types'

type DialogProps = ComponentProps<typeof MigrationSuccessDialog>

const noop = () => undefined

const DialogPresentation = (args: DialogProps) => {
  const [open, setOpen] = useState(args.open)

  return (
    <>
      <button
        className="rounded-sm bg-ens-garnet-900 px-5 py-3 text-ens-garnet-50"
        onClick={() => setOpen(true)}
        type="button"
      >
        Open preview
      </button>
      <MigrationSuccessDialog
        {...args}
        onClose={() => {
          setOpen(false)
          args.onClose()
        }}
        onViewProfile={() => {
          setOpen(false)
          args.onViewProfile()
        }}
        open={open}
      />
    </>
  )
}

const meta = {
  title: 'Features/Migration/Success dialog',
  component: MigrationSuccessDialog,
  parameters: { layout: 'centered' },
  args: {
    context: 'migration',
    open: true,
    state: migrationSuccessDialogMockStates.readyToMint,
    migratedNameCount: 2,
    canMint: true,
    onClose: noop,
    onMint: noop,
    onRetry: noop,
    onRevealComplete: noop,
    onViewProfile: noop,
  },
  render: (args) => (
    <DialogPresentation key={`${args.state.status}:${args.open}`} {...args} />
  ),
} satisfies Meta<typeof MigrationSuccessDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Revealing: Story = {
  args: { state: migrationSuccessDialogMockStates.revealing },
}

export const ArtworkFailure: Story = {
  args: {
    state: migrationSuccessDialogMockStates.artworkFailure,
    canMint: false,
  },
}

export const ReadyToMint: Story = {}

export const Minting: Story = {
  args: { state: migrationSuccessDialogMockStates.minting, canMint: false },
}

export const Minted: Story = {
  args: { state: migrationSuccessDialogMockStates.minted, canMint: false },
}

export const InlineMintedProfile: Story = {
  args: { state: migrationSuccessDialogMockStates.minted, canMint: false },
  render: (args) => (
    <div className="w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-ens-pink/15 bg-[linear-gradient(180deg,#fff5f8,#ffe6f0)] px-2 py-5">
      <CommemorativeNftCard state={args.state} />
    </div>
  ),
}

export const ClaimError: Story = {
  args: { state: migrationSuccessDialogMockStates.claimError },
}

export const Unavailable: Story = {
  args: { state: migrationSuccessDialogMockStates.unavailable, canMint: false },
}

export const LongName: Story = {
  args: { state: migrationSuccessDialogMockStates.longName },
}

export const MintLater: Story = {
  args: { context: 'mint-later' },
}

export const LoadingEligibility: Story = {
  args: {
    state: migrationSuccessDialogMockStates.loadingEligibility,
    canMint: false,
  },
}

export const Ineligible: Story = {
  args: { state: migrationSuccessDialogMockStates.ineligible, canMint: false },
}

const InteractiveMintPreview = (args: DialogProps) => {
  const [open, setOpen] = useState(true)
  const [state, setState] = useState<MigrationSuccessDialogState>(
    migrationSuccessDialogMockStates.revealing,
  )

  useEffect(() => {
    if (!open || state.status !== 'minting') return
    const timer = window.setTimeout(
      () => setState(migrationSuccessDialogMockStates.minted),
      1_500,
    )
    return () => window.clearTimeout(timer)
  }, [open, state.status])

  const completeReveal = useCallback(() => {
    setState((current) =>
      current.status === 'revealing'
        ? migrationSuccessDialogMockStates.readyToMint
        : current,
    )
  }, [])

  return (
    <>
      <button
        className="rounded-sm bg-ens-garnet-900 px-5 py-3 text-ens-garnet-50"
        onClick={() => {
          setState(migrationSuccessDialogMockStates.revealing)
          setOpen(true)
        }}
        type="button"
      >
        Replay preview
      </button>
      <MigrationSuccessDialog
        {...args}
        canMint={state.status === 'readyToMint'}
        onClose={() => setOpen(false)}
        onMint={() => setState(migrationSuccessDialogMockStates.minting)}
        onRetry={() => setState(migrationSuccessDialogMockStates.readyToMint)}
        onRevealComplete={completeReveal}
        onViewProfile={() => setOpen(false)}
        open={open}
        state={state}
      />
    </>
  )
}

export const InteractiveRevealAndMint: Story = {
  render: (args) => <InteractiveMintPreview {...args} />,
}

export const ReducedMotion: Story = {
  name: 'Reduced motion (browser preference required)',
  parameters: {
    docs: {
      description: {
        story:
          'Set the browser prefers-reduced-motion preference to reduce before loading this story to verify the complete behavior. MotionConfig only reduces Motion animations; the native useReducedMotion hook and CSS media queries require the browser preference.',
      },
    },
  },
  decorators: [
    (Story) => (
      <MotionConfig reducedMotion="always">
        <Story />
      </MotionConfig>
    ),
  ],
  render: (args) => <InteractiveMintPreview {...args} />,
}
