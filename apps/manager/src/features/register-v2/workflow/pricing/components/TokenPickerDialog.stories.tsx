import type { SUPPORTED_TOKEN } from '@ens-apps/transaction-manager/contracts/ens-sepolia'
import { Trans } from '@lingui/react/macro'
import type { Meta, StoryObj } from '@storybook/tanstack-react'
import { useState } from 'react'
import { DAI, USDCIcon, USDTIcon } from '@/components/atoms/StableCoinsIcons'
import { Button } from '@/components/ui/button'
import type { StablecoinBalance } from '@/lib/smart-account'
import { cn } from '@/lib/utils'
import { PaymentMethodIcon } from './PaymentMethodIcon'
import {
  PaymentMethodList,
  type PaymentMethodListItem,
} from './PaymentMethodList'
import { PaymentMethodRow } from './PaymentMethodRow'
import { PaymentTotalRow } from './PaymentTotalRow'
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
  readonly methodErrorMessage?: string | null
  readonly initialSelectedToken?: SUPPORTED_TOKEN
  readonly funding?: RegistrationFundingSummary
  readonly isQuotingFunding?: boolean
  readonly isFeeTooltipOpen?: boolean
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
  methodErrorMessage = null,
  initialSelectedToken,
  funding,
  isQuotingFunding = false,
  isFeeTooltipOpen,
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
        funding={funding}
        globalErrorMessage={globalErrorMessage}
        isConnected={isConnected}
        isFeeTooltipOpen={isFeeTooltipOpen}
        isInPriceCooldown={isInPriceCooldown}
        isLoadingBalances={isLoadingBalances}
        isQuotingFunding={isQuotingFunding}
        label={label}
        methodErrorMessage={methodErrorMessage}
        onNext={() => {}}
        onSelectCoin={setSelectedToken}
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
  readonly isFunded: boolean
  readonly isCommon: boolean
  readonly error?: string
}

export const FIXTURE_MULTIPLE_METHODS: readonly FixtureMethod[] = [
  {
    id: 'usdc-mainnet',
    name: 'USDC',
    network: 'Mainnet',
    balance: '$1,000.00',
    isAvailable: true,
    isFunded: true,
    isCommon: true,
  },
  {
    id: 'dai-mainnet',
    name: 'DAI',
    network: 'Mainnet',
    balance: '$500.00',
    isAvailable: true,
    isFunded: true,
    isCommon: true,
  },
  {
    id: 'usdt-mainnet',
    name: 'USDT',
    network: 'Mainnet',
    balance: '$410.00',
    isAvailable: true,
    isFunded: false,
    isCommon: true,
    error: 'Not enough ETH for permit approval',
  },
  {
    id: 'eth-mainnet',
    name: 'ETH',
    network: 'Mainnet',
    balance: '$620.00',
    isAvailable: false,
    isFunded: true,
    isCommon: false,
  },
  {
    id: 'usdc-optimism',
    name: 'USDC',
    network: 'Optimism',
    balance: '$280.00',
    isAvailable: false,
    isFunded: false,
    isCommon: false,
  },
  {
    id: 'dai-optimism',
    name: 'DAI',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: true,
    isFunded: false,
    isCommon: false,
    error: 'Need $352.00',
  },
  {
    id: 'usdt-optimism',
    name: 'USDT',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: false,
    isFunded: false,
    isCommon: false,
  },
  {
    id: 'eth-optimism',
    name: 'ETH',
    network: 'Optimism',
    balance: '$0.00',
    isAvailable: false,
    isFunded: false,
    isCommon: false,
  },
  {
    id: 'usdc-base',
    name: 'USDC',
    network: 'Base',
    balance: '$125.00',
    isAvailable: false,
    isFunded: false,
    isCommon: false,
  },
]

