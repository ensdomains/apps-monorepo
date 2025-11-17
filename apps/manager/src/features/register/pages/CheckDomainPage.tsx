import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  checkNameAvailability,
  type NameAvailabilityResult,
} from '@/services/checkNameAvailabilityService'
import { CheckAvailability } from '../components/CheckAvailability'

export const CheckDomainPage = () => {
  const navigate = useNavigate()
  const [inputValue, setInputValue] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [availabilityResult, setAvailabilityResult] =
    useState<NameAvailabilityResult | null>(null)

  const handleSearch = async (value: string) => {
    const name = value.trim().toLowerCase()
    if (!name) return

    const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`

    setIsSearching(true)
    setAvailabilityResult(null)

    try {
      const result = await checkNameAvailability(nameWithEth)
      setAvailabilityResult(result)
    } catch (error) {
      setAvailabilityResult({
        name: nameWithEth,
        isAvailable: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      })
    } finally {
      setIsSearching(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setAvailabilityResult(null)
  }

  const handleContinue = () => {
    if (availabilityResult?.isAvailable) {
      navigate({
        to: '/register',
        search: { name: availabilityResult.name },
      })
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center bg-background px-4">
      <h1 className="mb-4 font-bold font-serif text-4xl text-primary">
        Your web3 username
      </h1>
      <p className="mb-10 max-w-[500px] text-center text-muted-foreground">
        Your identity across web3, one name for all your crypto addresses,{' '}
        <br />
        and your decentralised website.
      </p>

      <div className="w-full max-w-md">
        <CheckAvailability
          inputValue={inputValue}
          onChange={handleInputChange}
          onSearch={() => handleSearch(inputValue)}
          isSearching={isSearching}
          isAvailable={availabilityResult?.isAvailable}
          isError={!!availabilityResult?.error}
          error={availabilityResult?.error}
          name={availabilityResult?.name}
          onContinue={handleContinue}
        />
      </div>
    </div>
  )
}
