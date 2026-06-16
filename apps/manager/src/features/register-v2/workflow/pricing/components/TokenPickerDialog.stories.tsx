import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import type { PaymentSourceBalance } from '@/lib/payment/usePaymentSourceBalances'
import { TokenPickerContentBase } from './TokenPickerContent'
import { PaymentDialogBase } from './TokenPickerDialog'

/**
 * `TokenPickerDialog` is a controlled dialog driven by the registration-v2
 * state machine and `useSmartAccountContext`. Storybook can't easily boot
 * those providers, so we story a shell that composes the provider-free
 * pieces directly:
 *
 *   - `PaymentDialogBase` — the responsive Dialog/Drawer wrapper.
 *   - `TokenPickerContentBase` — the pure content component (balances,
 *     selection state, pricing) that accepts all data via props.
 *
 * The shell holds its own open + selectedToken state so you can interact
 * with the dialog and watch the `Buy Name` button flip between disabled
 * and enabled based on the args you pass in.
 */

// ---------------------------------------------------------------------------
// Mock balances
// ---------------------------------------------------------------------------

const MOCK_BALANCES: PaymentSourceBalance[] = [
  {
    id: 'usdc-sepolia',
    label: 'USDC',
    symbol: 'USDC',
    decimals: 6,
    sourceChainId: 11155111,
    sourceTokenAddress: '0x0000000000000000000000000000000000000001',
    destinationPaymentToken: '0x0000000000000000000000000000000000000001',
    isCrossChain: false,
    balance: '1000000000', // 1,000 USDC
    formattedBalance: '1000.00 USDC',
  },
  {
    id: 'dai-sepolia',
    label: 'DAI',
    symbol: 'DAI',
    decimals: 18,
    sourceChainId: 11155111,
    sourceTokenAddress: '0x0000000000000000000000000000000000000002',
    destinationPaymentToken: '0x0000000000000000000000000000000000000002',
    isCrossChain: false,
    balance: '500000000000000000000', // 500 DAI
    formattedBalance: '500.00 DAI',
  },
  {
    id: 'usdc-base-sepolia',
    label: 'USDC (Base)',
    symbol: 'USDC',
    decimals: 6,
    sourceChainId: 84532,
    sourceTokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    destinationPaymentToken: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    isCrossChain: true,
    balance: '750000000', // 750 USDC on Base
    formattedBalance: '750.00 USDC',
  },
]

const LOW_BALANCES: PaymentSourceBalance[] = MOCK_BALANCES.map((source) => ({
  ...source,
  balance: source.decimals === 6 ? '10000000' : '5000000000000000000',
  formattedBalance: source.decimals === 6 ? '10.00 USDC' : '5.00 DAI',
}))

// ---------------------------------------------------------------------------
// Shell component — stands in for TokenPickerDialog without providers
// ---------------------------------------------------------------------------

interface TokenPickerDialogShellProps {
  label: string
  defaultOpen?: boolean
  pricingData?: number
  pricingLoading?: boolean
  isInPriceCooldown?: boolean
  isConnected?: boolean
  isLoadingBalances?: boolean
  paymentSources?: PaymentSourceBalance[]
  errorMessage?: string | null
  initialSelectedSourceId?: string
}

const TokenPickerDialogShell = ({
  label,
  defaultOpen = true,
  pricingData = 352,
  pricingLoading = false,
  isInPriceCooldown = false,
  isConnected = true,
  isLoadingBalances = false,
  paymentSources = MOCK_BALANCES,
  errorMessage = null,
  initialSelectedSourceId,
}: TokenPickerDialogShellProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>(
    initialSelectedSourceId,
  )

  return (
    <PaymentDialogBase
      onOpenChange={setOpen}
      open={open}
      title="Select payment"
    >
      <TokenPickerContentBase
        errorMessage={errorMessage}
        isConnected={isConnected}
        isInPriceCooldown={isInPriceCooldown}
        isLoadingBalances={isLoadingBalances}
        label={label}
        onNext={() => {
          console.log('Buy Name clicked', {
            label,
            selectedSourceId,
            pricingData,
          })
        }}
        onSelectSource={(source) => setSelectedSourceId(source.id)}
        paymentSources={paymentSources}
        pricingData={pricingData}
        pricingLoading={pricingLoading}
        selectedSourceId={selectedSourceId}
      />
    </PaymentDialogBase>
  )
}

