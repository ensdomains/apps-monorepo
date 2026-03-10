import { isAddress } from 'viem'

export type GetIsSubmitDisabledParams = {
  walletOk: boolean
  useCustomResolver: boolean
  resolverAddress: string
  deployNewResolver: boolean
  selectedExistingResolver: string
}

export function getIsSubmitDisabled({
  walletOk,
  useCustomResolver,
  resolverAddress,
  deployNewResolver,
  selectedExistingResolver,
}: GetIsSubmitDisabledParams): boolean {
  if (!walletOk) return true

  if (useCustomResolver) {
    return resolverAddress.trim() === '' || !isAddress(resolverAddress)
  }

  if (deployNewResolver) return false

  return (
    selectedExistingResolver.trim() === '' ||
    !isAddress(selectedExistingResolver)
  )
}
