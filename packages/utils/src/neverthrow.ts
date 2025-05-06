import { Err, err, ok, Result, ResultAsync, safeTry } from 'neverthrow'

export type InferOkTypes<R> = R extends Result<infer T, unknown> ? T : never
export type InferErrTypes<R> = R extends Result<unknown, infer E> ? E : never

export function ResultFn<T, E, Args extends unknown[]>(
  body: (...args: Args) => Generator<Err<never, E>, Result<T, E>, never>,
): (...args: Args) => Result<T, E>
export function ResultFn<
  YieldErr extends Err<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>,
  Args extends unknown[],
>(
  body: (...args: Args) => Generator<YieldErr, GeneratorReturnResult, never>,
): (
  ...args: Args
) => Result<
  InferOkTypes<GeneratorReturnResult>,
  InferErrTypes<YieldErr> | InferErrTypes<GeneratorReturnResult>
>

export function ResultFn<T, E, Args extends unknown[]>(
  body: (...args: Args) => AsyncGenerator<Err<never, E>, Result<T, E>, never>,
): (...args: Args) => ResultAsync<T, E>
export function ResultFn<
  YieldErr extends Err<never, unknown>,
  GeneratorReturnResult extends Result<unknown, unknown>,
  Args extends unknown[],
>(
  body: (
    ...args: Args
  ) => AsyncGenerator<YieldErr, GeneratorReturnResult, never>,
): (
  ...args: Args
) => ResultAsync<
  InferOkTypes<GeneratorReturnResult>,
  InferErrTypes<YieldErr> | InferErrTypes<GeneratorReturnResult>
>

export function ResultFn<T, E, Args extends unknown[]>(
  body:
    | ((...args: Args) => Generator<Err<never, E>, Result<T, E>, never>)
    | ((...args: Args) => AsyncGenerator<Err<never, E>, Result<T, E>, never>),
): (...args: Args) => Result<T, E> | ResultAsync<T, E> {
  // biome-ignore lint/suspicious/noExplicitAny: Typescript is having issues with it being able to be both async and sync generator
  return (...args: Args) => safeTry(() => body(...args) as any)
}

export function fromSync<T, E>(
  body: () => T,
  errorFn: (e: unknown) => E,
): Result<T, E> {
  try {
    return ok(body())
  } catch (e) {
    return err(errorFn(e))
  }
}

export class YieldableError extends globalThis.Error {
  *[Symbol.iterator](): Generator<Err<never, this>, Result<never, this>> {
    const result = err(this)

    yield result

    return result
  }
}

const plainArgsSymbol = Symbol.for('ens/neverthrow/Data/Error/plainArgs')

export class DataError<
  // biome-ignore lint/complexity/noBannedTypes: Default value
  // biome-ignore lint/suspicious/noExplicitAny: Should be any
  A extends Record<string, any> = {},
> extends YieldableError {
  // biome-ignore lint/complexity/noBannedTypes: Needed to check for non nullable
  // biome-ignore lint/suspicious/noConfusingVoidType: Needed to make it optional
  constructor(args: Equals<A, {}> extends true ? void : A) {
    super(args?.message, args?.cause ? { cause: args.cause } : undefined)

    if (args) {
      Object.assign(this, args)
      Object.defineProperty(this, plainArgsSymbol, {
        value: args,
        enumerable: false,
      })
    }
  }

  toJSON() {
    // biome-ignore lint/suspicious/noExplicitAny: Needed to access plainArgsSymbol
    return { ...(this as any)[plainArgsSymbol], ...this }
  }
}

export type Equals<X, Y> = (<T>() => T extends X ? 1 : 2) extends <
  T,
>() => T extends Y ? 1 : 2
  ? true
  : false

export function TaggedError<const Tag extends string>(tag: Tag) {
  class Base<A extends Record<string, unknown>> extends DataError<A> {
    readonly _tag = tag
  }

  Base.prototype.name = tag
  Object.defineProperty(Base, 'name', {
    value: `TaggedError#${tag}`,
    writable: false,
  })

  return Base
}