// ---------------------------------------------------------------------------
// Storybook meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Features/Register-v2/Pricing/TokenPickerDialog',
  component: TokenPickerDialogShell,
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  args: {
    label: 'erni',
    defaultOpen: true,
    pricingData: 352,
    pricingLoading: false,
    isConnected: true,
    isLoadingBalances: false,
    paymentSources: MOCK_BALANCES,
    errorMessage: null,
  },
  argTypes: {
    paymentSources: { control: false },
    initialSelectedSourceId: {
      control: 'inline-radio',
      options: [undefined, 'usdc-sepolia', 'dai-sepolia', 'usdc-base-sepolia'],
    },
  },
} satisfies Meta<typeof TokenPickerDialogShell>

export default meta
type Story = StoryObj<typeof meta>

/**
 * Dialog opened, no coin selected yet → `Buy Name` is disabled.
 */
export const Default: Story = {}

/**
 * USDC preselected with sufficient balance → `Buy Name` is enabled.
 */
export const WithTokenSelected: Story = {
  args: {
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Premium 4-character domain variant.
 */
export const PremiumDomain: Story = {
  args: {
    label: 'erni', // 4 chars → 4-char premium pill
    pricingData: 640,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * 4-char premium + price cooldown — both pills side-by-side on desktop.
 */
export const PremiumDomainWithCooldown: Story = {
  args: {
    label: 'erni',
    pricingData: 48_292.56,
    isInPriceCooldown: true,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Same as PremiumDomainWithCooldown on mobile — pills stack in a column.
 */
export const PremiumDomainWithCooldownMobile: Story = {
  args: {
    label: 'erni',
    pricingData: 48_292.56,
    isInPriceCooldown: true,
    initialSelectedSourceId: 'usdc-sepolia',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}

/**
 * Price cooldown only (no 3/4-char premium pill).
 */
export const PriceCooldownOnly: Story = {
  args: {
    label: 'expiredname',
    pricingData: 47_800,
    isInPriceCooldown: true,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Premium 3-character domain variant.
 */
export const ShortPremiumDomain: Story = {
  args: {
    label: 'eni',
    pricingData: 2800,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Long domain name → font size should shrink.
 */
export const LongDomain: Story = {
  args: {
    label: 'averyverylongensdomainname',
    pricingData: 70,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Max-length domain (255 total chars: 251 label + ".eth") rendered in a
 * mobile viewport to verify the dialog bounds the height and the Buy Name
 * button stays visible while the content scrolls.
 */
export const MaxLengthDomainMobile: Story = {
  args: {
    label: 'a'.repeat(251),
    pricingData: 5,
    initialSelectedSourceId: 'usdc-sepolia',
  },
  parameters: {
    viewport: {
      defaultViewport: 'mobile1',
    },
  },
}

/**
 * Balances still loading.
 */
export const LoadingBalances: Story = {
  args: {
    isLoadingBalances: true,
    paymentSources: [],
  },
}

/**
 * Pricing request in flight after a coin was selected.
 */
export const LoadingPricing: Story = {
  args: {
    pricingLoading: true,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Wallet not connected.
 */
export const WalletDisconnected: Story = {
  args: {
    isConnected: false,
    paymentSources: [],
  },
}

/**
 * User has zero stablecoins in their smart account.
 */
export const NoStablecoins: Story = {
  args: {
    paymentSources: [],
  },
}

/**
 * Balances present but every coin is under the target price → button stays
 * disabled and each row shows the `Need $X` hint.
 */
export const InsufficientBalance: Story = {
  args: {
    pricingData: 352,
    paymentSources: LOW_BALANCES,
    initialSelectedSourceId: 'usdc-sepolia',
  },
}

/**
 * Availability recheck failed — inline error below the list.
 */
export const AvailabilityError: Story = {
  args: {
    initialSelectedSourceId: 'usdc-sepolia',
    errorMessage:
      "We couldn't confirm that erni.eth is still available. Please try again.",
  },
}
