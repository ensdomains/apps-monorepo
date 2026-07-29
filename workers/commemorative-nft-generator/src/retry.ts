export type RetryOptions = {
  readonly attempts: number
  readonly baseDelayMs: number
  readonly isRetryable?: (error: unknown) => boolean
  readonly sleep?: (delayMs: number) => Promise<void>
}

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs))

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  const sleep = options.sleep ?? defaultSleep
  let lastError: unknown

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      const isLastAttempt = attempt === options.attempts
      const isRetryable = options.isRetryable?.(error) ?? true
      if (isLastAttempt || !isRetryable) throw error

      await sleep(options.baseDelayMs * 2 ** (attempt - 1))
    }
  }

  throw lastError
}
