import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { newEmptyProfileRecords } from '@/features/profile/utils/transformRecords'
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
    displayExpiryDate: new Date('2028-10-14T00:00:00Z'),
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
