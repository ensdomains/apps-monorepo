import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
import { cn } from '@/lib/utils'
import {
  iconActionClassName,
  renewActionClassName,
} from './ProfileAction.styles'
import { ProfileHeader } from './ProfileHeader'

const OWNER = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
const LONG_DESCRIPTION =
  'Building on ENS since the early days. Writing about naming, identity and onchain UX, and shipping small tools for people who manage a lot of names. '.repeat(
    3,
  )
const LONG_NAME =
  'A display name long enough to wrap across many lines in the about card, which pushes the row taller than the default avatar size. '.repeat(
    3,
  )

const recordsWith = (base: Readonly<Record<string, string>>) => ({
  ...newEmptyProfileRecords(),
  base,
})

const meta = {
  title: 'Features/Profile/Profile header',
  component: ProfileHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="mx-auto w-full max-w-226.25 py-10">
        <Story />
      </div>
    ),
  ],
  args: {
    avatarLoading: false,
    expiryDate: new Date('2028-10-14T00:00:00Z'),
    name: 'example.eth',
    owner: OWNER,
    records: recordsWith({ description: 'Builder of things' }),
    registrationDate: 1752451200,
  },
} satisfies Meta<typeof ProfileHeader>

export default meta
type Story = StoryObj<typeof meta>

export const ShortDescription: Story = {}

export const LongDescription: Story = {
  args: { records: recordsWith({ description: LONG_DESCRIPTION }) },
}

export const LongName: Story = {
  args: {
    records: recordsWith({ name: LONG_NAME, description: LONG_DESCRIPTION }),
  },
}

export const EmptyRecords: Story = {
  args: { records: newEmptyProfileRecords() },
}

export const LongEnsName: Story = {
  args: { name: `${'a-very-long-label-'.repeat(4)}name.eth` },
}

/** A subname shows its parent, linked, beside the owner. */
export const Subname: Story = {
  args: { name: 'cats.example.eth' },
}

// Stands in for the visitor actions at their real widths, without their data
const ACTIONS_PLACEHOLDER = (
  <div className="flex shrink-0 items-center gap-2">
    <span className={iconActionClassName} />
    <span className={iconActionClassName} />
    <span className={cn(renewActionClassName, 'w-23')} />
    <span className={cn(renewActionClassName, 'w-37.5')} />
  </div>
)

/** A long parent beside the actions truncates instead of running under them. */
export const SubnameWithLongParent: Story = {
  args: {
    actions: ACTIONS_PLACEHOLDER,
    name: `cats.${'a-very-long-parent-label-'.repeat(3)}name.eth`,
  },
}
