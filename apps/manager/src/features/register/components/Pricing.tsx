import { ChevronDownIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CONTRACT_ADDRESSES,
  getTokenPrices,
} from '../services/nameChainContractService'
import { CreditCardPaymentDrawer, CryptoPaymentDrawer } from './PaymentDrawer'
import { RegisterDrawer } from './RegisterDrawer'

type PricingProps = {
  domainName: string
  duration: number
  isConnected: boolean
  isLoading?: boolean
  onSetDuration: (duration: number) => void
  onSelectPayment: (method: 'crypto' | 'credit-card') => void
  onSelectCrypto: (cryptoId: string) => void
  onConfirmPayment: (tokenPrice: bigint, selectedToken: string) => void
}

export const Pricing = ({
  domainName,
  duration,
  isConnected,
  isLoading = false,
  onSetDuration,
  onSelectPayment,
  onSelectCrypto,
  onConfirmPayment,
}: PricingProps) => {
  const [activeTab, setActiveTab] = useState<'years' | 'date'>('years')
  const [customYears, setCustomYears] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)
  const [priceLoading, setPriceLoading] = useState(false)
  const [usdcPrice, setUsdcPrice] = useState<number | undefined>(undefined)
  const [daiPrice, setDaiPrice] = useState<number | undefined>(undefined)

  // For pricing calculation, round up decimal years since service is mocked
  const pricingDuration = Math.ceil(duration)

  const yearOptions = [
    { years: 1, discount: 0 },
    { years: 2, discount: 0 },
    { years: 3, discount: 10 },
    { years: 5, discount: 20 },
    { years: 10, discount: 30 },
    { years: 25, discount: 30 },
  ]

  // Fetch stablecoin prices when duration changes
  useEffect(() => {
    if (domainName && duration > 0) {
      setPriceLoading(true)

      const fetchPrices = async () => {
        try {
          const durationInSeconds = duration * 365 * 24 * 60 * 60
          const result = await getTokenPrices(domainName, durationInSeconds)

          if (result.isOk()) {
            setUsdcPrice(parseFloat(result.value.usdc.formatted))
            setDaiPrice(parseFloat(result.value.dai.formatted))
            console.log('💰 Pricing updated:', {
              domain: domainName,
              duration,
              usdc: result.value.usdc.formatted,
              dai: result.value.dai.formatted,
            })
          } else {
            console.error('Failed to get token prices:', result.error)
            // Fallback to base price
            setUsdcPrice(10 * duration)
            setDaiPrice(10 * duration)
          }
        } catch (error) {
          console.error('Error getting token prices:', error)
          // Fallback to base price
          setUsdcPrice(10 * duration)
          setDaiPrice(10 * duration)
        } finally {
          setPriceLoading(false)
        }
      }

      fetchPrices()
    }
  }, [domainName, duration])

  // Use USDC price as the default display price (since it's more common)
  const basePrice = usdcPrice || 0
  const pricePerYear = duration > 0 ? basePrice / duration : 0

  // Calculate discount based on rounded duration for pricing
  const selectedYearOption = yearOptions.find(
    (option) => option.years === pricingDuration,
  )

  let discountPercentage: number
  let discountAmount: number

  if (selectedYearOption) {
    // This is a predefined year option with potential discount
    discountPercentage = selectedYearOption.discount
    discountAmount = basePrice * (discountPercentage / 100)
  } else {
    // This is a custom duration, no discount
    discountPercentage = 0
    discountAmount = 0
  }

  const finalPrice = basePrice - discountAmount

  const calculateDurationFromDate = (endDate: Date) => {
    const now = new Date()
    const diffInMs = endDate.getTime() - now.getTime()
    const diffInYears = diffInMs / (1000 * 60 * 60 * 24 * 365.25)
    return Math.max(1, Math.round(diffInYears * 100) / 100)
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date)
      const calculatedDuration = calculateDurationFromDate(date)
      onSetDuration(calculatedDuration)
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const minDate = new Date()
  minDate.setDate(minDate.getDate() + 1)

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center rounded bg-foreground px-2 py-1 font-bold text-background text-lg">
        {domainName}
      </div>

      <h2 className="font-bold text-foreground text-xl">
        Choose registration length
      </h2>

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'years' | 'date')}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="years">Select by Years</TabsTrigger>
          <TabsTrigger value="date">Choose End Date</TabsTrigger>
        </TabsList>

        <TabsContent value="years" className="space-y-4">
          <div className="mb-4">
            <h3 className="mb-3 font-medium text-foreground text-sm">
              Quick select
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {yearOptions.map((yearOption) => (
                <button
                  key={yearOption.years}
                  type="button"
                  onClick={() => onSetDuration(yearOption.years)}
                  className={`relative rounded-lg border p-4 text-left transition-colors ${
                    duration === yearOption.years
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border bg-card hover:border-muted-foreground'
                  }`}
                >
                  <div className="font-medium">
                    {yearOption.years} year{yearOption.years > 1 ? 's' : ''}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {yearOption.discount > 0
                      ? `${yearOption.discount}% off`
                      : ''}
                  </div>
                  {yearOption.years === 5 && (
                    <div className="-top-2 -right-2 absolute rounded bg-primary px-2 py-1 text-primary-foreground text-xs">
                      Best value
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              htmlFor="custom-years"
              className="mb-2 block font-medium text-foreground text-sm"
            >
              Or enter custom duration
            </label>
            <div className="flex w-full items-center space-x-2">
              <Input
                id="custom-years"
                type="number"
                placeholder="Enter years (1-999)"
                value={customYears}
                onChange={(e) => {
                  setCustomYears(e.target.value)
                  const years = parseInt(e.target.value)
                  if (years >= 1 && years <= 999) {
                    onSetDuration(years)
                  }
                }}
                min="1"
                max="999"
                className="flex-1"
              />
              <span className="text-muted-foreground">years</span>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="date" className="space-y-4">
          <div>
            <h3 className="mb-3 font-medium text-foreground text-sm">
              Select registration end date
            </h3>
            <div className="rounded-lg border border-border p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date < minDate}
                className="w-full"
              />
            </div>
            {selectedDate && (
              <div className="mt-3 rounded-lg bg-muted p-3">
                <p className="text-muted-foreground text-sm">
                  Registration will end on:{' '}
                  <span className="font-medium text-foreground">
                    {formatDate(selectedDate)}
                  </span>
                </p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-foreground text-lg">
            Order Summary
          </h3>
          <div className="text-muted-foreground text-sm">
            Prices in USD (stablecoins)
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="rounded bg-foreground px-2 py-1 font-bold text-background text-sm">
                {domainName}
              </div>
              <span className="text-muted-foreground text-sm">
                •{' '}
                {duration === Math.floor(duration)
                  ? duration
                  : duration.toFixed(2)}{' '}
                year{duration !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-foreground text-lg">Total</span>
              <span className="font-bold text-primary">●</span>
            </div>
          </div>

          <div className="text-right">
            <div className="font-bold text-2xl text-foreground">
              ${priceLoading ? '...' : finalPrice.toFixed(2)} USD
            </div>
            {usdcPrice && daiPrice && (
              <div className="text-muted-foreground text-sm">
                {usdcPrice.toFixed(2)} USDC or {daiPrice.toFixed(2)} DAI
              </div>
            )}
          </div>

          <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-auto w-full items-center justify-between p-0 hover:bg-transparent"
              >
                <span className="text-muted-foreground text-sm">
                  Price breakdown
                </span>
                <ChevronDownIcon
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    isBreakdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-2 pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  ({pricingDuration} year{pricingDuration !== 1 ? 's' : ''} × $
                  {pricePerYear.toFixed(2)} USD/year)
                  {pricingDuration !== duration && (
                    <span className="block text-muted-foreground/70 text-xs">
                      (Rounded up from {duration.toFixed(2)} years)
                    </span>
                  )}
                </span>
                <span className="text-foreground">${basePrice.toFixed(2)}</span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">
                    ({discountPercentage}% off)
                  </span>
                  <span className="text-green-600">
                    -${discountAmount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="border-border border-t pt-2">
                <div className="flex justify-between font-medium text-sm">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">
                    ${finalPrice.toFixed(2)}
                  </span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {!isConnected ? (
          <RegisterDrawer
            domainName={domainName}
            duration={duration}
            priceUSD={finalPrice}
          >
            <Button className="h-12 w-full font-semibold text-base">
              Register
            </Button>
          </RegisterDrawer>
        ) : (
          <div className="flex space-x-3">
            <CreditCardPaymentDrawer
              domainName={domainName}
              duration={duration}
              priceUSD={finalPrice}
              onPaymentSelect={onSelectPayment}
            />
            <CryptoPaymentDrawer
              domainName={domainName}
              duration={duration}
              priceUSD={finalPrice}
              isLoading={isLoading}
              onPaymentSelect={onSelectPayment}
              onCryptoSelect={onSelectCrypto}
              onConfirmPayment={() => {
                // Pass the USDC price and address to the registration flow
                if (usdcPrice) {
                  const rawPrice = BigInt(Math.ceil(usdcPrice * 1e6)) // Convert to USDC units (6 decimals)
                  onConfirmPayment(rawPrice, CONTRACT_ADDRESSES.L2.MockUSDC)
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
