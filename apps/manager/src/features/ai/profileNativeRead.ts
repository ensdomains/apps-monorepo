import { type Address, getAddress, isAddress, zeroAddress } from 'viem'
import { normalizeProfileName } from '@/features/profile/service/profileName'
import type { ProfileOwnerResult } from '@/features/profile/service/profileOwner'

const nameToken = /(?:[^\s./:@[\]()]+\.)+[^\s./:@[\]().,!?;]+/gu
const normalizeInstruction = (query: string) =>
  query
    .replace(/[’‘]/g, "'")
    .replace(
      /^\s*(?:(?:please|pls|plz)\s+)?(?:(?:can|could|would|will)\s+you\s+(?:please\s+)?)?/i,
      '',
    )
    .replace(/\s+(?:please|pls|plz)[.!?]*$/i, '')
    .replace(/[.!?]+$/, '')
    .trim()

/** Only the connected account's primary name is represented by this action. */
export const hasCompletePrimaryProfileRequest = (query: string): boolean => {
  const text = normalizeInstruction(query)
  if (/\b0x[\da-z]+\b|@|\./i.test(text)) return false
  const primaryName =
    '(?:(?:current|existing|currently\\s+set)\\s+)?primary(?:\\s+ENS)?(?:\\s+name)?'
  const ownAccount =
    '(?:my\\s+(?:connected\\s+)?(?:wallet|account)|the\\s+(?:currently\\s+)?connected\\s+(?:wallet|account))'
  const ownPrimary = `(?:my\\s+${primaryName}|(?:the\\s+)?${primaryName}(?:\\s+profile)?\\s+(?:for|of|on)\\s+${ownAccount})`
  const profile = `(?:${ownPrimary}(?:\\s+profile)?|(?:the\\s+|my\\s+)?profile\\s+(?:for|of)\\s+${ownPrimary})`
  return new RegExp(
    `^(?:open|show|view|see|bring\\s+up|take\\s+me\\s+to|go\\s+to)\\s+(?:me\\s+)?${profile}$`,
    'i',
  ).test(text)
}

