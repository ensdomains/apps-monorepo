type AnyFn = (...args: never[]) => unknown

export const createIsomorphicFn = () => {
  let clientFn: AnyFn | undefined
  let serverFn: AnyFn | undefined

  const fn = ((...args: never[]) => {
    const implementation =
      typeof window === 'undefined' ? (serverFn ?? clientFn) : clientFn

    return implementation?.(...args)
  }) as AnyFn & {
    client: (implementation: AnyFn) => typeof fn
    server: (implementation: AnyFn) => typeof fn
  }

  fn.client = (implementation) => {
    clientFn = implementation
    return fn
  }

  fn.server = (implementation) => {
    serverFn = implementation
    return fn
  }

  return fn
}

export const createClientOnlyFn = <TArgs extends never[], TResult>(
  implementation: (...args: TArgs) => TResult,
) => {
  return (...args: TArgs) => {
    if (typeof window === 'undefined') return undefined
    return implementation(...args)
  }
}
