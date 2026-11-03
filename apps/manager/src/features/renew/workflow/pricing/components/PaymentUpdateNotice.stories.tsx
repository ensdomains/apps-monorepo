import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { TokenPickerContentBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerContent'
import { PaymentDialogBase } from '@/features/register-v2/workflow/pricing/components/TokenPickerDialog'
import type { StablecoinBalance } from '@/lib/smart-account'
import { PaymentUpdateNotice } from './PaymentUpdateNotice'

const meta = {
  title: 'Features/Renew/Payment update notice',
  component: PaymentUpdateNotice,
  decorators: [
    (Story) => (
      <div className="max-w-[420px] bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: { status: 'reviewing', needsApproval: true },
} satisfies Meta<typeof PaymentUpdateNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Reviewing: Story = {}

export const SigningWithApproval: Story = {
  args: { status: 'accepted' },
}

export const SigningRenewalOnly: Story = {
  args: { status: 'accepted', needsApproval: false },
}

const WALLET_USDC: StablecoinBalance = {
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'USDC',
  balance: '20000000',
  decimals: 6,
  formattedBalance: '20.00',
}

/** The updated receipt as the renewal payment dialog shows it (screens 06 and 07). */
const RenewalReceipt = ({
  status,
  needsApproval,
}: {
  readonly status: 'reviewing' | 'accepted'
  readonly needsApproval: boolean
}) => (
  <PaymentDialogBase
    isDismissible={false}
    onOpenChange={() => {}}
    open
    registrationLayout
    title="Approve and renew name"
  >
    <TokenPickerContentBase
      funding={{
        registration: 8.8,
        networkFee: 0.9,
        total: 9.7,
        hcaCredit: 3,
        walletDebit: 6.7,
        isLoading: false,
      }}
      isBusy={status === 'accepted'}
      isConnected
      isEstimate
      isLoadingBalances={false}
      label="erni"
      nextMessage={
        status === 'reviewing'
          ? needsApproval
            ? 'Sign payment approval'
            : 'Sign renewal'
          : 'Signing renewal…'
      }
      onNext={() => {}}
      onSelectCoin={() => {}}
      pricingData={8}
      pricingLoading={false}
      receiptNotice={
        <PaymentUpdateNotice needsApproval={needsApproval} status={status} />
      }
      selectedToken="USDC"
      showNetworkFeeDetails
      stablecoinBalances={[WALLET_USDC]}
      totalLabel="Renewal total"
      {...(status === 'reviewing' ? { onCancel: () => {} } : {})}
    />
  </PaymentDialogBase>
)

export const ReceiptPaymentIncreased: Story = {
  render: (args) => <RenewalReceipt {...args} />,
}

export const ReceiptSigningUpdatedAmount: Story = {
  args: { status: 'accepted' },
  render: (args) => <RenewalReceipt {...args} />,
}

export const ReceiptPaymentIncreasedMobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  render: (args) => <RenewalReceipt {...args} />,
}
