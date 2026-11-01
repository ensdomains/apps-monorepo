import { err, fromPromise, fromThrowable } from 'neverthrow'

declare const request: Promise<Response>
declare class FetchFailed extends Error {
  constructor(args: { cause: unknown })
}

export const normalised = request.catch((cause: unknown) =>
  cause instanceof Error ? cause : new Error(String(cause)), // expect: no-bare-error-value
)
export const mapped = fromPromise(request, (cause) => new Error(String(cause))) // expect: no-bare-error-value
export const asString = fromPromise(request, () => 'the request failed') // expect: no-bare-error-value
export const asTemplate = fromThrowable(JSON.parse, (cause) => `not JSON: ${String(cause)}`) // expect: no-bare-error-value
export const failed = () => err(new TypeError('bad input')) // expect: no-bare-error-value

// Passes: a tagged class, a throw (agent/no-throw's), and a check that a value is an Error.
export const tagged = fromPromise(request, (cause) => new FetchFailed({ cause }))
export const rejected = request.then((response) => {
  if (!response.ok) throw new Error(`answered ${response.status}`)
  return response
})
export const isError = (value: unknown): boolean => value instanceof Error
