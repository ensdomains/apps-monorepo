import type { SubnameMigrationImpact } from '@ens-apps/migration'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'
import { SubnameMigrationDialog } from './SubnameMigrationDialog'

const noop = () => undefined

const stateOf = (
  impact: Partial<SubnameMigrationImpact>,
): SubnameMigrationImpactState => ({
  status: 'ready',
  impact: {
    parents: [],
    affectedCount: 0,
    unrecoverable: [],
    fingerprint: 'story',
    checkedAt: 0,
    ...impact,
  },
  selectionKey: 'omnipin.eth',
  canReview: true,
  isBlocked: (impact.affectedCount ?? 0) > 0,
  checkBeforeStart: async () => true,
  retry: noop,
})

const Preview = ({
  state,
}: {
  readonly state: SubnameMigrationImpactState
}) => {
  const [hasAcknowledgedImpact, setHasAcknowledgedImpact] = useState(false)
  return (
    <SubnameMigrationDialog
      hasAcknowledgedImpact={hasAcknowledgedImpact}
      isChecking={false}
      isOpen
      onAcknowledgeImpact={setHasAcknowledgedImpact}
      onCancel={noop}
      onContinue={noop}
      onRestoreFocus={noop}
      selectedNameCount={1}
      state={state}
    />
  )
}

const meta = {
  title: 'Migration/SubnameMigrationDialog',
  component: Preview,
} satisfies Meta<typeof Preview>

export default meta
type Story = StoryObj<typeof meta>

export const UnknownLabelsLeftBehind: Story = {
  args: {
    state: stateOf({
      unrecoverable: [
        '[fa4cc33169239c8fff15b85fb5271b339ccc0832ed620916ff7af7609f561eec].omnipin.eth',
      ],
    }),
  },
}

export const SubnamesBlockTheUpgrade: Story = {
  args: {
    state: stateOf({
      affectedCount: 2,
      parents: [{ name: 'omnipin.eth', affectedCount: 2 }],
    }),
  },
}
