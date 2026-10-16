import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { CheckCircle2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { RegistrationCompletionBanner } from './RegistrationCompletionBanner'

const meta = {
  title: 'Features/Register v2/Registration completion banner',
  component: RegistrationCompletionBanner,
  decorators: [
    (Story) => (
      <div className="max-w-xl bg-white p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RegistrationCompletionBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

// Copy of the banner before the fix, kept only for the comparison below
const SuccessBefore = () => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-peridot-border bg-ens-peridot-bg p-4">
    <CheckCircle2
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-ens-peridot-text-dark"
    />
    <div className="flex flex-col gap-1">
      <p className="font-medium text-ens-peridot-text-dark text-sm leading-5">
        Registration Complete!
      </p>
      <p className="text-ens-peridot-text-medium text-sm leading-5">
        Your ENS domain has been successfully registered and is now active.
      </p>
    </div>
  </div>
)

// Same markup as the failure banner in FailureStep
const FailureReference = () => (
  <div className="flex items-start gap-3 rounded-lg border border-ens-lapis-dust bg-ens-lapis-tint p-4">
    <XCircle
      aria-hidden="true"
      className="mt-0.5 size-4 shrink-0 text-ens-lapis-dense"
    />
    <div className="flex min-w-0 flex-col gap-1">
      <p className="font-medium text-ens-lapis-dense text-sm leading-5">
        Registration Failed
      </p>
      <p className="text-ens-lapis-dense text-sm leading-5">
        Transaction 0x1fa9…130d reverted
      </p>
    </div>
  </div>
)

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="space-y-1">
    <p className="font-mono text-gray-500 text-xs">{label}</p>
    {/* The red line marks the middle of the title line: icons should be centred on it */}
    <div className="relative">
      {children}
      <div className="pointer-events-none absolute inset-x-0 top-[27px] h-px bg-red-500/60" />
    </div>
  </div>
)

/** Success banner before and after the fix, against the failure banner. */
export const AlignmentComparison: Story = {
  render: () => (
    <div className="space-y-6">
      <Row label="Failure (reference)">
        <FailureReference />
      </Row>
      <Row label="Success — before (no mt-0.5)">
        <SuccessBefore />
      </Row>
      <Row label="Success — after">
        <RegistrationCompletionBanner />
      </Row>
    </div>
  ),
}
