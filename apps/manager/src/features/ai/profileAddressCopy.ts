import { getMainReceivingAddress } from '@/features/profile/components/view/ProfileView.helpers'
import {
  findProfileNetworks,
  getProfileNetwork,
} from '@/features/profile/service/profileFieldRegistry'
import type { ProfileRecords } from '@/features/profile/types'
import { inspectDetailChoice, readDetailChoice } from './actionDetails'
import {
  maskProfileNetworkReference,
  normalizeProfileNetworkWords,
} from './profileValueContext'

export type ProfileAddressCopyTarget = {
  readonly addressCoinType?: number
  readonly mainReceivingAddress?: true
}

const nameToken = /(?:[^\s./:@[\]()]+\.)+[^\s./:@[\]().,!?;]+/gu
const instruction = (query: string) =>
  normalizeProfileNetworkWords(query.replace(nameToken, ''))

export const findAddressCopyNetworks = (query: string) => {
  const text = instruction(query)
  const networks = findProfileNetworks(text)
  const ethereum = getProfileNetwork(60)
  return ethereum && /\b(?:ethereum|eth)\b/i.test(text)
    ? [ethereum, ...networks]
    : networks
}

export const hasExplicitAddressCopyOperation = (query: string): boolean => {
  const text = instruction(query)
  return (
    /\b(?:address|addr)\b/i.test(text) &&
    /\b(?:copy|cpy|copi|clipboard)\b/i.test(text) &&
    !/\b(?:set|edit|update|replace|reuse|into|onto)\b/i.test(text)
  )
}

