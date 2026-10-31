import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type ComponentProps, useState } from 'react'
import { fn } from 'storybook/test'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { RENEWAL_TOKEN } from '@/lib/tokens'
import { PaymentMethodSection } from './PaymentMethodSection'

const USDC: StablecoinBalance = {
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'USDC',
  balance: '1000000000',
  decimals: 6,
  formattedBalance: '1000.00',
}

const DAI: StablecoinBalance = {
  address: '0x0000000000000000000000000000000000000002',
  symbol: 'DAI',
  balance: '500000000000000000000',
  decimals: 18,
  formattedBalance: '500.00',
}

// Keeps the selection in local state so clicking a row moves the border.
const SelectablePaymentMethodSection = ({
  selectedToken,
  onSelectCoin,
  ...props
}: ComponentProps<typeof PaymentMethodSection>) => {
  const [selected, setSelected] = useState<RENEWAL_TOKEN>(selectedToken)
  return (
    <PaymentMethodSection
      {...props}
      onSelectCoin={(coin) => {
        setSelected(coin)
        onSelectCoin(coin)
      }}
      selectedToken={selected}
    />
  )
}

const meta = {
  title: 'Features/Bulk Renew/Payment method section',
  component: PaymentMethodSection,
  render: (args) => <SelectablePaymentMethodSection {...args} />,
  decorators: [
    (Story) => (
      <div className="w-full max-w-xl rounded-lg bg-white p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    isConnected: true,
    isLoadingBalances: false,
    stablecoinBalances: [USDC, DAI],
    selectedToken: 'USDC',
    onSelectCoin: fn(),
    priceUSD: 120,
  },
} satisfies Meta<typeof PaymentMethodSection>

export default meta
type Story = StoryObj<typeof meta>

/** The selected coin is outlined with a border. */
export const UsdcSelected: Story = {}

export const DaiSelected: Story = {
  args: { selectedToken: 'DAI' },
}

/** DAI can't cover the price, so it is disabled and dimmed. */
export const InsufficientBalance: Story = {
  args: { priceUSD: 750 },
}

export const LoadingBalances: Story = {
  args: { isLoadingBalances: true },
}

export const NoStablecoins: Story = {
  args: { stablecoinBalances: [] },
}

export const NotConnected: Story = {
  args: { isConnected: false },
}

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
}
