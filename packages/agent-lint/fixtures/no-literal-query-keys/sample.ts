declare const createQueryKey: (name: string, params: object) => unknown
export const a = { queryKey: ['profile', 'x'], queryFn: () => 1 } // expect: no-literal-query-keys
export const b = { queryKey: ['profile', 'x'] as const, queryFn: () => 1 } // expect: no-literal-query-keys
export const prefix = { queryKey: ['profile'] }
export const c = { queryKey: createQueryKey('profile', { name: 'x' }), queryFn: () => 1 }
