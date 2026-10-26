import { Trans } from '@lingui/react/macro'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { type ReactNode, useState } from 'react'
import { arbitrumSepolia, baseSepolia, optimismSepolia } from 'viem/chains'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import type { L2Source } from '@/l2Sources'
import type { StablecoinBalance } from '@/lib/smart-account'
import type { SUPPORTED_TOKEN } from '@/lib/tokens'
import { cn } from '@/lib/utils'
import type { L2PaymentRow } from '../hooks/useL2Payment'
import { type L2PaymentOption, l2PaymentOptionId } from '../lib/paymentOptions'
import {
  PaymentMethodList,
  type PaymentMethodListItem,
} from './PaymentMethodList'
import { PaymentMethodRow } from './PaymentMethodRow'
import { PaymentReceipt } from './PaymentReceipt'
import {
  type RegistrationFundingSummary,
  TokenPickerContentBase,
} from './TokenPickerContent'
import { PaymentDialogBase } from './TokenPickerDialog'

const FUNDED_USDC: StablecoinBalance = {
  address: '0x0000000000000000000000000000000000000001',
  symbol: 'USDC',
  balance: '1000000000',
  decimals: 6,
  formattedBalance: '1000.00',
}

const INSUFFICIENT_USDC: StablecoinBalance = {
  ...FUNDED_USDC,
  balance: '0',
  formattedBalance: '0.00',
}

const l2Row = (
  chain: typeof baseSepolia | typeof arbitrumSepolia | typeof optimismSepolia,
  balanceRaw: bigint | null,
  status: L2PaymentOption['status'],
  amountInRaw?: bigint,
): L2PaymentRow => ({
  option: {
    id: l2PaymentOptionId(chain.id),
    source: {
      chain,
      usdc: FUNDED_USDC.address,
      rpcUrls: [],
      client: {} as L2Source['client'],
    },
    balanceRaw,
    status,
  },
  amountInRaw,
  isQuoteLoading: false,
  hasQuoteFailed: false,
})

const FIXTURE_L2_ROWS: readonly L2PaymentRow[] = [
  l2Row(baseSepolia, 400_000_000n, 'available', 352_012_573n),
  l2Row(arbitrumSepolia, 100_000_000n, 'insufficient'),
  l2Row(optimismSepolia, null, 'unavailable'),
]

interface TokenPickerDialogShellProps {
  readonly label: string
  readonly defaultOpen?: boolean
  readonly pricingData?: number
  readonly pricingLoading?: boolean
  readonly isInPriceCooldown?: boolean
  readonly isConnected?: boolean
  readonly isLoadingBalances?: boolean
  readonly stablecoinBalances?: StablecoinBalance[]
  readonly globalErrorMessage?: string | null
  readonly helpMessage?: string
  readonly footer?: ReactNode
  readonly initialSelectedToken?: SUPPORTED_TOKEN
  readonly funding?: RegistrationFundingSummary
  readonly isQuotingFunding?: boolean
  /** L2 rows the registration can be paid from. */
  readonly l2Rows?: readonly L2PaymentRow[]
}

export const TokenPickerDialogShell = ({
  label,
  defaultOpen = true,
  pricingData = 352,
  pricingLoading = false,
  isInPriceCooldown = false,
  isConnected = true,
  isLoadingBalances = false,
  stablecoinBalances = [FUNDED_USDC],
  globalErrorMessage = null,
  helpMessage,
  footer,
  initialSelectedToken,
  funding,
  isQuotingFunding = false,
  l2Rows,
}: TokenPickerDialogShellProps) => {
  const [open, setOpen] = useState(defaultOpen)
  const [selectedToken, setSelectedToken] = useState<
    SUPPORTED_TOKEN | undefined
  >(initialSelectedToken)
  const [selectedChainId, setSelectedChainId] = useState<number>()

  return (
    <PaymentDialogBase
      onOpenChange={setOpen}
      open={open}
      registrationLayout
      title="Select payment"
    >
      <TokenPickerContentBase
        footer={footer}
        funding={funding}
        globalErrorMessage={globalErrorMessage}
        helpMessage={helpMessage}
        isConnected={isConnected}
        isInPriceCooldown={isInPriceCooldown}
        isLoadingBalances={isLoadingBalances}
        isQuotingFunding={isQuotingFunding}
        l2Payment={
          l2Rows && {
            rows: l2Rows,
            selectedChainId,
            onSelect: setSelectedChainId,
          }
        }
        label={label}
        onNext={() => {}}
        onSelectCoin={(coin) => {
          setSelectedChainId(undefined)
          setSelectedToken(coin)
        }}
        pricingData={pricingData}
        pricingLoading={pricingLoading}
        selectedToken={selectedToken}
        showNetworkFeeDetails
        stablecoinBalances={stablecoinBalances}
      />
    </PaymentDialogBase>
  )
}

