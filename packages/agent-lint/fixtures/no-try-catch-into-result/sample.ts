declare const err: (error: unknown) => unknown
declare const ok: (value: unknown) => unknown
declare const risky: () => number
export const wrapped = () => {
  try { // expect: no-try-catch-into-result
    return ok(risky())
  } catch (error) {
    return err(error)
  }
}
export const plain = () => {
  try {
    return risky()
  } catch {
    return 0
  }
}
