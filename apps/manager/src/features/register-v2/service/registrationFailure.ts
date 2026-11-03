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

// The orchestrator's emissary reports any validator rejection of an intent
// this way, a session the owner revoked included. It wraps other causes too,
// so it only says "the session was revoked" next to a revoke on this page.
const INVALID_SIGNATURE_SELECTOR = toFunctionSelector('InvalidSignature()')
const INVALID_SIGNATURE_IN_TEXT = new RegExp(
  `InvalidSignature\\(\\)|(?<![0-9a-f])${INVALID_SIGNATURE_SELECTOR}(?![0-9a-f])`,
  'i',
)

const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}

// Reads the SDK error's `context`. A `TransactionSubmissionError` keeps the SDK
// error as its `cause`, so the cause chain reaches it without a second parser.
const isInvalidSignatureRejection = (error: Error): boolean => {
  const context = asRecord(asRecord(error).context)
  return (
    context.category === 'INVALID_SIGNATURE' ||
    context.errorSelector === INVALID_SIGNATURE_SELECTOR ||
    INVALID_SIGNATURE_IN_TEXT.test(error.message)
  )
}

/** The orchestrator refused an intent's signature (`InvalidSignature()`). */
export const isInvalidSignatureError = (error: unknown): boolean =>
  causeChain(error).some(isInvalidSignatureRejection)

/**
 * The run failed because smart session access was reset on this page. A
 * refused signature alone isn't enough, since `InvalidSignature()` also wraps
 * policy failures. A reset alone isn't enough either: the run may have failed
 * for another reason.
 */
export const isSessionRevokedFailure = (params: {
  readonly isSessionAccessReset: boolean
  readonly isSignatureRejected: boolean
}): boolean => params.isSessionAccessReset && params.isSignatureRejected

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