// Everything below this marker is deterministic Storybook-only presentation
// data. It never enters token queries, account context, actors, or registration.
type FixtureMethod = {
  readonly id: string
  readonly name: 'USDC' | 'USDT' | 'DAI' | 'ETH'
  readonly network: 'Mainnet' | 'Optimism' | 'Base'
  readonly balance: string
  readonly isAvailable: boolean
}

export const FIXTURE_MULTIPLE_METHODS: readonly FixtureMethod[] = [
  {
    id: 'usdc-mainnet',
    name: 'USDC',
    network: 'Mainnet',
    balance: '$1,000.00',
    isAvailable: true,
  },
  {
    id: 'dai-mainnet',
    name: 'DAI',
    network: 'Mainnet',
    balance: '$500.00',
    isAvailable: true,
  },
  {
    id: 'usdt-mainnet',
    name: 'USDT',
    network: 'Mainnet',
    balance: '$410.00',
    isAvailable: true,
  },
  {
    id: 'eth-mainnet',
    name: 'ETH',
    network: 'Mainnet',
    balance: '$620.00',
    isAvailable: false,
  },
  {
    id: 'usdc-optimism',
    name: 'USDC',
    network: 'Optimism',
    balance: '$280.00',
    isAvailable: false,
  },
  {
    id: 'dai-optimism',
    name: 'DAI',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: true,
  },
  {
    id: 'usdt-optimism',
    name: 'USDT',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: false,
  },
  {
    id: 'eth-optimism',
    name: 'ETH',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: false,
  },
  {
    id: 'usdc-base',
    name: 'USDC',
    network: 'Base',
    balance: '$125.00',
    isAvailable: false,
  },
]

export const FIXTURE_NO_VALID_COMMON_METHODS: readonly FixtureMethod[] =
  FIXTURE_MULTIPLE_METHODS.map((method) => ({ ...method, isAvailable: false }))

export const FixtureTokenPickerContent = ({
  methods,
  initialSelectedId,
}: {
  readonly methods: readonly FixtureMethod[]
  readonly initialSelectedId?: string
}) => {
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const selectedMethod = methods.find(({ id }) => id === selectedId)
  const items: PaymentMethodListItem[] = methods.map((method) => ({
    id: method.id,
    isSelected: selectedId === method.id,
    content: (
      <PaymentMethodRow
        amount={method.balance}
        amountLabel="balance"
        fee="Sepolia · est. fee $0.27"
        isAvailable={method.isAvailable}
        isSelected={selectedId === method.id}
        name={method.name}
        onSelect={() => setSelectedId(method.id)}
        selectLabel={`Select ${method.name} on ${method.network}`}
      />
    ),
  }))
  const canRegister = !!selectedMethod?.isAvailable

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-6 pt-2 pb-6">
      <div className="flex flex-1 flex-col items-center gap-8 overflow-y-auto">
        <div className="flex w-full flex-col items-center rounded-2xl bg-ens-quartz-50 p-6">
          <span className="font-medium font-semi-mono text-[40px] text-ens-gray leading-none">
            erni.eth
          </span>
        </div>
        <div className="flex w-full flex-col gap-6">
          <h2 className="text-center font-medium text-[18px] leading-none">
            <Trans>Select payment</Trans>
          </h2>
          <PaymentMethodList items={items} />
        </div>
      </div>
      <PaymentReceipt
        isEstimate={false}
        state={{
          status: 'ready',
          figures: { total: 352, applied: 0, due: 352 },
        }}
        totalLabel={<Trans>Registration total</Trans>}
        totalTooltip="Includes an estimate of the network fees."
      />
      <Button
        className={cn(
          'h-20 w-full rounded bg-ens-gray-two font-medium font-mono text-ens-gray-dark text-sm uppercase tracking-wider',
          canRegister && 'bg-ens-blue text-white hover:bg-ens-blue-hover',
        )}
        disabled={!canRegister}
        onClick={() => {}}
      >
        <Trans>Register name</Trans>
      </Button>
    </div>
  )
}

