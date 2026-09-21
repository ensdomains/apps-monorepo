import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import type { StablecoinBalance } from '@/lib/smart-account'
import {
  type RegistrationFundingSummary,
  TokenPickerContentBase,
} from './TokenPickerContent'
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

const MOCK_BALANCES: StablecoinBalance[] = [
  {
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'USDC',
    balance: '1000000000', // 1,000 USDC
    decimals: 6,
    formattedBalance: '1000.00',
  },
  {
    address: '0x0000000000000000000000000000000000000002',
    symbol: 'DAI',
    balance: '500000000000000000000', // 500 DAI
    decimals: 18,
    formattedBalance: '500.00',
  },
]

const LOW_BALANCES: StablecoinBalance[] = [
  {
    address: '0x0000000000000000000000000000000000000001',
    symbol: 'USDC',
    balance: '10000000', // 10 USDC
    decimals: 6,
    formattedBalance: '10.00',
  },
  {
    address: '0x0000000000000000000000000000000000000002',
    symbol: 'DAI',
    balance: '5000000000000000000', // 5 DAI
    decimals: 18,
    formattedBalance: '5.00',
  },
]

const ZERO_BALANCES: StablecoinBalance[] = LOW_BALANCES.map((coin) => ({
  ...coin,
  balance: '0',
  formattedBalance: '0.00',
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
  stablecoinBalances?: StablecoinBalance[]
  errorMessage?: string | null
  initialSelectedToken?: SUPPORTED_TOKEN
  funding?: RegistrationFundingSummary
}

const TokenPickerDialogShell = ({
  label,
  defaultOpen = true,
  pricingData = 352,
  pricingLoading = false,
  isInPriceCooldown = false,
  isConnected = true,
  isLoadingBalances = false,
  stablecoinBalances = MOCK_BALANCES,
  errorMessage = null,
  initialSelectedToken,
  funding,
}: TokenPickerDialogShellProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedToken, setSelectedToken] = useState<
    SUPPORTED_TOKEN | undefined
  >(initialSelectedToken)

  return (
    <PaymentDialogBase
      onOpenChange={setOpen}
      open={open}
      title="Select payment"
    >
      <TokenPickerContentBase
        errorMessage={errorMessage}
        funding={funding}
        isConnected={isConnected}
        isInPriceCooldown={isInPriceCooldown}
        isLoadingBalances={isLoadingBalances}
        label={label}
        onNext={() => {
          console.log('Buy Name clicked', { label, selectedToken, pricingData })
        }}
        onSelectCoin={setSelectedToken}
        pricingData={pricingData}
        pricingLoading={pricingLoading}
        selectedToken={selectedToken}
        stablecoinBalances={stablecoinBalances}
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
    stablecoinBalances: MOCK_BALANCES,
    errorMessage: null,
  },
  argTypes: {
    stablecoinBalances: { control: false },
    initialSelectedToken: {
      control: 'inline-radio',
      options: [undefined, 'USDC', 'DAI'],
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
 * The live funded USDC method with its wallet balance and fee disclosure.
 */
export const FundedUSDC: Story = {
  args: {
    initialSelectedToken: 'USDC',
    funding: {
      registration: 160,
      networkFee: 4.32,
      total: 164.32,
      walletDebit: 164.32,
      hcaCredit: 0,
      isUnderfunded: false,
      isLoading: false,
    },
  },
}

/**
 * Premium 4-character domain variant.
 */
export const PremiumDomain: Story = {
  args: {
    label: 'erni', // 4 chars → 4-char premium pill
    pricingData: 640,
    initialSelectedToken: 'USDC',
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
    initialSelectedToken: 'USDC',
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
    initialSelectedToken: 'USDC',
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
    initialSelectedToken: 'USDC',
  },
}

/**
 * Premium 3-character domain variant.
 */
export const ShortPremiumDomain: Story = {
  args: {
    label: 'eni',
    pricingData: 2800,
    initialSelectedToken: 'USDC',
  },
}

/**
 * Long domain name → font size should shrink.
 */
export const LongDomain: Story = {
  args: {
    label: 'averyverylongensdomainname',
    pricingData: 70,
    initialSelectedToken: 'USDC',
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
    initialSelectedToken: 'USDC',
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
    stablecoinBalances: [],
  },
}

/**
 * Pricing request in flight after a coin was selected.
 */
export const LoadingPricing: Story = {
  args: {
    pricingLoading: true,
    initialSelectedToken: 'USDC',
  },
}

/**
 * Wallet not connected.
 */
export const WalletDisconnected: Story = {
  args: {
    isConnected: false,
    stablecoinBalances: [],
  },
}

/**
 * The balance read settled without any payment methods.
 */
export const NoStablecoins: Story = {
  args: {
    stablecoinBalances: [],
  },
}

/**
 * Payment-method reads succeeded and returned zero for both accepted stables.
 */
export const ZeroBalances: Story = {
  args: {
    pricingData: 352,
    stablecoinBalances: ZERO_BALANCES,
    initialSelectedToken: 'USDC',
    funding: {
      registration: 347.68,
      networkFee: 4.32,
      total: 352,
      walletDebit: 352,
      hcaCredit: 0,
      isUnderfunded: true,
      isLoading: false,
    },
  },
}

/**
 * The live USDC method cannot cover the account-credit-adjusted wallet debit.
 */
export const InvalidUSDC: Story = {
  args: {
    pricingData: 352,
    stablecoinBalances: LOW_BALANCES,
    initialSelectedToken: 'USDC',
    funding: {
      registration: 347.68,
      networkFee: 4.32,
      total: 352,
      walletDebit: 352,
      hcaCredit: 0,
      isUnderfunded: true,
      isLoading: false,
    },
  },
}

/**
 * DAI cannot cover the name price while USDC remains fully funded.
 */
export const InvalidDAI: Story = {
  args: {
    pricingData: 352,
    stablecoinBalances: [MOCK_BALANCES[0]!, LOW_BALANCES[1]!],
    initialSelectedToken: 'DAI',
    funding: {
      registration: 347.68,
      networkFee: 4.32,
      total: 352,
      walletDebit: 352,
      hcaCredit: 0,
      isUnderfunded: false,
      isLoading: false,
    },
  },
}

/**
 * Availability recheck failed — inline error below the list.
 */
export const AvailabilityError: Story = {
  args: {
    initialSelectedToken: 'USDC',
    errorMessage:
      "We couldn't confirm that erni.eth is still available. Please try again.",
  },
}

/**
 * An HCA still holding USDC from an aborted registration: the credit is its
 * own line and the headline is the wallet's share, not the total.
 */
export const WithAccountCredit: Story = {
  args: {
    initialSelectedToken: 'USDC',
    pricingData: 160,
    funding: {
      registration: 160,
      networkFee: 4.32,
      total: 164.32,
      walletDebit: 162.5,
      hcaCredit: 1.82,
      isUnderfunded: false,
      isLoading: false,
    },
  },
}
