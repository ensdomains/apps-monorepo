import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import type { CopyClassifiedName } from '../service/classifyNames'
import { includedSubnameFixtures, subnameParentFixture } from './NameRow.mock'
import { NameTreeRows } from './NameTreeRows'
import { includeSubnamesInTree } from './selectNames.helpers'

const TreePreview = ({
  subnames,
  isPrepared,
}: {
  readonly subnames: readonly CopyClassifiedName[]
  readonly isPrepared: boolean
}) => {
  const [isSelected, setIsSelected] = useState(true)
  const name = subnameParentFixture.domain.name
  return (
    <NameTreeRows
      depth={0}
      isManagerRestorationLocked={false}
      managerCandidates={new Map()}
      nodes={includeSubnamesInTree(
        [{ item: subnameParentFixture, children: [] }],
        new Map(isPrepared && isSelected ? [[name, subnames]] : []),
      )}
      primaryName={null}
      restoredManagers={new Set()}
      selected={new Set(isSelected ? [name] : [])}
      toggleManagerRestoration={() => {}}
      toggleName={() => setIsSelected((selected) => !selected)}
    />
  )
}

const meta = {
  title: 'Migration/Included Subnames',
  component: TreePreview,
  args: {
    subnames: includedSubnameFixtures.slice(0, 1),
    isPrepared: true,
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TreePreview>

export default meta
type Story = StoryObj<typeof meta>

export const SameOwner: Story = {}

export const DifferentOwners: Story = {
  args: { subnames: includedSubnameFixtures },
}

export const PreparingPlan: Story = {
  args: { isPrepared: false },
}

export const Narrow: Story = {
  args: { subnames: includedSubnameFixtures },
  render: (args) => (
    <div className="w-64 max-w-full">
      <TreePreview {...args} />
    </div>
  ),
}
