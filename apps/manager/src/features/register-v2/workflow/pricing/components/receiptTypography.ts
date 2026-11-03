import { tw } from '@/utils/tailwind'

// Figma's receipt type: -1% tracking, no contextual alternates and #232222 have no theme tokens.

/** A figure's label, as in the design's receipts. */
export const RECEIPT_LABEL = tw`text-ens-quartz-400 text-lg leading-none tracking-[-0.18px] [font-feature-settings:'calt'_0]`

export const RECEIPT_AMOUNT = tw`text-[#232222] text-xl leading-none tracking-[-0.2px]`
