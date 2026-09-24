import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { NameRow } from './NameRow'
import { nameRowFixture, nameRowStates } from './NameRow.mock'

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
      <div className="w-fit max-w-full bg-linear-to-b from-ens-garnet-100 to-ens-garnet-200 p-6">
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
