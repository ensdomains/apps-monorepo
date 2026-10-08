import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { RegistrationDetailsView } from '../registering/components/RegistrationDetails'
import { SuccessStepLayout } from './SuccessStep'

const SuccessPagePreview = ({ label }: { label: string }) => (
  <div className="min-h-screen bg-white px-4 py-1 sm:px-8">
    <SuccessStepLayout>
      <RegistrationDetailsView
        basePriceWithoutDiscount={5}
        discountAmount={0}
        discountPercentage={0}
        duration={365 * 24 * 60 * 60}
        expirationDate={new Date(2027, 8, 23)}
        label={label}
        premiumPriceNumber={0}
        referenceDate={new Date(2026, 8, 23)}
        showCompleteProfileCta
        totalPrice={5}
      />
    </SuccessStepLayout>
  </div>
)

const meta = {
  title: 'Features/Register v2/Success page',
  component: SuccessPagePreview,
  parameters: { layout: 'fullscreen' },
  args: { label: 'mymind' },
} satisfies Meta<typeof SuccessPagePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