/** A full read-only owner-copy clause; receiving/manager addresses are distinct. */
export const hasCompleteProfileOwnerCopyRequest = (query: string): boolean => {
  if (/\b[a-z][a-z\d+.-]*:\/\/|@|\b0x[\da-z]+\b/i.test(query)) return false
  let text = normalizeInstruction(query)
    .replace(nameToken, '[NAME]')
    // These clauses identify the owner; they do not assign an address record.
    .replace(
      /\b(?:address|wallet(?:\s+address)?)\s+(?:that|which)\s+(?:currently\s+)?owns\b/gi,
      'owner address of',
    )
    .replace(/\b((?:ENS\s+)?name)'s(?=\s+(?:current\s+)?owner\b)/gi, '$1')
  if (/\bmy\s+(?:wallet|account)\b|\bconnected\b/i.test(text)) return false
  if (!/^(?:copy|cpy|copi|put)\s+/i.test(text)) return false
  if (/^put\b/i.test(text) && !/\bclipboard\b/i.test(text)) return false
  text = text.replace(/^(?:copy|cpy|copi|put)\s+/i, '')
  if (!/\bowner(?:'s)?\b/i.test(text)) return false
  if (
    /\bowner(?:'s)?\s+(?:ens\s+)?name\b|\bname\s+of\s+(?:the\s+)?owner\b/i.test(
      text,
    )
  )
    return false
  if (/\bto\s+(?!(?:my\s+|the\s+)?clipboard\b)/i.test(text)) return false
  if (/\b(?:a|an|the|my|its|current|from|of|for|on|to)\s*$/i.test(text))
    return false
  text = text.replace(/\[NAME\]\s+or\s+\[NAME\]/gi, '[NAME]')
  if ((text.match(/\[NAME\]/g)?.length ?? 0) > 1) return false
  return (
    text
      .replace(/\[NAME\](?:'s)?/g, '')
      .replace(/\bowner's\b/gi, 'owner')
      .replace(
        /\b(?:a|an|the|my|its|current|existing|from|of|for|on|to|ens|name|profile|owner|wallet|address|addr|clipboard)\b/gi,
        '',
      )
      .replace(/[\s,:'"“”()]/g, '') === ''
  )
}

/** A question about the current owner reads ownership without requesting a copy. */
export const startsProfileOwnerQuestion = (query: string): boolean =>
  /^(?:who\s+(?:(?:currently\s+)?owns\b|is\b.*\bowner\b)|what(?:'s|\s+is)\s+(?:the\s+)?(?:current\s+)?owner\b|(?:show|tell)(?:\s+me)?\s+(?:the\s+)?(?:current\s+)?owner\b)/i.test(
    normalizeInstruction(query),
  )

export const hasCompleteProfileOwnerViewRequest = (query: string): boolean => {
  if (/\b[a-z][a-z\d+.-]*:\/\/|@|\b0x[\da-z]+\b/i.test(query)) return false
  const text = normalizeInstruction(query).replace(nameToken, (value) =>
    value.endsWith("'s") ? "[NAME]'s" : '[NAME]',
  )
  const target = '(?:\\[NAME\\]|(?:(?:an?|the|this|that)\\s+)?(?:ENS\\s+)?name)'
  return new RegExp(
    `^(?:(?:who\\s+(?:currently\\s+)?owns|who\\s+is\\s+(?:the\\s+)?(?:current\\s+)?owner\\s+of|what(?:'s|\\s+is)\\s+(?:the\\s+)?(?:current\\s+)?owner\\s+(?:of|for)|(?:show|tell)(?:\\s+me)?\\s+(?:the\\s+)?(?:current\\s+)?owner\\s+of)\\s+${target}|who\\s+is\\s+\\[NAME\\]'s\\s+(?:current\\s+)?owner)$`,
    'i',
  ).test(text)
}

type ReadContext = { readonly assertCurrent: () => void }
type Unavailable = { readonly status: 'unavailable'; readonly message: string }

/** The native context can briefly retain a previous machine owner on reconnect. */
export const matchesPrimaryProfileWallet = (
  connectedAddress: string | undefined,
  reverseAddress: string | undefined,
): boolean =>
  !!connectedAddress &&
  !!reverseAddress &&
  connectedAddress.toLowerCase() === reverseAddress.toLowerCase()

export const loadPrimaryProfile = async (
  address: Address | undefined,
  context: ReadContext & {
    readonly readPrimaryName: (address: Address) => Promise<string | null>
  },
): Promise<
  { readonly status: 'ready'; readonly name: string } | Unavailable
> => {
  context.assertCurrent()
  if (!address)
    return {
      status: 'unavailable',
      message: 'Connect your wallet to view its primary-name profile.',
    }
  const value = await context.readPrimaryName(address)
  context.assertCurrent()
  if (!value)
    return {
      status: 'unavailable',
      message: 'Your connected wallet does not have a current primary name.',
    }
  const name = normalizeProfileName(value)
  return name
    ? { status: 'ready', name }
    : {
        status: 'unavailable',
        message: 'The current primary name could not be opened.',
      }
}

export const loadProfileOwner = async (
  requestedName: string,
  context: ReadContext & {
    readonly readOwner: (name: string) => Promise<ProfileOwnerResult | null>
  },
): Promise<
  | {
      readonly status: 'ready'
      readonly name: string
      readonly address: Address
    }
  | Unavailable
> => {
  context.assertCurrent()
  const name = normalizeProfileName(requestedName)
  if (!name)
    return {
      status: 'unavailable',
      message: 'Enter a valid ENS name to read its owner.',
    }
  const result = await context.readOwner(name)
  context.assertCurrent()
  const owner = result?.owner
  if (!owner || !isAddress(owner) || owner === zeroAddress)
    return {
      status: 'unavailable',
      message: 'This name does not have a current owner address.',
    }
  return { status: 'ready', name, address: getAddress(owner) }
}
