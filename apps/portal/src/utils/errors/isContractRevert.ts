/**
 * Whether `error`, or any error in its `cause` chain, carries one of `names`.
 * Matched by name, since class identity does not survive the production build.
 */
export const hasErrorNamed = (
  error: unknown,
  names: ReadonlySet<string>,
): boolean => {
  let current: unknown = error
  for (let depth = 0; depth < 10 && current != null; depth += 1) {
    const { name } = current as { name?: unknown }
    if (typeof name === 'string' && names.has(name)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

const REVERT_ERROR_NAMES: ReadonlySet<string> = new Set([
  'ContractFunctionRevertedError',
  'ExecutionRevertedError',
])

/**
 * Whether the call came back FROM the contract rather than failing to reach it.
 * Deliberately not on a numeric `code`: that would read any unrelated `code: 3`
 * in the chain as a revert, so a transport failure would pass for the
 * contract's answer.
 */
export const isContractRevert = (error: unknown): boolean =>
  hasErrorNamed(error, REVERT_ERROR_NAMES)