/** Account for the complete read-only clause before accepting a clipboard action. */
const isCompleteAddressCopyClause = (query: string): boolean => {
  if (/\b[a-z][a-z\d+.-]*:\/\/|@|\b0x[\da-f]+\b/i.test(query)) return false
  let clause = normalizeProfileNetworkWords(query)
    .replace(nameToken, '[NAME]')
    .replace(/[’‘]/g, "'")
    .replace(
      /^\s*(?:(?:please|pls|plz)\s+)?(?:(?:can|could|would|will)\s+(?:you\s+)?(?:please\s+)?)?/i,
      '',
    )
    .replace(/\s+(?:please|pls|plz)[.!?]*$/i, '')
    .trim()
  if (!/^(?:copy|cpy|copi|put)\b/i.test(clause)) return false
  if (/^put\b/i.test(clause) && !/\bclipboard\b/i.test(clause)) return false
  clause = clause.replace(/^(?:copy|cpy|copi|put)\s+/i, '')
  if (!/\b(?:address|addr)\b/i.test(clause)) return false
  for (const { coinType } of findAddressCopyNetworks(query))
    clause = maskProfileNetworkReference(clause, coinType)
  // Exact-name alternatives can be clarified; conjunctions and new operations cannot.
  clause = clause.replace(/\[NAME\]\s+or\s+\[NAME\]/gi, '[NAME]')
  if (
    /\b(?:a|an|the|my|its|current|existing|from|of|for|on|in|to|at)\s*[.!?]*$/i.test(
      clause,
    )
  )
    return false
  return (
    clause
      .replace(/\[(?:NETWORK|NAME)\]/g, '')
      .replace(
        /\b(?:a|an|the|my|its|current|existing|from|of|for|on|in|to|at|profile|ens|address|addr|record|main|default|receiving|clipboard)\b/gi,
        '',
      )
      .replace(/[\s.!?,;:'"“”()]/g, '') === ''
  )
}

export const buildProfileAddressCopyQuestion = (query: string) => ({
  type: 'choice',
  instructions:
    'For copying an address FROM an ENS profile to the clipboard, which existing network address does the user explicitly request? Copying to another profile or network record is an edit, not clipboard copying. Select only a listed network that is explicitly mentioned, or main only for an explicit main/default receiving address. Never substitute the connected wallet. A missing network needs clarification; multiple networks or an unlisted explicit network are unsupported.',
  criteria: {
    ...Object.fromEntries(
      findAddressCopyNetworks(query).map(({ coinType, name }) => [
        `coin_${coinType}`,
        name,
      ]),
    ),
    main: 'The explicitly requested main/default receiving address.',
    missing: 'No network or main receiving address is specified.',
    unsupported:
      'Another explicit network, multiple networks, or a different destination.',
  },
})

export const parseProfileAddressCopyTarget = (
  query: string,
  answers: Record<string, unknown>,
): ProfileAddressCopyTarget | null => {
  const text = instruction(query)
  if (
    !isCompleteAddressCopyClause(query) ||
    /\b(?:set|edit|update|replace|reuse|into|onto|send|email|recipient|if|unless|when|tomorrow|later|all|every)\b/i.test(
      text,
    ) ||
    /\bto\s+(?!(?:(?:my|the|a)\s+)?clipboard\b)/i.test(text)
  )
    return null
  const networks = findAddressCopyNetworks(query)
  const main =
    /\b(?:main|default)\s+(?:receiving\s+)?address\b|\bmain\s+receiving\b/i.test(
      text,
    )
  if (networks.length > 1 || (main && networks.length > 0)) return null
  const choice = readDetailChoice(answers, 'manager_address_network', [
    ...networks.map(({ coinType }) => `coin_${coinType}`),
    'main',
    'missing',
    'unsupported',
  ])
  if (main) return choice === 'main' ? { mainReceivingAddress: true } : null
  const coinType = networks[0]?.coinType
  if (coinType !== undefined)
    return choice === `coin_${coinType}` ? { addressCoinType: coinType } : null
  return choice === 'missing' ? {} : null
}

/** Complete local clause coverage can corroborate a weak matching scope vote. */
export const hasCompleteProfileAddressCopyRequest = (
  query: string,
  answers: Record<string, unknown>,
): boolean =>
  inspectDetailChoice(answers.manager_constraints, ['represented'])?.choice ===
    'represented' &&
  hasExplicitAddressCopyOperation(query) &&
  parseProfileAddressCopyTarget(query, answers) !== null

export type ProfileAddressCopyResult =
  | {
      readonly status: 'ready'
      readonly value: string
      readonly network: string
    }
  | { readonly status: 'unavailable'; readonly message: string }

/** Select only current profile data. The connected wallet is never a fallback. */
export const resolveProfileAddressCopy = (
  records: ProfileRecords,
  target: ProfileAddressCopyTarget,
): ProfileAddressCopyResult => {
  if (target.mainReceivingAddress && target.addressCoinType !== undefined)
    return { status: 'unavailable', message: 'Choose one address to copy.' }
  const network = getProfileNetwork(target.addressCoinType)
  if (!target.mainReceivingAddress && !network)
    return {
      status: 'unavailable',
      message: 'Choose a supported address network.',
    }
  const matches = target.mainReceivingAddress
    ? [getMainReceivingAddress(records)].filter((value) => value !== undefined)
    : records.addresses.filter(
        ({ coinType, value }) =>
          coinType === target.addressCoinType && value.trim() !== '',
      )
  if (matches.length !== 1 || !matches[0]?.value.trim())
    return {
      status: 'unavailable',
      message:
        'This profile does not have one current address for that selection.',
    }
  return {
    status: 'ready',
    value: matches[0].value,
    network: target.mainReceivingAddress
      ? 'Main receiving address'
      : (network?.name ?? ''),
  }
}

export const loadProfileAddressCopy = async (
  target: ProfileAddressCopyTarget & { readonly name: string },
  context: {
    readonly assertCurrent: () => void
    readonly readRecords: (name: string) => Promise<ProfileRecords>
  },
): Promise<ProfileAddressCopyResult> => {
  context.assertCurrent()
  const records = await context.readRecords(target.name)
  context.assertCurrent()
  return resolveProfileAddressCopy(records, target)
}
