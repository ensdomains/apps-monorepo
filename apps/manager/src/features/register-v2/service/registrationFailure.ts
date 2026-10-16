import { getDestinationContracts } from '@ens-apps/smart-account'
import {
  type Address,
  isAddressEqual,
  labelhash,
  type PublicClient,
  toFunctionSelector,
  zeroAddress,
} from 'viem'
import {
  registryGetStateAbi,
  STATUS_REGISTERED,
} from './orphanRegistrationCleanup'

// The registrar reverts with this once the label is taken, from both
// `getRegisterPrice` and `register`. Our ABIs don't declare it, so viem only
// reports the raw selector.
const NAME_NOT_AVAILABLE_SELECTOR = toFunctionSelector(
  'NameNotAvailable(string)',
)
const NAME_NOT_AVAILABLE_IN_TEXT = new RegExp(
  `(?<![0-9a-f])${NAME_NOT_AVAILABLE_SELECTOR}`,
  'i',
)
const MAX_CAUSE_DEPTH = 10

const causeChain = (error: unknown): readonly Error[] => {
  const chain: Error[] = []
  let current: unknown = error
  while (current instanceof Error && chain.length < MAX_CAUSE_DEPTH) {
    chain.push(current)
    current = current.cause
  }
  return chain
}

const startsWithSelector = (value: unknown): boolean =>
  typeof value === 'string' &&
  value.toLowerCase().startsWith(NAME_NOT_AVAILABLE_SELECTOR)

const isNameNotAvailableRevert = (error: Error): boolean => {
  const fields = error as unknown as Record<string, unknown>
  const data = fields.data
  const decodedName =
    typeof data === 'object' && data !== null
      ? (data as Record<string, unknown>).errorName
      : undefined

  return (
    decodedName === 'NameNotAvailable' ||
    [fields.signature, fields.raw, data].some(startsWithSelector) ||
    NAME_NOT_AVAILABLE_IN_TEXT.test(error.message)
  )
}

/** The registrar refused because someone else already holds the name. */
export const isNameNotAvailableError = (error: unknown): boolean =>
  causeChain(error).some(isNameNotAvailableRevert)

/**
 * A readable one-liner for the failure screen. viem's `message` appends the
 * contract call, args, docs link and version; `shortMessage` leaves those out.
 */
export const getRegistrationFailureMessage = (
  error: unknown,
): string | undefined => {
  const chain = causeChain(error)
  const [outer] = chain
  if (!outer) return undefined

  const shortMessage = chain
    .map((e) => (e as unknown as Record<string, unknown>).shortMessage)
    .find((value): value is string => typeof value === 'string' && !!value)

  return (shortMessage ?? outer.message).replace(/\s+/g, ' ').trim()
}

/**
 * Whether another address now holds the name, read from the registry.
 * A failed read counts as "no", so the generic failure screen stays.
 */
export const isNameTakenByOther = async (params: {
  readonly label: string
  readonly owner: Address
  readonly chainId: number
  readonly publicClient: PublicClient
}): Promise<boolean> => {
  try {
    const state = await params.publicClient.readContract({
      address: getDestinationContracts(params.chainId).ethRegistry,
      abi: registryGetStateAbi,
      functionName: 'getState',
      args: [BigInt(labelhash(params.label))],
    })

    return (
      Number(state.status) === STATUS_REGISTERED &&
      !isAddressEqual(state.latestOwner, zeroAddress) &&
      !isAddressEqual(state.latestOwner, params.owner)
    )
  } catch {
    return false
  }
}
