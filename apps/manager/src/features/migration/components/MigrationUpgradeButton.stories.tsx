import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type ReactNode, useState } from 'react'
import { GrainOverlay } from './GrainOverlay'
import { MigrationUpgradeButton } from './MigrationUpgradeButton'

const meta = {
  title: 'Migration/Upgrade Button',
  component: MigrationUpgradeButton,
  args: {
    children: 'Upgrade names',
    showNftPlaceholder: true,
  },
  decorators: [
    (Story) => (
      <div className="relative w-full max-w-90 bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-5">
        <GrainOverlay />
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MigrationUpgradeButton>

export default meta
type Story = StoryObj<typeof meta>

export const Locked: Story = {}

export const CompleteUpgrade: Story = {
  args: { children: 'Complete upgrade' },
}

export const SelectedNames: Story = {
  args: { children: 'Upgrade 25 names' },
}

export const Unlocked: Story = {
  args: { showNftPlaceholder: false },
}

export const Disabled: Story = {
  args: { children: 'Upgrade 0 names', disabled: true },
}

const PlaceholderTogglePreview = ({
  children,
}: {
  readonly children: ReactNode
}) => {
  const [showNftPlaceholder, setShowNftPlaceholder] = useState(false)

  return (
    <div className="relative flex flex-col gap-4">
      <button
        className="self-start rounded-sm border border-ens-garnet-900 px-3 py-2 text-ens-garnet-900 text-sm"
        onClick={() => setShowNftPlaceholder((visible) => !visible)}
        type="button"
      >
        Toggle surprise card
      </button>
      <MigrationUpgradeButton
        data-testid="upgrade-button"
        showNftPlaceholder={showNftPlaceholder}
      >
        {children}
      </MigrationUpgradeButton>
      <p
        className="text-ens-garnet-900 text-sm"
        data-testid="following-content"
      >
        Content below the button
      </p>
    </div>
  )
}

export const PlaceholderToggle: Story = {
  args: { children: 'Upgrade 25 names' },
  render: ({ children }) => (
    <PlaceholderTogglePreview>{children}</PlaceholderTogglePreview>
  ),
}
