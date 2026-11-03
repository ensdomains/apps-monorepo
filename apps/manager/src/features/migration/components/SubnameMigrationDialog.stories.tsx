import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type ComponentProps, useState } from 'react'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'
import { SubnameMigrationDialog } from './SubnameMigrationDialog'

const noop = () => undefined
const UNKNOWN_LABEL_SUBNAME =
  '[fa4cc33169239c8fff15b85fb5271b339ccc0832ed620916ff7af7609f561eec].omnipin.eth'

const readyState = (
  parents: readonly { readonly name: string; readonly affectedCount: number }[],
  unrecoverable: readonly string[] = [],
): SubnameMigrationImpactState => ({
  status: 'ready',
  impact: {
    parents,
    affectedCount: parents.reduce(
      (sum, { affectedCount }) => sum + affectedCount,
      0,
    ),
    unrecoverable,
    fingerprint: 'story',
    checkedAt: 0,
  },
  selectionKey: 'story',
  canReview: true,
  isBlocked: parents.length > 0,
  checkBeforeStart: async () => true,
  retry: noop,
})

const Acknowledgeable = (
  props: ComponentProps<typeof SubnameMigrationDialog>,
) => {
  const [hasAcknowledgedImpact, setHasAcknowledgedImpact] = useState(false)
  return (
    <SubnameMigrationDialog
      {...props}
      hasAcknowledgedImpact={hasAcknowledgedImpact}
      onAcknowledgeImpact={setHasAcknowledgedImpact}
    />
  )
}

const meta = {
  title: 'Migration/SubnameMigrationDialog',
  component: SubnameMigrationDialog,
  render: (args) => <Acknowledgeable {...args} />,
  args: {
    isOpen: true,
    selectedNameCount: 2,
    state: readyState([]),
    includedParents: [],
    isChecking: false,
    hasAcknowledgedImpact: false,
    onAcknowledgeImpact: noop,
    onCancel: noop,
    onContinue: noop,
    onRestoreFocus: noop,
  },
} satisfies Meta<typeof SubnameMigrationDialog>

export default meta
type Story = StoryObj<typeof meta>

export const IncludedSubnames: Story = {
  args: {
    includedParents: [
      { name: 'echidnas.eth', subnameCount: 3 },
      { name: 'a-very-long-parent-name-for-wrapping.eth', subnameCount: 1 },
    ],
  },
}

export const UnknownLabelsLeftBehind: Story = {
  args: {
    state: readyState([], [UNKNOWN_LABEL_SUBNAME]),
  },
}

export const IncludedAndUnknownLabels: Story = {
  args: {
    state: readyState([], [UNKNOWN_LABEL_SUBNAME]),
    includedParents: [{ name: 'omnipin.eth', subnameCount: 3 }],
  },
}

export const Blocked: Story = {
  args: {
    state: readyState([{ name: 'onshow.eth', affectedCount: 1 }]),
    includedParents: [{ name: 'onshow.eth', subnameCount: 1 }],
  },
}
