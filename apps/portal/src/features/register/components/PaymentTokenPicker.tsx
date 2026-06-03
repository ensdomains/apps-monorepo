import { getChainContractAddress } from '@ensdomains/ensjs/chain'
import { useQueries, useQuery } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { type Address, erc20Abi } from 'viem'
import { useConfig, useConnection } from 'wagmi'
import { readContractsQueryOptions } from 'wagmi/query'
import { MessageCard } from '@/components/ui/message-card'
import { PaymentTokenList } from '@/features/register/components/PaymentTokenList'
import { PAYMENT_TOKENS } from '@/features/register/constants/paymentTokens'
import { getRegistrationPriceQueryOptions } from '@/features/register/hooks/useRegistrationPrice'
import { sepoliaWithEns } from '@/lib/wagmi'
import {
  buildTokenData,
  type TokenWithPriceAndBalance,
} from '../utils/tokenData'

const ethRegistrar = getChainContractAddress({
  chain: sepoliaWithEns,
  contract: 'ensEthRegistrar',
})

const Skeleton = () => (
  <div className="space-y-4">
    <div className="h-5 w-40 bg-muted animate-pulse rounded-md" />
    <div className="space-y-2">
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
      <div className="h-16 w-full bg-muted animate-pulse rounded-sm" />
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

  const balancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address as Address],
      })),
    }),
    enabled: Boolean(address),
  })

  const allowancesQuery = useQuery({
    ...readContractsQueryOptions(config, {
      contracts: PAYMENT_TOKENS.map((token) => ({
        address: token.address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address as Address, ethRegistrar],
      })),
    }),
    enabled: Boolean(address),
  })

  const priceQueries = useQueries({
    queries: PAYMENT_TOKENS.map((token) => ({
      ...getRegistrationPriceQueryOptions({
        name,
        duration,
        token: token.address,
      }),
      enabled: Boolean(address),
    })),
  })

  if (
    balancesQuery.isLoading ||
    allowancesQuery.isLoading ||
    priceQueries.some((query) => query.isLoading)
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

  const allowances = (allowancesQuery.data ?? []).map((allowance) =>
    allowance.status === 'success' && allowance.result !== undefined
      ? BigInt(allowance.result)
      : 0n,
  )

  const tokenData = buildTokenData(
    PAYMENT_TOKENS,
    priceQueries.map((query) => query.data),
    balances,
    allowances,
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
          description={
            isRegistering
              ? "You'll need to hold USDC or DAI in your connected wallet in order to complete the registration of your ENS name."
              : "You'll need to hold USDC or DAI in your connected wallet in order to extend your ENS name."
          }
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
