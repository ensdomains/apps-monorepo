import { ERC20_ABI } from '@ens-apps/transaction-manager/contracts/abis/ERC20.abi'
import { useQueries } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import type { Address } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { DAIcon } from '@/assets/dai-icon'
import { USDCIcon } from '@/assets/usdc-icon'
import { MessageCard } from '@/components/ui/message-card'
import { PaymentTokenList } from '@/features/register/components/PaymentTokenList'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import {
  DAI_DECIMALS,
  SUPPORTED_TOKENS,
  USDC_DECIMALS,
} from '@/lib/constants/tokens'
import { sepoliaWithEns } from '@/lib/wagmi'
import {
  buildTokenData,
  type TokenWithPriceAndBalance,
} from '../utils/tokenData'

const PAYMENT_TOKENS = [
  {
    symbol: 'USDC' as const,
    address: SUPPORTED_TOKENS.USDC,
    decimals: USDC_DECIMALS,
    Icon: USDCIcon,
  },
  {
    symbol: 'DAI' as const,
    address: SUPPORTED_TOKENS.DAI,
    decimals: DAI_DECIMALS,
    Icon: DAIcon,
  },
] as const

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-quartz-100 animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
      <div className="h-16 w-full bg-quartz-100 animate-pulse rounded-lg" />
    </div>
  </div>
)

type PaymentTokenPickerProps = {
  readonly name: string
  readonly duration: number
  readonly isRegistering?: boolean
  readonly onSelectionChange: (token: TokenWithPriceAndBalance | null) => void
}

export const PaymentTokenPicker = ({
  name,
  duration,
  isRegistering = false,
  onSelectionChange,
}: PaymentTokenPickerProps) => {
  const config = useConfig()
  const { address } = useConnection()
  const [selectedToken, setSelectedToken] = useState<Address | null>(null)

  const [balancesQuery, ...priceQueries] = useQueries({
    queries: [
      {
        ...readContractsQueryOptions(config, {
          contracts: PAYMENT_TOKENS.map((token) => ({
            address: token.address,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [address as Address],
            chainId: sepoliaWithEns.id,
          })),
        }),
        enabled: Boolean(address),
      },
      {
        ...getRegistrationPriceQueryOptions({
          name,
          duration,
          token: PAYMENT_TOKENS[0].address,
          owner: address,
        }),
        enabled: Boolean(address),
      },
      {
        ...getRegistrationPriceQueryOptions({
          name,
          duration,
          token: PAYMENT_TOKENS[1].address,
          owner: address,
        }),
        enabled: Boolean(address),
      },
    ],
  })

  if (
    balancesQuery.isLoading ||
    priceQueries[0].isLoading ||
    priceQueries[1].isLoading
  ) {
    return <Skeleton />
  }

  if (!address) {
    return (
      <MessageCard
        icon={<AlertTriangle className="size-6" />}
        title="Connect your wallet"
        className="xl:min-w-none"
        titleClassName="text-base text-inherit font-medium"
        descriptionClassName="text-sm text-inherit"
        description="Connect your wallet to view available payment tokens for your ENS registration."
      />
    )
  }

  if (!balancesQuery.data) {
    return null
  }

  const balances = balancesQuery.data.map((balance) =>
    balance.status === 'success' && balance.result !== undefined
      ? BigInt(balance.result)
      : 0n,
  )

  const tokenData = buildTokenData(
    PAYMENT_TOKENS,
    [priceQueries[0].data, priceQueries[1].data],
    balances,
  )

  const noSupportedTokenHasSufficientBalance = tokenData.every(
    (token) => token.balance < token.price.total,
  )

  const handleSelect = (token: TokenWithPriceAndBalance) => {
    setSelectedToken(token.address)
    onSelectionChange(token)
  }

  return (
    <>
      <h2 id="payment-heading" className="text-base font-medium">
        Select payment method
      </h2>
      {noSupportedTokenHasSufficientBalance ? (
        <MessageCard
          variant="warning"
          icon={<AlertTriangle className="size-6" />}
          title="Insufficient balance"
          className="xl:min-w-none"
          titleClassName="text-base text-inherit font-medium"
          descriptionClassName="text-sm text-inherit"
          description={`You'll need to hold USDC or DAI in your connected wallet in order to complete the ${isRegistering ? 'registration' : 'extension'} of your ENS name.`}
        />
      ) : (
        <PaymentTokenList
          tokenData={tokenData}
          selectedToken={selectedToken}
          isRegistering={isRegistering}
          onSelect={handleSelect}
        />
      )}
    </>
  )
}
