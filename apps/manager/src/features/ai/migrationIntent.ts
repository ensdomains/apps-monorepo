import { hasNegatedAction, readDetailChoice } from './actionDetails'
import { isExplicitlyExcludedAiTarget } from './actionSafety'

export type MigrationIntent = {
  readonly intent: 'migrate'
  readonly excludeManagerRestoration: boolean
  readonly allEligible?: true
  readonly names?: readonly string[]
}

export const buildMigrationQuestions = () => ({
  migration_restoration: {
    type: 'choice' as const,
    instructions:
      'For a request to UPGRADE/MIGRATE ENSv1 names to ENSv2, what selection condition concerns restoring managers? Understand ordinary paraphrases and typos. Exclude means leave out names whose manager needs restoring: without restoring managers, skip manager restoration, avoid the manager-restoration ones, or leave out ones whose manager must be restored. That is ONE positive migration operation with a subset exclusion, not a second restore operation or a prohibition on migration. Choose only when the user wants ONLY names needing restoration, or excludes names that DO NOT need restoration; this direction is unsupported. Choose none when no restoration condition is mentioned. Do not confuse excluding a restoration subset with excluding an exact name, favourites, expiry, price, or another condition. Those extra conditions are checked independently. Choose unclear for conflicting restoration directions, explicitly negated migration, or a separate request to restore managers.',
    criteria: {
      none: 'No requirement concerning manager restoration.',
      exclude:
        'Migrate names while excluding those that need manager restoration.',
      only: 'Select names needing restoration rather than excluding them.',
      unclear:
        'Conflicting direction, negated migration, or a separate restoration action.',
    },
  },
})

const aliases: Readonly<Record<string, string>> = {
  domains: 'names',
  domain: 'names',
  name: 'names',
  every: 'all',
  managers: 'manager',
  restoration: 'restore',
  restoring: 'restore',
  restored: 'restore',
  excluding: 'exclude',
  except: 'exclude',
  without: 'exclude',
  skip: 'exclude',
  skipping: 'exclude',
  omit: 'exclude',
  avoid: 'exclude',
  leaving: 'leave',
  needs: 'need',
  needing: 'need',
  requiring: 'require',
  requires: 'require',
  ensv1: 'v1',
  ensv2: 'v2',
}
const spellingVocabulary: ReadonlySet<string> = new Set([
  'upgrade',
  'migrate',
  'eligible',
  'manager',
  'managers',
  'restoration',
  'restoring',
  'restored',
  'exclude',
  'excluding',
  'leaving',
])

