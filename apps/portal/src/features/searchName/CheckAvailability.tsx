import { Box, Input, Typography } from '@ensdomains/thorin'
import { getErrorMessage } from './utils';

type CheckAvailabilityProps = {
  inputValue: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSearch: () => void;
  onKeyPress: (e: React.KeyboardEvent) => void;
  isSearching: boolean;
  isAvailable?: boolean;
  isError: boolean;
  error?: unknown;
  name?: string;
}

export const CheckAvailability = ({
  inputValue,
  onChange,
  onSearch,
  onKeyPress,
  isSearching,
  isAvailable,
  isError,
  error,
  name,
}: CheckAvailabilityProps) => {

  return (
    <Box width="full" display="flex" flexDirection="column" gap="4">
      <Box display="flex" alignItems="center" gap="2">
        <Input
          label="Search"
          hideLabel
          placeholder="Search for a name"
          size="large"
          value={inputValue}
          onChange={onChange}
          onKeyPress={onKeyPress}
          suffix={<Typography color="textSecondary">.eth</Typography>}
        />
        <Box
          as="button"
          onClick={onSearch}
          backgroundColor="blue"
          color="white"
          padding="3"
          borderRadius="full"
          style={{ cursor: 'pointer' }}
        >
          Search
        </Box>
      </Box>

      {isSearching && (
        <Typography color="textSecondary">Checking availability...</Typography>
      )}

      {!isSearching && isAvailable && name && (
        <Box backgroundColor="green" padding="3" borderRadius="medium">
          <Typography color="white">
            {name} is available!
          </Typography>
        </Box>
      )}

      {!isSearching && isAvailable === false && name && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {name} is not available
          </Typography>
        </Box>
      )}

      {isError && (
        <Box backgroundColor="red" padding="3" borderRadius="medium">
          <Typography color="white">
            {String(getErrorMessage(error))}
          </Typography>
        </Box>
      )}
    </Box>
  )
}