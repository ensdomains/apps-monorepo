import { isAddress } from 'viem'

export type GetIsSubmitDisabledParams = {
  isBusy: boolean
  walletOk: boolean
  useCustomResolver: boolean
  resolverAddress: string
  deployNewResolver: boolean
  selectedExistingResolver: string
}

export function getIsSubmitDisabled(
  params: GetIsSubmitDisabledParams,
): boolean {
  const {
    isBusy,
    walletOk,
    useCustomResolver,
    resolverAddress,
    deployNewResolver,
    selectedExistingResolver,
  } = params

  if (isBusy || !walletOk) return true

  if (useCustomResolver) {
    return resolverAddress.trim() === '' || !isAddress(resolverAddress)
  }

  if (deployNewResolver) return false

  return (
    selectedExistingResolver.trim() === '' ||
    !isAddress(selectedExistingResolver)
  )
}
