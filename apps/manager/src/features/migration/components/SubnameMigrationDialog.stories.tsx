import type { Meta, StoryObj } from '@storybook/tanstack-react'
import type { SubnameMigrationImpactState } from '../hooks/useSubnameMigrationImpact'
import { SubnameMigrationDialog } from './SubnameMigrationDialog'

const noop = () => undefined

const readyState = (
  parents: readonly { readonly name: string; readonly affectedCount: number }[],
): SubnameMigrationImpactState => ({
  status: 'ready',
  impact: {
    parents,
    affectedCount: parents.reduce(
      (sum, { affectedCount }) => sum + affectedCount,
      0,
    ),
    fingerprint: 'story',
    checkedAt: 0,
  },
  selectionKey: 'story',
  canReview: true,
  isBlocked: parents.length > 0,
  checkBeforeStart: async () => true,
  retry: noop,
})

const meta = {
  title: 'Migration/SubnameMigrationDialog',
  component: SubnameMigrationDialog,
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

export const Blocked: Story = {
  args: {
    state: readyState([{ name: 'onshow.eth', affectedCount: 1 }]),
    includedParents: [{ name: 'onshow.eth', subnameCount: 1 }],
  },
}