const FixtureTokenPickerDialogShell = ({
  methods,
  initialSelectedId,
}: Parameters<typeof FixtureTokenPickerContent>[0]) => {
  const [open, setOpen] = useState(true)
  return (
    <PaymentDialogBase
      onOpenChange={setOpen}
      open={open}
      registrationLayout
      title="Select payment"
    >
      <FixtureTokenPickerContent
        initialSelectedId={initialSelectedId}
        methods={methods}
      />
    </PaymentDialogBase>
  )
}

const meta = {
  title: 'Features/Register-v2/Pricing/TokenPickerDialog',
  component: TokenPickerDialogShell,
  excludeStories:
    /^(FIXTURE_|FixtureTokenPickerContent|TokenPickerDialogShell)/,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
  args: {
    label: 'erni',
    defaultOpen: true,
    pricingData: 352,
    pricingLoading: false,
    isConnected: true,
    isLoadingBalances: false,
    stablecoinBalances: [FUNDED_USDC],
    globalErrorMessage: null,
  },
  argTypes: {
    stablecoinBalances: { control: false },
    l2Rows: { control: false },
    initialSelectedToken: {
      control: 'inline-radio',
      options: [undefined, 'USDC'],
    },
  },
} satisfies Meta<typeof TokenPickerDialogShell>

export default meta
type Story = StoryObj<typeof meta>

export const FundedUSDC: Story = {
  args: {
    initialSelectedToken: 'USDC',
    funding: {
      registration: 351.73,
      networkFee: 0.27,
      total: 352,
      walletDebit: 352,
      hcaCredit: 0,
      isLoading: false,
    },
  },
}

export const InsufficientUSDC: Story = {
  args: {
    initialSelectedToken: 'USDC',
    stablecoinBalances: [INSUFFICIENT_USDC],
    funding: {
      registration: 351.73,
      networkFee: 0.27,
      total: 352,
      walletDebit: 352,
      hcaCredit: 0,
      isLoading: false,
    },
  },
}

export const PayFromL2: Story = {
  args: {
    ...InsufficientUSDC.args,
    l2Rows: FIXTURE_L2_ROWS,
  },
}

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
      isLoading: false,
    },
  },
}

export const LongNameWithApprovalDetails: Story = {
  args: {
    initialSelectedToken: 'USDC',
    pricingData: 160,
    funding: {
      registration: 160,
      networkFee: 0,
      total: 160,
      walletDebit: 0,
      hcaCredit: 160,
      isLoading: false,
    },
    label: 'rh-resume-c-mvfdmryi7p3',
    helpMessage:
      'Your wallet will ask you to sign a payment approval for the amount shown.',
  },
  render: (args) => (
    <TokenPickerDialogShell
      {...args}
      footer={
        <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-[rgb(250,250,250)] px-4 py-3 text-left">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-ens-gray text-sm">
              Set as primary name
            </span>
            <span className="text-ens-gray text-xs">
              Your wallet address can only have one primary name, which will
              display instead of your wallet address across apps. You'll be
              prompted to confirm this additional transaction after
              registration.
            </span>
          </div>
          <Switch aria-label="Set as primary name" />
        </div>
      }
    />
  ),
}

export const FixtureMultipleMethodsCollapsed: Story = {
  name: '[Fixture only] Multiple methods collapsed',
  render: () => (
    <FixtureTokenPickerDialogShell
      initialSelectedId="usdc-mainnet"
      methods={FIXTURE_MULTIPLE_METHODS}
    />
  ),
}

export const FixtureNoValidCommonMethods: Story = {
  name: '[Fixture only] No valid common methods',
  render: () => (
    <FixtureTokenPickerDialogShell methods={FIXTURE_NO_VALID_COMMON_METHODS} />
  ),
}

export const FixtureEmptyMethods: Story = {
  name: '[Fixture only] Empty supplied list',
  render: () => <FixtureTokenPickerDialogShell methods={[]} />,
}