// Correct one edit in a bounded semantic vocabulary, never in exact ENS names.
const isSingleEdit = (word: string, candidate: string): boolean => {
  if (Math.abs(word.length - candidate.length) > 1) return false
  if (word.length !== candidate.length) {
    const [short, long] =
      word.length < candidate.length ? [word, candidate] : [candidate, word]
    let index = 0
    while (index < short.length && short[index] === long[index]) index += 1
    return short.slice(index) === long.slice(index + 1)
  }
  const differences = [...word].flatMap((letter, index) =>
    letter === candidate[index] ? [] : [index],
  )
  if (differences.length <= 1) return true
  const [first, second] = differences
  return (
    differences.length === 2 &&
    first !== undefined &&
    second === first + 1 &&
    word[first] === candidate[second] &&
    word[second] === candidate[first]
  )
}
const normalizeWord = (word: string): string => {
  const direct = Object.hasOwn(aliases, word) ? aliases[word] : undefined
  if (direct) return direct
  if (word.length < 5 || spellingVocabulary.has(word)) return word
  const matches = [...spellingVocabulary].filter((candidate) =>
    isSingleEdit(word, candidate),
  )
  const meanings = [
    ...new Set(
      matches.map((candidate) =>
        Object.hasOwn(aliases, candidate)
          ? (aliases[candidate] ?? candidate)
          : candidate,
      ),
    ),
  ]
  return meanings.length === 1 ? (meanings[0] ?? word) : word
}
const instructionWords = (query: string): readonly string[] =>
  (
    query
      .toLowerCase()
      .replace(/\[ens_name(?:_\d+)?\]|[^\s/@]+\.[^\s/@]+/gu, ' ens_name ')
      .match(/[\p{L}\p{N}_]+(?:['’][\p{L}\p{N}]+)?/gu) ?? []
  ).map(normalizeWord)

const politeWords = new Set([
  'please',
  'can',
  'could',
  'would',
  'you',
  'we',
  'i',
  'like',
  'to',
  'help',
  'me',
])
const targetWords = new Set([
  'all',
  'my',
  'the',
  'our',
  'of',
  'these',
  'those',
  'selected',
  'eligible',
  'v1',
  'ens',
  'names',
  'ens_name',
  'and',
  'please',
])
const restorationWords = new Set([
  'the',
  'any',
  'all',
  'anything',
  'ones',
  'those',
  'names',
  'that',
  'which',
  'whose',
  'need',
  'require',
  'a',
  'their',
  'having',
  'to',
  'be',
  'with',
  'must',
  'have',
  'has',
  'for',
  'manager',
  'restore',
])
const conjunctions = new Set(['and', 'but'])

const findExclusion = (
  words: readonly string[],
): { index: number; length: number } | undefined => {
  for (let index = 0; index < words.length; index += 1) {
    if (words[index] === 'exclude') return { index, length: 1 }
    if (words[index] === 'leave' && words[index + 1] === 'out')
      return { index, length: 2 }
  }
  return undefined
}

const hasMigrationOperation = (words: readonly string[]): boolean => {
  const operation = words.findIndex(
    (word) => word === 'upgrade' || word === 'migrate' || word === 'move',
  )
  if (
    operation < 0 ||
    !words.slice(0, operation).every((word) => politeWords.has(word))
  )
    return false
  const verbLength =
    words[operation] === 'move' && words[operation + 1] === 'over' ? 2 : 1
  const selection = [...words.slice(operation + verbLength)]
  if (words[operation] === 'move' && verbLength === 1) {
    if (selection.at(-1) !== 'over') return false
    selection.pop()
  }
  // A destination version is separate from selecting source ENSv2 names.
  const destination = selection.findIndex(
    (word, index) =>
      (word === 'to' || word === 'into') &&
      (selection[index + 1] === 'v2' ||
        (selection[index + 1] === 'ens' && selection[index + 2] === 'v2')),
  )
  if (destination >= 0)
    selection.splice(destination, selection[destination + 1] === 'ens' ? 3 : 2)
  return selection.every((word) => targetWords.has(word))
}

type MigrationClause = { readonly excludesRestoration: boolean }

/** Account for every word in each clause before using it to settle weak metadata. */
const inspectMigrationClause = (query: string): MigrationClause | null => {
  const words = instructionWords(query)
  const boundary = findExclusion(words)
  if (!boundary)
    return hasMigrationOperation(words) ? { excludesRestoration: false } : null
  const main = [...words.slice(0, boundary.index)]
  if (conjunctions.has(main.at(-1) ?? '')) main.pop()
  const exclusion = words.slice(boundary.index + boundary.length)
  if (
    !hasMigrationOperation(main) ||
    !exclusion.includes('manager') ||
    !exclusion.includes('restore') ||
    !exclusion.every((word) => restorationWords.has(word))
  )
    return null
  return { excludesRestoration: true }
}

const hasUnsupportedMigrationRequirement = (
  words: readonly string[],
): boolean => {
  const instruction = words
    .join(' ')
    .replace(/\b(?:to|into|eligible for) (?:ens )?v2\b/g, '')
  return (
    hasNegatedAction(instruction) ||
    /\b(?:not|never|don['’]t)\b/i.test(instruction) ||
    /\b(?:favou?rit\w*|starred|bookmarked|primary|own|owner|owned|expir\w*|grace|price|cost|cheap\w*|ineligible|v2|sort\w*|custom|qualifiers?|fees?|free|dollars?|tomorrow|today|before|after|if|unless|only when|resolver|permissions?)\b/i.test(
      instruction,
    ) ||
    /\b(?:renew|extend|register|set|transfer|sell|burn|delete|copy|share|revoke|claim|mint)\b/i.test(
      instruction,
    )
  )
}

const readRestorationSelection = (
  hasRestorationCue: boolean,
  answers: Record<string, unknown>,
) => {
  if (answers.migration_restoration === undefined) return undefined
  const selected = readDetailChoice(answers, 'migration_restoration', [
    'none',
    'exclude',
    'only',
    'unclear',
  ])
  if (selected) return selected
  return !hasRestorationCue &&
    isWeakOrMatchingChoice(answers.migration_restoration, 'none', ['none'])
    ? 'none'
    : null
}

const semanticMigrationClause = (
  words: readonly string[],
  answers: Record<string, unknown>,
): MigrationClause | null => {
  const boundary = findExclusion(words)
  const hasRestorationCue =
    !!boundary || words.includes('restore') || words.includes('manager')
  const restoration = readRestorationSelection(hasRestorationCue, answers)
  if (
    restoration === null ||
    restoration === 'only' ||
    restoration === 'unclear'
  )
    return null
  if (!boundary) {
    if (
      restoration === 'exclude' ||
      words.includes('restore') ||
      words.includes('manager') ||
      hasUnsupportedMigrationRequirement(words)
    )
      return null
    return { excludesRestoration: false }
  }
  const main = words.slice(0, boundary.index)
  const exclusion = words.slice(boundary.index + boundary.length)
  if (
    restoration === 'none' ||
    hasUnsupportedMigrationRequirement(main) ||
    hasUnsupportedMigrationRequirement(exclusion) ||
    !exclusion.includes('manager') ||
    !exclusion.includes('restore') ||
    /\b(?:doesn|don|won|wouldn|shouldn|couldn|can|isn|aren|wasn|weren|haven|hasn|hadn)['’]t\b/i.test(
      exclusion.join(' '),
    ) ||
    exclusion.some((word) =>
      [
        'not',
        'no',
        'neither',
        'cannot',
        "can't",
        'unable',
        'and',
        'then',
        'also',
        'but',
        "don't",
        'never',
        'only',
        'include',
        'including',
        'ens_name',
        'exclude',
        'leave',
      ].includes(word),
    )
  )
    return null
  // A present semantic facet handles ordinary relative-clause wording. Older
  // captures can establish the exclusion only from a fully represented clause.
  if (
    restoration === undefined &&
    !exclusion.every((word) => restorationWords.has(word))
  )
    return null
  return { excludesRestoration: true }
}

export const parseMigrationIntent = (
  query: string,
  answers: Record<string, unknown>,
  names: readonly string[] = [],
): MigrationIntent | null => {
  if (names.some((name) => isExplicitlyExcludedAiTarget(query, name)))
    return null
  if (
    answers.migration_constraints !== undefined &&
    readDetailChoice(answers, 'migration_constraints', [
      'represented',
      'unsupported',
    ]) !== 'represented'
  )
    return null
  const words = instructionWords(query)
  if (words.includes('or')) return null
  if (words.includes('ens_name') && names.length === 0) return null
  const clause = semanticMigrationClause(words, answers)
  if (!clause) return null
  const requestsAll =
    names.length === 0 && !clause.excludesRestoration && words.includes('all')
  // An explicit wallet-wide selection must not silently fall back to the
  // migration page's default, which omits manager-restoration subtrees.
  if (
    requestsAll &&
    (!inspectMigrationClause(query) ||
      words.some((word) => ['selected', 'those', 'these'].includes(word)))
  )
    return null
  return {
    intent: 'migrate',
    excludeManagerRestoration: clause.excludesRestoration,
    ...(requestsAll && { allEligible: true }),
    ...(names.length > 0 && { names }),
  }
}

const isWeakOrMatchingChoice = (
  answer: unknown,
  expected: string,
  allowed: readonly string[],
): boolean => {
  if (answer === undefined) return true
  if (!answer || typeof answer !== 'object') return false
  const value = answer as Record<string, unknown>
  if (
    value.type !== 'choice' ||
    !allowed.includes(String(value.choice)) ||
    typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  )
    return false
  return value.choice === expected || value.confidence < 0.65
}

/** Only settle weak generic metadata; confident second operations remain authoritative. */
export const isSingleMigrationIntent = (
  query: string,
  answers: Record<string, unknown>,
  names: readonly string[] = [],
): boolean => {
  if (
    !inspectMigrationClause(query) ||
    !parseMigrationIntent(query, answers, names)
  )
    return false
  // A low confidence requested vote can agree with a fully accounted imperative.
  // Explicit negation/unclear never becomes authorization through this helper.
  if (
    !isWeakOrMatchingChoice(answers.request_mode, 'requested', ['requested']) ||
    !isWeakOrMatchingChoice(answers.action_count, 'one', ['one', 'two']) ||
    !isWeakOrMatchingChoice(answers.next_intent, 'none', [
      'none',
      'set_primary',
      'register',
      'renew',
      'find_names',
      'bulk_renew',
      'migrate',
      'edit_profile',
      'notification',
      'favorite',
      'view_name',
      'manager_action',
    ])
  )
    return false
  const multi = answers.multi_action
  if (multi === undefined) return true
  if (!multi || typeof multi !== 'object') return false
  const value = multi as Record<string, unknown>
  return (
    value.type === 'noul' &&
    typeof value.noul === 'number' &&
    Number.isFinite(value.noul) &&
    value.noul >= 0 &&
    value.noul < 0.7
  )
}
