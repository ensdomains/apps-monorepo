import { ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { CreditCardPaymentDrawer, CryptoPaymentDrawer } from './PaymentDrawer'
import { RegisterDrawer } from './RegisterDrawer'

type EstimationData = {
  estimatedGasFee: bigint
  estimatedGasLoading: boolean
  yearlyFee: bigint
  totalDurationBasedFee: bigint
  hasPremium: boolean
  premiumFee: bigint
  gasPrice: bigint
  seconds: number
}

type PricingProps = {
  domainName: string
  duration: number
  currencyType: 'ETH' | 'USD'
  estimation?: EstimationData
  isConnected: boolean
  onSetDuration: (duration: number) => void
  onSetCurrency: (currency: 'ETH' | 'USD') => void
  onSelectPayment: (method: 'crypto' | 'credit-card') => void
  onSelectCrypto: (cryptoId: string) => void
  onConfirmPayment: () => void
}

export const Pricing = ({
  domainName,
  duration,
  currencyType,
  estimation,
  isConnected,
  onSetDuration,
  onSetCurrency,
  onSelectPayment,
  onSelectCrypto,
  onConfirmPayment,
}: PricingProps) => {
  const [activeTab, setActiveTab] = useState<'years' | 'date'>('years')
  const [customYears, setCustomYears] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)

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

  const baseRegistrationFee =
    (Number(estimation?.totalDurationBasedFee || 0) / 1e18) *
    (currencyType === 'USD' ? 2500 : 1)
  const networkFee =
    (Number(estimation?.estimatedGasFee || 0) / 1e18) *
    (currencyType === 'USD' ? 2500 : 1)

  // Calculate discount based on rounded duration for pricing
  const selectedYearOption = yearOptions.find(
    (option) => option.years === pricingDuration,
  )

  let basePrice: number
  let pricePerYear: number
  let discountPercentage: number
  let discountAmount: number

  if (selectedYearOption) {
    // This is a predefined year option with potential discount
    discountPercentage = selectedYearOption.discount
    basePrice = baseRegistrationFee / (1 - discountPercentage / 100)
    pricePerYear = basePrice / pricingDuration
    discountAmount = basePrice - baseRegistrationFee
  } else {
    // This is a custom duration, use the API response directly
    discountPercentage = 0
    basePrice = baseRegistrationFee
    pricePerYear = baseRegistrationFee / pricingDuration
    discountAmount = 0
  }

  const total = baseRegistrationFee + networkFee

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
                  const years = parseInt(e.target.value, 10)
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
          <div className="flex items-center rounded-md border border-border">
            <button
              type="button"
              onClick={() => onSetCurrency('USD')}
              className={cn(
                'rounded-l-md px-3 py-1 font-medium text-sm transition-colors',
                currencyType === 'USD'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => onSetCurrency('ETH')}
              className={cn(
                'rounded-r-md px-3 py-1 font-medium text-sm transition-colors',
                currencyType === 'ETH'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              ETH
            </button>
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
              {currencyType === 'ETH' ? '⟠' : '$'}
              {total.toFixed(2)} {currencyType}
            </div>
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
                  ({pricingDuration} year{pricingDuration !== 1 ? 's' : ''} ×{' '}
                  {currencyType === 'ETH' ? '⟠' : '$'}
                  {pricePerYear.toFixed(2)} {currencyType}/year)
                  {pricingDuration !== duration && (
                    <span className="block text-muted-foreground/70 text-xs">
                      (Rounded up from {duration.toFixed(2)} years)
                    </span>
                  )}
                </span>
                <span className="text-foreground">
                  {currencyType === 'ETH' ? '⟠' : '$'}
                  {basePrice.toFixed(2)}
                </span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">
                    ({discountPercentage}% off)
                  </span>
                  <span className="text-green-600">
                    -{currencyType === 'ETH' ? '⟠' : '$'}
                    {discountAmount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. network fee</span>
                <span className="text-foreground">
                  {currencyType === 'ETH' ? '⟠' : '$'}
                  {networkFee.toFixed(4)}
                </span>
              </div>
              <div className="border-border border-t pt-2">
                <div className="flex justify-between font-medium text-sm">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">
                    {currencyType === 'ETH' ? '⟠' : '$'}
                    {total.toFixed(2)}
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
            priceUSD={currencyType === 'USD' ? total : total * 2500}
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
              priceUSD={currencyType === 'USD' ? total : total * 2500}
              onPaymentSelect={onSelectPayment}
            />
            <CryptoPaymentDrawer
              domainName={domainName}
              duration={duration}
              priceUSD={currencyType === 'USD' ? total : total * 2500}
              onPaymentSelect={onSelectPayment}
              onCryptoSelect={onSelectCrypto}
              onConfirmPayment={onConfirmPayment}
            />
          </div>
        )}
      </div>
    </div>
  )
}
