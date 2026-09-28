import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { NameRow } from './NameRow'
import {
  gracePeriodRowFixtures,
  longGracePeriodRowFixture,
  nameRowFixture,
  nameRowStates,
} from './NameRow.mock'

const meta = {
  title: 'Migration/Name Selection',
  component: NameRow,
  args: {
    item: nameRowFixture,
    depth: 0,
    isSelected: true,
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NameRow>

export default meta
type Story = StoryObj<typeof meta>

const SelectionStates = () => {
  const [rows, setRows] = useState(nameRowStates)

  return (
    <div className="flex flex-col gap-6 py-2 pr-3">
      {rows.map(({ id, isSelected, isPrimary }) => (
        <NameRow
          depth={0}
          isPrimary={isPrimary}
          isSelected={isSelected}
          item={nameRowFixture}
          key={id}
          onToggle={() =>
            setRows((current) =>
              current.map((row) =>
                row.id === id ? { ...row, isSelected: !row.isSelected } : row,
              ),
            )
          }
        />
      ))}
    </div>
  )
}

export const AllStates: Story = { render: () => <SelectionStates /> }

export const GracePeriod: Story = {
  args: { isInGrace: true, isSelected: false },
}

export const MixedNames: Story = {
  render: () => (
    <div className="flex flex-col gap-6">
      <NameRow depth={0} isSelected item={nameRowFixture} />
      {gracePeriodRowFixtures.map((item) => (
        <NameRow
          depth={0}
          isInGrace
          isSelected={false}
          item={item}
          key={item.domain.id}
        />
      ))}
    </div>
  ),
}

export const GracePeriodNarrow: Story = {
  args: {
    isInGrace: true,
    isPrimary: true,
    isSelected: false,
    item: longGracePeriodRowFixture,
  },
  render: (args) => (
    <div className="w-64 max-w-full">
      <NameRow {...args} />
    </div>
  ),
}
