import type { Result, Ok, Err } from 'neverthrow'

/**
 * Helper function to handle neverthrow Result types with callbacks
 * This is simpler and more type-safe than using ts-pattern with Result types
 */
export function handleResult<T, E>(
  result: Result<T, E>,
  handlers: {
    onOk: (value: T) => void
    onErr: (error: E) => void
  }
): void {
  if (result.isOk()) {
    const okResult = result as Ok<T, E>
    handlers.onOk(okResult.value)
  } else {
    const errResult = result as Err<T, E>
    handlers.onErr(errResult.error)
  }
}

/**
 * Async version of handleResult
 */
export async function handleResultAsync<T, E>(
  result: Result<T, E>,
  handlers: {
    onOk: (value: T) => Promise<void> | void
    onErr: (error: E) => Promise<void> | void
  }
): Promise<void> {
  if (result.isOk()) {
    const okResult = result as Ok<T, E>
    await handlers.onOk(okResult.value)
  } else {
    const errResult = result as Err<T, E>
    await handlers.onErr(errResult.error)
  }
}