export const FIXTURE_NO_VALID_COMMON_METHODS: readonly FixtureMethod[] =
  FIXTURE_MULTIPLE_METHODS.map((method) => ({
    ...method,
    isAvailable: false,
    isFunded: false,
    error:
      method.name === 'USDC' && method.network === 'Mainnet'
        ? 'not enough funds to pay network fees'
        : method.name === 'USDT' && method.network === 'Mainnet'
          ? 'Not enough ETH for permit approval'
          : method.name === 'DAI' && method.network === 'Mainnet'
            ? 'Need $352.00'
            : method.error,
  }))

const FixtureTokenIcon = ({ name }: Pick<FixtureMethod, 'name'>) => {
  if (name === 'USDC') return <USDCIcon className="size-full" />
  if (name === 'USDT') return <USDTIcon className="size-full" />
  if (name === 'DAI') return <DAI className="size-full" />
  return (
    <span className="flex size-full items-center justify-center rounded-full bg-[#627eea] font-medium text-white">
      Ξ
    </span>
  )
}

const FixtureNetworkBadge = ({ network }: Pick<FixtureMethod, 'network'>) => (
  <span
    className={cn(
      'flex size-full items-center justify-center font-medium text-[7px] text-white sm:text-[9px]',
      network === 'Mainnet' && 'bg-[#6c5ce7]',
      network === 'Optimism' && 'bg-[#ff0420]',
      network === 'Base' && 'bg-[#0052ff]',
    )}
  >
    {network === 'Mainnet' ? '◆' : network.at(0)}
  </span>
)

export const FixtureTokenPickerContent = ({
  methods,
  defaultExpanded = false,
  initialSelectedId,
}: {
  readonly methods: readonly FixtureMethod[]
  readonly defaultExpanded?: boolean
  readonly initialSelectedId?: string
}) => {
  const [selectedId, setSelectedId] = useState(initialSelectedId)
  const selectedMethod = methods.find(({ id }) => id === selectedId)
  const items: PaymentMethodListItem[] = methods.map((method) => ({
    id: method.id,
    isAvailable: method.isAvailable,
    isFunded: method.isFunded,
    isCommon: method.isCommon,
    content: (
      <PaymentMethodRow
        amount={method.balance}
        amountLabel="balance"
        error={method.error}
        fee="Mainnet est. fee: $0.27"
        feeTooltip="An estimate of what the two on-chain transactions that register your name will cost. It is collected together with the name price, in the same approval."
        feeTooltipLabel="What is the network fee?"
        icon={
          <PaymentMethodIcon
            icon={<FixtureTokenIcon name={method.name} />}
            networkBadge={<FixtureNetworkBadge network={method.network} />}
          />
        }
        isAvailable={method.isAvailable}
        isFunded={method.isFunded}
        isSelected={selectedId === method.id}
        name={method.name}
        onSelect={() => setSelectedId(method.id)}
        selectLabel={`Select ${method.name} on ${method.network}`}
      />
    ),
  }))
  const canRegister = !!(selectedMethod?.isAvailable && selectedMethod.isFunded)

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
          <PaymentMethodList defaultExpanded={defaultExpanded} items={items} />
        </div>
      </div>
      <PaymentTotalRow isEstimate={false} total={352} />
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
  defaultExpanded,
  initialSelectedId,
}: Parameters<typeof FixtureTokenPickerContent>[0]) => {
  const [open, setOpen] = useState(true)
  return (
    <PaymentDialogBase
      onOpenChange={setOpen}
      open={open}
      title="Select payment"
    >
      <FixtureTokenPickerContent
        defaultExpanded={defaultExpanded}
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
    methodErrorMessage: null,
  },
  argTypes: {
    stablecoinBalances: { control: false },
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
    methodErrorMessage: 'not enough funds to pay network fees',
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

export const FeeTooltipOpen: Story = {
  args: {
    ...FundedUSDC.args,
    isFeeTooltipOpen: true,
  },
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

export const FixtureMultipleMethodsExpanded: Story = {
  name: '[Fixture only] Multiple methods expanded',
  render: () => (
    <FixtureTokenPickerDialogShell
      defaultExpanded
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
