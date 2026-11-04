declare const a: { readonly isLoading: boolean; readonly isError: boolean; readonly error: Error | null }
declare const b: { readonly isLoading: boolean; readonly isError: boolean; readonly error: Error | null }
declare const saveMutation: { readonly error: Error | null }
declare const deleteMutation: { readonly error: Error | null }
export const failed = a.error || b.error // expect: no-or-grouped-query-states
export const broken = a.isError || b.isError // expect: no-or-grouped-query-states
export const loading = a.isLoading || b.isLoading
export const mutating = saveMutation.error || deleteMutation.error
