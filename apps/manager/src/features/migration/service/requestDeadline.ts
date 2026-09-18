/** Bound a request without allowing late results to outlive its caller. */
export const withRequestDeadline = async <T>(
  request: (signal: AbortSignal) => Promise<T>,
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<T> => {
  const controller = new AbortController()
  const abortFromCaller = () => controller.abort(options.signal?.reason)
  if (options.signal?.aborted) abortFromCaller()
  else
    options.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    options.timeoutMs ?? 15_000,
  )
  let rejectAborted: (() => void) | undefined
  try {
    controller.signal.throwIfAborted()
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = () => reject(controller.signal.reason)
      controller.signal.addEventListener('abort', rejectAborted, { once: true })
    })
    return await Promise.race([request(controller.signal), aborted])
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortFromCaller)
    if (rejectAborted)
      controller.signal.removeEventListener('abort', rejectAborted)
    // A failed parallel dependency must not leave sibling requests running.
    controller.abort()
  }
}
