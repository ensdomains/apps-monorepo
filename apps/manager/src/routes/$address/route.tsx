import { createFileRoute } from '@tanstack/react-router'
import { type Address, isAddress } from 'viem'

export const Route = createFileRoute('/$address')({
  params: {
    // Returning `false` (instead of throwing) tells the router to skip this
    // route during matching when the param isn't a valid address, so a
    // non-address `/$param` can fall through to the `/$name` route.
    parse: (rawParams): { address: Address } | false => {
      if (!isAddress(rawParams.address, { strict: false })) {
        return false
      }

      return {
        address: rawParams.address,
      }
    },
    // Prioritize address over names since addresses are more strict.
    priority: 100,
  },
})
