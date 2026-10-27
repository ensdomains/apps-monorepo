import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { ResolverMigrationReview } from './ResolverMigrationReview'

const meta = {
  title: 'Migration/Resolver review',
  component: ResolverMigrationReview,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div className="min-h-screen bg-ens-garnet-100 p-6 sm:p-12">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ResolverMigrationReview>

export default meta
type Story = StoryObj<typeof meta>

export const UnknownResolvers: Story = {
  args: {
    review: {
      selectionNames: ['example.eth'],
      groups: [
        {
          resolver: '0x0000000000000000000000000000000000001234',
          kind: 'unsupported',
          isKnown: false,
          names: ['alice.example.eth', 'example.eth'],
        },
      ],
    },
  },
}

export const ImportedSubnames: Story = {
  args: {
    review: {
      selectionNames: ['example.eth'],
      groups: [
        {
          resolver: '0x231b0Ee14048e9dCcD1d247744d114a4EB5E8E63',
          kind: 'imported',
          isKnown: true,
          names: ['bob.example.eth', 'carol.example.eth'],
        },
      ],
    },
  },
}

export const MixedResolvers: Story = {
  args: {
    review: {
      selectionNames: ['example.eth'],
      groups: [
        ...(UnknownResolvers.args?.review?.groups ?? []),
        ...(ImportedSubnames.args?.review?.groups ?? []),
        {
          resolver: '0x0000000000000000000000000000000000001234',
          kind: 'imported',
          isKnown: false,
          names: ['dave.example.eth'],
        },
      ],
    },
  },
}

export const NoRetainedResolvers: Story = {
  args: { review: { selectionNames: ['example.eth'], groups: [] } },
}
