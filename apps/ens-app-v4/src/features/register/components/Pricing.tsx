import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
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
import { getEstimationFullRegistrationQueryOptions } from '../services/estimationFullRegistrationService'
import { RegisterDrawer } from './RegisterDrawer'

type PricingProps = {
  domainName: string
  duration: number
  currency: 'ETH' | 'USD'
  onChangeDuration: (duration: number) => void
  onChangeCurrency: (currency: 'ETH' | 'USD') => void
}

export const Pricing = ({
  domainName,
  duration,
  currency,
  onChangeDuration,
  onChangeCurrency,
}: PricingProps) => {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'years' | 'date'>('years')
  const [customYears, setCustomYears] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false)

  // For pricing calculation, round up decimal years since service is mocked
  const pricingDuration = Math.ceil(duration)

  const { data: estimation } = useQuery({
    ...getEstimationFullRegistrationQueryOptions(
      domainName.split('.')[0] || '',
      pricingDuration * 31536000,
    ),
    enabled: !!domainName,
  })

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
    (currency === 'USD' ? 2500 : 1)
  const networkFee =
    (Number(estimation?.estimatedGasFee || 0) / 1e18) *
    (currency === 'USD' ? 2500 : 1)

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
      onChangeDuration(calculatedDuration)
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
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: '/' })}
          className="p-2 h-auto"
        >
          ← Back
        </Button>
      </div>

      <div className="inline-flex items-center bg-foreground text-background px-2 py-1 rounded text-lg font-bold">
        {domainName}
      </div>

      <h2 className="text-xl font-bold text-foreground">
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
            <h3 className="text-sm font-medium text-foreground mb-3">
              Quick select
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {yearOptions.map((yearOption) => (
                <button
                  key={yearOption.years}
                  type="button"
                  onClick={() => onChangeDuration(yearOption.years)}
                  className={`p-4 border rounded-lg text-left transition-colors relative ${
                    duration === yearOption.years
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border hover:border-muted-foreground bg-card'
                  }`}
                >
                  <div className="font-medium">
                    {yearOption.years} year{yearOption.years > 1 ? 's' : ''}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {yearOption.discount > 0
                      ? `${yearOption.discount}% off`
                      : ''}
                  </div>
                  {yearOption.years === 5 && (
                    <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
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
              className="block text-sm font-medium text-foreground mb-2"
            >
              Or enter custom duration
            </label>
            <div className="flex items-center w-full space-x-2">
              <Input
                id="custom-years"
                type="number"
                placeholder="Enter years (1-999)"
                value={customYears}
                onChange={(e) => {
                  setCustomYears(e.target.value)
                  const years = parseInt(e.target.value)
                  if (years >= 1 && years <= 999) {
                    onChangeDuration(years)
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
            <h3 className="text-sm font-medium text-foreground mb-3">
              Select registration end date
            </h3>
            <div className="border border-border rounded-lg p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                disabled={(date) => date < minDate}
                className="w-full"
              />
            </div>
            {selectedDate && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
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
          <h3 className="text-lg font-semibold text-foreground">
            Order Summary
          </h3>
          <div className="flex items-center border border-border rounded-md">
            <button
              type="button"
              onClick={() => onChangeCurrency('USD')}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                currency === 'USD'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              USD
            </button>
            <button
              type="button"
              onClick={() => onChangeCurrency('ETH')}
              className={`px-3 py-1 text-sm font-medium transition-colors ${
                currency === 'ETH'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              ETH
            </button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-foreground text-background px-2 py-1 rounded text-sm font-bold">
                {domainName}
              </div>
              <span className="text-sm text-muted-foreground">
                •{' '}
                {duration === Math.floor(duration)
                  ? duration
                  : duration.toFixed(2)}{' '}
                year{duration !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-lg font-bold text-foreground">Total</span>
              <span className="text-primary font-bold">●</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-foreground">
              {currency === 'ETH' ? '⟠' : '$'}
              {total.toFixed(2)} {currency}
            </div>
          </div>

          <Collapsible open={isBreakdownOpen} onOpenChange={setIsBreakdownOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full flex items-center justify-between p-0 h-auto hover:bg-transparent"
              >
                <span className="text-sm text-muted-foreground">
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
                  {currency === 'ETH' ? '⟠' : '$'}
                  {pricePerYear.toFixed(2)} {currency}/year)
                  {pricingDuration !== duration && (
                    <span className="block text-xs text-muted-foreground/70">
                      (Rounded up from {duration.toFixed(2)} years)
                    </span>
                  )}
                </span>
                <span className="text-foreground">
                  {currency === 'ETH' ? '⟠' : '$'}
                  {basePrice.toFixed(2)}
                </span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">
                    ({discountPercentage}% off)
                  </span>
                  <span className="text-green-600">
                    -{currency === 'ETH' ? '⟠' : '$'}
                    {discountAmount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. network fee</span>
                <span className="text-foreground">
                  {currency === 'ETH' ? '⟠' : '$'}
                  {networkFee.toFixed(4)}
                </span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">
                    {currency === 'ETH' ? '⟠' : '$'}
                    {total.toFixed(2)}
                  </span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <RegisterDrawer
          domainName={domainName}
          duration={duration}
          priceUSD={currency === 'USD' ? total : total * 2500}
        >
          <Button className="w-full h-12 text-base font-semibold">
            Register
          </Button>
        </RegisterDrawer>
      </div>
    </div>
  )
}
