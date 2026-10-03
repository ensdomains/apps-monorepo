import { createFileRoute } from '@tanstack/react-router'
import { isAddress } from 'viem'

export const Route = createFileRoute('/$address')({
  params: {
    // `false` passes the path on to the next candidate route.
    parse: ({ address }) =>
      isAddress(address, { strict: false }) ? { address } : false,
    // Prioritize address over names since addresses are more strict.
    priority: 100,
  },
})
