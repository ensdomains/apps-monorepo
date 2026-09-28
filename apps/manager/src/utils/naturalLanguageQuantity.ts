const units = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
} as const
const numberWords = Object.keys(units).join('|')
const wordQuantity = `(?:${numberWords})(?:[ -]+(?:hundred|thousand|and|${numberWords}))*`
const quantityPattern = new RegExp(
  `(?<![\\p{L}\\p{N}_.])(-?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|${wordQuantity}|(?:an?|another)(?:\\s+(?:extra|additional))?(?=\\s+(?:day|week|year)\\b))(?![\\p{L}\\p{N}_.])`,
  'giu',
)

const readNumberWord = (word: string | undefined): number | undefined =>
  word && Object.hasOwn(units, word)
    ? units[word as keyof typeof units]
    : undefined

const parseBelowHundred = (words: readonly string[]): number => {
  const first = readNumberWord(words[0])
  if (words.length === 1 && first !== undefined) return first
  const second = readNumberWord(words[1])
  return words.length === 2 &&
    first !== undefined &&
    first >= 20 &&
    first % 10 === 0 &&
    second !== undefined &&
    second >= 1 &&
    second <= 9
    ? first + second
    : Number.NaN
}

const parseBelowThousand = (words: readonly string[]): number => {
  if (!words.includes('hundred')) return parseBelowHundred(words)
  const first = readNumberWord(words[0])
  if (words[1] !== 'hundred' || first === undefined || first > 9)
    return Number.NaN
  const rest = words.slice(words[2] === 'and' ? 3 : 2)
  if (words[2] === 'and' && rest.length === 0) return Number.NaN
  return first * 100 + (rest.length ? parseBelowHundred(rest) : 0)
}

const parseNumberWords = (text: string): number => {
  if (/^-?\d/.test(text)) return Number(text.replaceAll(',', ''))
  if (/^(?:an?|another)(?:\s+(?:extra|additional))?$/i.test(text)) return 1
  const words = text.toLowerCase().split(/[ -]+/)
  const split = words.indexOf('thousand')
  if (split < 0) return parseBelowThousand(words)
  const first = parseBelowThousand(words.slice(0, split))
  const remaining = words.slice(split + 1)
  const rest = remaining[0] === 'and' ? remaining.slice(1) : remaining
  if (remaining[0] === 'and' && rest.length === 0) return Number.NaN
  return first * 1000 + (rest.length ? parseBelowThousand(rest) : 0)
}

export const maskNameTokens = (query: string): string =>
  query.replace(/\S*\.[\p{L}][\p{L}\p{N}-]*\S*/gu, (name) =>
    ' '.repeat(name.length),
  )

export const getQuantityCandidates = (query: string) =>
  [...maskNameTokens(query).matchAll(quantityPattern)].map((match, index) => ({
    id: `amount_${index + 1}`,
    value: parseNumberWords(match[0]),
    text: match[0],
    index: match.index,
  }))

export const hasInvalidQuantitySyntax = (
  query: string,
  candidates: ReturnType<typeof getQuantityCandidates>,
): boolean =>
  /\b(?:half|halves|quarter|quarters|point|million|billion)\b/i.test(
    maskNameTokens(query),
  ) ||
  candidates.some(({ index }) =>
    /(?:[-−﹣－]\s*|\b(?:minus|negative)\s+)$/i.test(query.slice(0, index)),
  )
