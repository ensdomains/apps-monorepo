import { Box, Typography } from '@ensdomains/thorin'
import { useMachine } from '@xstate/react'
import { useState } from 'react'
import { CheckAvailability } from '@/features/searchName/CheckAvailability'
import {
  RegistrationStep,
  searchMachine,
} from '@/features/searchName/machines/searchNameMachine'
import { Pricing } from '@/features/searchName/Pricing'

export const Registration = () => {
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

  const handleNextStep = () => {
    send({ type: 'next' })
  }

  const handleBackStep = () => {
    send({ type: 'back' })
  }

  const handleChangeDuration = (duration: number) => {
    send({ type: 'setDuration', duration })
  }

  const handleChangeCurrency = (currencyType: 'ETH' | 'USD') => {
    send({ type: 'setCurrency', currencyType })
  }

  const isSearching = state.matches('Searching')
  const isAvailable = state.context.isAvailable
  const isError = state.matches('Error')
  const currentStep = state.context.step
  const name = state.context.name

  return (
    <Box
      width="full"
      display="flex"
      flexDirection="column"
      alignItems="center"
      padding="6"
    >
      <Box width={{ xs: 'full', md: '2/3', lg: '1/2' }}>
        <Typography
          fontWeight="bold"
          fontSize="headingOne"
          marginBottom="6"
          textAlign="center"
        >
          ENS Domain Registration
        </Typography>

        {currentStep === RegistrationStep.CHECK_AVAILABILITY && (
          <CheckAvailability
            inputValue={inputValue}
            onChange={handleInputChange}
            onSearch={handleSearch}
            onKeyPress={handleKeyPress}
            isSearching={isSearching}
            isAvailable={isAvailable}
            isError={isError}
            error={state.context.error}
            name={name}
          />
        )}

        {currentStep === RegistrationStep.PRICING && name && (
          <Pricing
            name={name}
            duration={state.context.duration}
            currency={state.context.currencyType}
            onChangeDuration={handleChangeDuration}
            onChangeCurrency={handleChangeCurrency}
            onBack={handleBackStep}
            onContinue={handleNextStep}
          />
        )}

        {isAvailable && currentStep === RegistrationStep.CHECK_AVAILABILITY && (
          <Box display="flex" justifyContent="center" marginTop="6">
            <Box
              as="button"
              onClick={handleNextStep}
              backgroundColor="blue"
              color="white"
              padding="3"
              paddingX="8"
              borderRadius="full"
              style={{ cursor: 'pointer' }}
            >
              Continue to Pricing
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  )
}
