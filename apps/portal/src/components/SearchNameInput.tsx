import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Input, Typography } from '@ensdomains/thorin'
import { getSearchNameQueryOptions, NameAvailabilityError } from '@/features/searchName/searchNameService'

export const SearchNameInput = () => {
  const [inputValue, setInputValue] = useState('')
  const [searchTerm, setSearchTerm] = useState<string | null>(null)

  const { data, isLoading, error, isError } = useQuery({
    ...getSearchNameQueryOptions(searchTerm || ''),
    enabled: !!searchTerm,
  })

  const handleSearch = () => {
    const name = inputValue.trim().toLowerCase()
    if (name) {
      setSearchTerm(name)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value)
    setSearchTerm(null)
  }

  const getErrorMessage = (error: unknown): string => {
    if (error instanceof NameAvailabilityError) {
      debugger;
      return String(error.cause)
    }
    return String(error)
  }

  return (
    <Box width="1/2" display="flex" flexDirection="column" gap="4">
      <Box display="flex" alignItems="center" gap="2">
        <Input
          label="Search"
          hideLabel
          placeholder="Search for a name"
          size="large"
          value={inputValue}
          onChange={handleInputChange}
          onKeyPress={handleKeyPress}
          suffix={<Typography color="textSecondary">.eth</Typography>}
        />
        <Box
          as="button"
          onClick={handleSearch}
          backgroundColor="blue"
          color="white"
          padding="3"
          borderRadius="full"
          style={{ cursor: 'pointer' }}
        >
          Search
        </Box>
      </Box>

      {isLoading && (
        <Typography color="textSecondary">Checking availability...</Typography>
      )}

      {!isLoading && data?.isAvailable && searchTerm && (
        <Box backgroundColor="green" padding="3" borderRadius="medium">
          <Typography color="white">
            {searchTerm} is available!
          </Typography>
        </Box>
      )}

      {!isLoading && data && !data.isAvailable && searchTerm && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {searchTerm} is not available
          </Typography>
        </Box>
      )}

      {isError && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {getErrorMessage(error)}
          </Typography>
        </Box>
      )}
    </Box>
  )
}