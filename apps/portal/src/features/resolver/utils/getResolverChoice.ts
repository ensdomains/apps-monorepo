import { type Address, isAddressEqual } from 'viem'

export type ResolverChoice = 'latest' | 'custom'

export type GetResolverChoiceParams = {
  readonly isV1: boolean
  readonly pickedChoice: ResolverChoice | null
  readonly typedAddress: string
  readonly latestAddress: Address
  readonly currentAddress: Address | null | undefined
}

export type ResolverChoiceSelection = {
  readonly choice: ResolverChoice
  readonly isOnLatest: boolean
  readonly address: string
}

// Only a V1 name is offered the latest V1 PublicResolver, and not once it already uses it.
export const getResolverChoice = ({
  isV1,
  pickedChoice,
  typedAddress,
  latestAddress,
  currentAddress,
}: GetResolverChoiceParams): ResolverChoiceSelection => {
  const isOnLatest =
    !!currentAddress && isAddressEqual(currentAddress, latestAddress)
  const choice = isV1 && !isOnLatest ? (pickedChoice ?? 'latest') : 'custom'
  return {
    choice,
    isOnLatest,
    address: choice === 'latest' ? latestAddress : typedAddress,
  }
}
