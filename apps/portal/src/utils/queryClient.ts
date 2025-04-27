import { QueryClient } from '@tanstack/react-query'
import { Duration } from 'effect'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Duration.toMillis('1 hour'),
    },
  },
})
