import * as fc from 'fast-check'
import { type Hex, keccak256, stringToBytes } from 'viem'

const ASCII_LOWERCASE = [...'abcdefghijklmnopqrstuvwxyz']
const ASCII_DIGITS = [...'0123456789']
const LABEL_CHARACTERS = [...ASCII_LOWERCASE, ...ASCII_DIGITS]
const HEX_CHARACTERS = [...ASCII_DIGITS, ...'abcdef']
const ZERO_WIDTH_CHARACTERS = ['\u200b', '\u200c', '\u200d'] as const
const NFC_LABELS = ['café', 'mañana', 'über'] as const

const labelCharacterArbitrary = fc.constantFrom(...LABEL_CHARACTERS)

const asciiLabelArbitrary = (minLength: number) =>
  fc
    .tuple(
      labelCharacterArbitrary,
      fc.string({
        unit: labelCharacterArbitrary,
        minLength: Math.max(0, minLength - 2),
        maxLength: 61,
      }),
      labelCharacterArbitrary,
    )
    .map(([first, middle, last]) => `${first}${middle}${last}`)

const registrableLabelWithLetterArbitrary = fc
  .tuple(asciiLabelArbitrary(3), fc.constantFrom(...ASCII_LOWERCASE), fc.nat())
  .map(([label, letter, index]) => {
    const replacementIndex = index % label.length
    return `${label.slice(0, replacementIndex)}${letter}${label.slice(replacementIndex + 1)}`
  })

const toFullwidth = (value: string): string =>
  [...value]
    .map((character) =>
      /[a-z0-9]/.test(character)
        ? String.fromCharCode(character.charCodeAt(0) + 0xfee0)
        : character,
    )
    .join('')

const normalizedLabelArbitrary = fc.oneof(
  labelCharacterArbitrary,
  asciiLabelArbitrary(2),
)

const registrableLabelArbitrary = asciiLabelArbitrary(3)

export interface UnicodeNormalizationPair {
  readonly normalized: string
  readonly decomposed: string
}

const unicodeNormalizationPairArbitrary: fc.Arbitrary<UnicodeNormalizationPair> =
  fc.constantFrom(...NFC_LABELS).map((normalized) => ({
    normalized,
    decomposed: normalized.normalize('NFD'),
  }))

const literalDottedLabelArbitrary = fc
  .tuple(normalizedLabelArbitrary, normalizedLabelArbitrary)
  .map(([left, right]) => `${left}.${right}`)

const hexShapedLabelArbitrary = fc
  .string({
    unit: fc.constantFrom(...HEX_CHARACTERS),
    minLength: 1,
    maxLength: 61,
  })
  .map((hex) => `0x${hex}`)

const nonNormalizedLabelArbitrary = fc.oneof(
  registrableLabelWithLetterArbitrary.map((label) => label.toUpperCase()),
  registrableLabelArbitrary.map(toFullwidth),
  fc
    .tuple(registrableLabelArbitrary, fc.constantFrom(...ZERO_WIDTH_CHARACTERS))
    .map(
      ([label, character]) =>
        `${label.slice(0, 1)}${character}${label.slice(1)}`,
    ),
  unicodeNormalizationPairArbitrary.map(({ decomposed }) => decomposed),
)

const encodedLabelhashArbitrary = fc
  .string({
    unit: fc.constantFrom(...HEX_CHARACTERS),
    minLength: 64,
    maxLength: 64,
  })
  .map((hash) => `[${hash}]`)

export interface EncodedLabelhashCollision {
  readonly sourceLabel: string
  readonly sourceLabelhash: Hex
  readonly encodedLabel: string
}

const encodedLabelhashCollisionArbitrary: fc.Arbitrary<EncodedLabelhashCollision> =
  normalizedLabelArbitrary.map((sourceLabel) => {
    const sourceLabelhash = keccak256(stringToBytes(sourceLabel))

    return {
      sourceLabel,
      sourceLabelhash,
      encodedLabel: `[${sourceLabelhash.slice(2)}]`,
    }
  })

const registrableEthNameArbitrary = registrableLabelArbitrary.map(
  (label) => `${label}.eth`,
)

const subnameArbitrary = fc
  .tuple(
    fc.array(normalizedLabelArbitrary, { minLength: 1, maxLength: 4 }),
    registrableLabelArbitrary,
  )
  .map(([subLabels, secondLevelLabel]) =>
    [...subLabels, secondLevelLabel, 'eth'].join('.'),
  )

export const ensNameArbitraries = {
  labels: {
    normalized: normalizedLabelArbitrary,
    registrable: registrableLabelArbitrary,
    nonNormalized: nonNormalizedLabelArbitrary,
    hexShaped: hexShapedLabelArbitrary,
    literalWithDot: literalDottedLabelArbitrary,
    encodedLabelhash: encodedLabelhashArbitrary,
  },
  relatedLabels: {
    unicodeNormalization: unicodeNormalizationPairArbitrary,
    encodedLabelhashCollision: encodedLabelhashCollisionArbitrary,
  },
  names: {
    registrableEth: registrableEthNameArbitrary,
    subname: subnameArbitrary,
  },
} as const
