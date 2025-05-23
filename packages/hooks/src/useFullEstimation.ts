// TODO: This is a temporary implementation to get the full estimation working.
// We need to refactor this to use the new registration flow, and use all the hooks from the ens-app-v3 app.

type RegistrationReducerDataItem = {
  seconds: number
}

type UseEstimateFullRegistrationParameters = {
  registrationData: RegistrationReducerDataItem
  name: string
}

export const useEstimateFullRegistration = ({
  registrationData,
}: UseEstimateFullRegistrationParameters) => {
  const baseYearlyFee = 5000000000000000n
  const yearMultiplier = BigInt(
    Math.max(1, Math.floor(registrationData.seconds / 31536000)),
  )
  // taking as example from ens-app-v3
  return {
    estimatedGasFee: 2000000000000000n,
    estimatedGasLoading: false,
    yearlyFee: baseYearlyFee,
    totalDurationBasedFee: baseYearlyFee * yearMultiplier,
    hasPremium: false,
    premiumFee: 0n,
    gasPrice: 20000000000n,
    seconds: registrationData.seconds,
  }
}
