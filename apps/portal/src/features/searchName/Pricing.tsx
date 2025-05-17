import { Box, Button, Typography } from '@ensdomains/thorin'
import { useEstimateFullRegistration } from '@ens-apps/hooks'

type PricingProps = {
  name?: string;
  duration: number;
  currency: 'ETH' | 'USD';
  onChangeDuration: (duration: number) => void;
  onChangeCurrency: (currency: 'ETH' | 'USD') => void;
  onBack: () => void;
  onContinue: () => void;
}

export const Pricing = ({
  name,
  duration,
  currency,
  onChangeDuration,
  onChangeCurrency,
  onBack,
  onContinue,
}: PricingProps) => {
  const handleDecreaseDuration = () => {
    if (duration > 1) {
      onChangeDuration(duration - 1);
    }
  }

  const handleIncreaseDuration = () => {
    onChangeDuration(duration + 1);
  }

  const { estimatedGasFee, totalDurationBasedFee, } = useEstimateFullRegistration({
    registrationData: { seconds: duration * 31536000 },
    name: name?.split('.')[0] || '',
  })

  // dummy values for testing
  const registrationFee = Number(totalDurationBasedFee) / 1e18 * (currency === 'USD' ? 2500 : 1);
  const networkFee = Number(estimatedGasFee) / 1e18 * (currency === 'USD' ? 2500 : 1);
  const total = registrationFee + networkFee;

  return (
    <Box width="full" display="flex" flexDirection="column" gap="6" >
      <Typography fontWeight="bold" fontSize="headingTwo">
        Register {name}
      </Typography>

      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        backgroundColor="grey"
        borderRadius="extraLarge"
        padding="1"
      >
        <Button
          onClick={handleDecreaseDuration}
          disabled={duration <= 1}
        >
          -
        </Button>
        <Box
          backgroundColor="background"
          padding="4"
          borderRadius="large"
          width="full"
          textAlign="center"
        >
          <Typography fontWeight="bold" fontSize="headingThree">
            {duration} year{duration > 1 ? 's' : ''}
          </Typography>
        </Box>
        <Button
          onClick={handleIncreaseDuration}
        >
          +
        </Button>
      </Box>

      <Box display="flex" justifyContent="space-between" alignItems="center">
        <Typography color="textSecondary">
          {duration} year registration.
        </Typography>

        <Box display="flex" alignItems="center" gap="2">
          <Box
            display="flex"
            backgroundColor="grey"
            borderRadius="full"
            padding="1"
          >
            <Box
              as="button"
              backgroundColor={currency === 'ETH' ? 'background' : 'transparent'}
              padding="2"
              borderRadius="full"
              onClick={() => onChangeCurrency('ETH')}
            >
              <Typography>ETH</Typography>
            </Box>
            <Box
              as="button"
              backgroundColor={currency === 'USD' ? 'background' : 'transparent'}
              padding="2"
              borderRadius="full"
              onClick={() => onChangeCurrency('USD')}
            >
              <Typography>USD</Typography>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box
        backgroundColor="grey"
        padding="6"
        borderRadius="large"
      >
        <Box display="flex" justifyContent="space-between" marginBottom="3">
          <Typography>{duration} year registration</Typography>
          <Typography>{currency === 'ETH' ? '⟠' : '$'}{registrationFee.toFixed(2)}</Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" marginBottom="3">
          <Typography>Est. network fee</Typography>
          <Typography>{currency === 'ETH' ? '⟠' : '$'}{networkFee.toFixed(2)}</Typography>
        </Box>
        <Box display="flex" justifyContent="space-between">
          <Typography fontWeight="bold">Estimated total</Typography>
          <Typography fontWeight="bold">{currency === 'ETH' ? '⟠' : '$'}{total.toFixed(2)}</Typography>
        </Box>
      </Box>

      <Box display="flex" justifyContent="space-between" gap="4" marginTop="4">
        <Button
          onClick={onBack}
          colorStyle="accentSecondary"
          width="1/2"
        >
          Back
        </Button>
        <Button
          onClick={onContinue}
          width="1/2"
        >
          Continue
        </Button>
      </Box>
    </Box >
  )
}
