import { Trans } from '@lingui/react/macro'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { motion } from 'motion/react'
import { DomainResultCard } from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { CheckAvailability } from './CheckAvailability'

const dropdownAnimation = {
  initial: { opacity: 0, y: -8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
  transition: { duration: 0.2 },
}

const GRACE_DOMAIN = 'earl.eth'

const storyLayoutDecorator = (Story: React.ComponentType) => (
  <motion.div className="flex min-h-screen items-center justify-center bg-slate-900/10 p-12">
    <motion.div className="w-full max-w-4xl">
      <Story />
    </motion.div>
  </motion.div>
)

const meta = {
  title: 'Features/Register/CheckAvailability/CheckAvailability',
  component: CheckAvailability,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [storyLayoutDecorator],
  args: {},
} satisfies Meta<typeof CheckAvailability>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * Static preview of the unavailable search result when the name is registered
 * and in the V2 grace period (Registered + Grace period pills on DomainResultCard).
 * Matches the dropdown layout in CheckAvailability without live availability queries.
 */
export const RegisteredInGrace: Story = {
  render: () => (
    <div className="relative flex flex-col gap-2">
      <SearchField
        className="w-full"
        isLoading={false}
        placeholder=".eth"
        readOnly
        value={GRACE_DOMAIN}
      />
      <motion.div className="absolute top-full z-10 mt-2 w-full space-y-4 drop-shadow-lg">
        <motion.div key={`result-${GRACE_DOMAIN}`} {...dropdownAnimation}>
          <DomainResultCard
            clickable
            domainName={GRACE_DOMAIN}
            status="grace"
          />
        </motion.div>
      </motion.div>
      <p className="pl-1 font-medium font-sans text-ens-lapis-surface text-sm leading-normal tracking-wide">
        <Trans>Start typing to check if your perfect name is available</Trans>{' '}
        🕵️‍♀️
      </p>
    </div>
  ),
}
