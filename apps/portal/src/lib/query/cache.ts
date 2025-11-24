export const REGISTRY_CACHE = {
  staleTime: 60_000, // 1 min fresh
  gcTime: 10 * 60_000, // 10 min in cache
  refetchOnWindowFocus: false,
  retry: 1,
} as const
