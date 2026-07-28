import { type CxOptions, cx } from 'class-variance-authority'
import { extendTailwindMerge } from 'tailwind-merge'
import { EnsInvalidChainIdError } from 'viem'

// tailwind-merge only knows Tailwind's default scale, so it classifies our
// custom type classes (theme tokens like `text-ui` and @utility styles like
// `text-entity-name`) as text-COLOR utilities and silently drops them when a
// real color class appears in the same cn() call (e.g. EntityBadge combining
// `text-entity-name` with `text-accent-text`). Register them in the
// font-size group so they only conflict with other type-scale classes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-heading',
        'text-h1',
        'text-h2',
        'text-h3',
        'text-p',
        'text-ui',
        'text-small',
        'text-caps',
        'text-smallcaps',
        'text-entity-base',
        'text-entity-name',
        'text-entity-label',
      ],
    },
  },
})

export function cn(...inputs: CxOptions) {
  return twMerge(cx(inputs))
}

const SLIP44_MSB = 0x80000000

// The chainId → coinType direction has no local counterpart: use
// `evmChainIdToCoinType` from `@ensdomains/address-encoder/utils`. This inverse
// stays local because it special-cases mainnet (coin 60 → chain 1), which the
// library util deliberately does not.
export function fromCoinType(coinType: bigint): number {
  if (coinType === 60n) return 1 // Special case for Ethereum mainnet

  const chainId = Number(coinType & 0x7fffffffn)
  if (chainId >= SLIP44_MSB || chainId < 0)
    throw new EnsInvalidChainIdError({ chainId })

  return chainId
}
