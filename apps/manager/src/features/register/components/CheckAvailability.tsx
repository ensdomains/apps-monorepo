import { useEffect, useState } from 'react'
import { DomainResultCard } from '@/components/molecules/DomainResultCard'
import { SearchField } from '@/components/molecules/SearchField'
import { getTokenPrices } from '../services/nameChainContractService'
import { getErrorMessage } from '../utils'

type CheckAvailabilityProps = {
  inputValue: string
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onSearch: () => void
  isSearching: boolean
  isAvailable?: boolean
  isError: boolean
  error?: unknown
  name?: string
  onContinue: () => void
}

export const CheckAvailability = ({
  inputValue,
  onChange,
  onSearch,
  isSearching,
  isAvailable,
  isError,
  error,
  name,
  onContinue,
}: CheckAvailabilityProps) => {
  const [price, setPrice] = useState<number | undefined>(undefined)
  const [priceLoading, setPriceLoading] = useState(false)

  // Get token price when name is available
  useEffect(() => {
    if (name && isAvailable && !isSearching) {
      setPriceLoading(true)

      const fetchPrices = async () => {
        try {
          // Get price for 1 year (365 * 24 * 60 * 60 seconds)
          const duration = 365 * 24 * 60 * 60
          const result = await getTokenPrices(name, duration)

          if (result.isOk()) {
            console.log('result prices', result.value)
            const usdcFormatted = result.value.usdc.formatted

            console.log('📊 checkPrice for', name, ':', usdcFormatted, 'USDC')
            setPrice(Number(usdcFormatted))
          } else {
            console.error('Failed to get token prices:', result.error)
            setPrice(10)
          }
        } catch (error) {
          console.error('Error getting token prices:', error)
          setPrice(10)
        } finally {
          setPriceLoading(false)
        }
      }

      fetchPrices()
    } else {
      setPrice(undefined)
    }
  }, [name, isAvailable, isSearching])

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <SearchField
        placeholder="Search for a name"
        value={inputValue}
        onChange={onChange}
        onSearch={onSearch}
        className="w-full"
      />

      <p className="text-center text-muted-foreground text-sm">
        Enter a name to check availability and register your .eth domain
      </p>

      {/* Search Status */}
      {isSearching && (
        <div className="text-center text-muted-foreground">
          Checking availability...
        </div>
      )}

      {/* Search Results */}
      {!isSearching && name && !isError && (
        <div className="space-y-3">
          <DomainResultCard
            domainName={name}
            status={isAvailable ? 'available' : 'unavailable'}
            price={isAvailable ? price : undefined}
            priceLabel={priceLoading ? 'Loading...' : 'USDC/year'}
            onAction={() => isAvailable && onContinue()}
          />
        </div>
      )}

      {/* Error State */}
      {isError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4">
          <p className="text-destructive text-sm">
            {String(getErrorMessage(error))}
          </p>
        </div>
      )}
    </div>
  )
}
