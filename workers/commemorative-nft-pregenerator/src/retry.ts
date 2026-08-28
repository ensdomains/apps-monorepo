export type RetryOptions = {
  readonly attempts: number
  readonly baseDelayMs: number
  readonly isRetryable?: (error: unknown) => boolean
  readonly sleep?: (delayMs: number) => Promise<void>
}

const defaultSleep = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs))

const validateRetryOptions = (options: RetryOptions): void => {
  if (!Number.isSafeInteger(options.attempts) || options.attempts <= 0) {
    throw new Error('Retry attempts must be a positive integer')
  }
  if (!Number.isSafeInteger(options.baseDelayMs) || options.baseDelayMs < 0) {
    throw new Error('Retry base delay must be a non-negative integer')
  }
}

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: RetryOptions,
): Promise<T> => {
  validateRetryOptions(options)
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const isLastAttempt = attempt === options.attempts
      const isRetryable = options.isRetryable?.(error) ?? true
      if (isLastAttempt || !isRetryable) throw error

      await sleep(options.baseDelayMs * 2 ** (attempt - 1))
    }
  }

  throw new Error('Retry operation exhausted unexpectedly')
}
