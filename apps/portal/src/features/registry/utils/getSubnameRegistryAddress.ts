import { type Address, zeroAddress } from 'viem'

export function getSubnameRegistryAddress(
  registriesData:
    | { registries?: readonly (Address | null)[] }
    | null
    | undefined,
): Address | undefined {
  if (!registriesData?.registries || registriesData.registries.length === 0) {
    return undefined
  }
  const [first, second] = registriesData.registries
  return first !== null && first !== zeroAddress ? first : (second ?? undefined)
}
