declare const load: () => { isErr(): boolean; value: number }
declare const ping: () => Promise<void>
export const a = {
  queryFn: async () => {
    try { // expect: no-try-in-query-fn
      const r = load()
      return r.isErr() ? 0 : r.value
    } catch {
      return 0
    }
  },
}
export const bestEffort = {
  queryFn: async () => {
    try {
      await ping()
      return true
    } catch {
      return false
    }
  },
}
