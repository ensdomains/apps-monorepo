import { useState } from 'react'
import { useMachine } from '@xstate/react'
import { Box, Input, Typography } from '@ensdomains/thorin'
import { isNameAvailabilityError, searchMachine } from '@/features/searchNameMachine/machines/searchNameMachine'

export const SearchNameInput = () => {
  const [state, send] = useMachine(searchMachine)
  const [inputValue, setInputValue] = useState('')

  const handleSearch = () => {
    const name = inputValue.trim().toLowerCase()
    if (name) {
      const nameWithEth = name.endsWith('.eth') ? name : `${name}.eth`
      send({ type: 'search', name: nameWithEth })
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    send({ type: 'reset' })
    setInputValue(e.target.value)
  }

  const getErrorMessage = (error: unknown) => {
    if (isNameAvailabilityError(error)) {
      return error.cause
    }
    return error
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

      {state.value === 'Searching' && (
        <Typography color="textSecondary">Checking availability...</Typography>
      )}

      {state.value === 'Result' && state.context.isAvailable && (
        <Box backgroundColor="green" padding="3" borderRadius="medium">
          <Typography color="white">
            {state.context.name} is available!
          </Typography>
        </Box>
      )}

      {state.value === 'Result' && !state.context.isAvailable && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {state.context.name} is not available
          </Typography>
        </Box>
      )}

      {state.value === 'Error' && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {String(getErrorMessage(state.context.error))}
          </Typography>
        </Box>
      )}
    </Box>
  )
}