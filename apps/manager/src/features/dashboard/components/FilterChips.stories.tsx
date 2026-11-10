import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { type FilterChipDef, FilterChips } from './FilterChips'

type Scope = 'subnames' | 'v1' | 'v2'

const SCOPE_CHIPS: readonly FilterChipDef<Scope>[] = [
  { value: 'subnames', label: 'Subnames', count: 2 },
  { value: 'v1', label: 'V1', count: 3 },
  { value: 'v2', label: 'V2', count: 8 },
]

const ScopeChips = ({
  chips,
  initial = null,
}: {
  readonly chips: readonly FilterChipDef<Scope>[]
  readonly initial?: Scope | null
}) => {
  const [value, setValue] = useState<Scope | null>(initial)
  return (
    <FilterChips
      chips={chips}
      onChange={setValue}
      onClear={() => setValue(null)}
      shouldHideEmpty
      value={value}
    />
  )
}

const meta = {
  title: 'Features/Dashboard/FilterChips',
  component: ScopeChips,
  parameters: {
    layout: 'centered',
  },
  args: {
    chips: SCOPE_CHIPS,
  },
} satisfies Meta<typeof ScopeChips>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Selected: Story = {
  args: { initial: 'subnames' },
}

export const EmptyHidden: Story = {
  args: {
    chips: SCOPE_CHIPS.map((chip) =>
      chip.value === 'v1' ? { ...chip, count: 0 } : chip,
    ),
  },
}

export const EmptySelected: Story = {
  args: {
    chips: SCOPE_CHIPS.map((chip) =>
      chip.value === 'v1' ? { ...chip, count: 0 } : chip,
    ),
    initial: 'v1',
  },
}

export const Counting: Story = {
  args: {
    chips: SCOPE_CHIPS.map(({ count: _count, ...chip }) => chip),
  },
}

export const Mobile: Story = {
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
}
