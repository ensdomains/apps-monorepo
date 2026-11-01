declare function fromPromise<T>(p: Promise<T>, onError?: (e: unknown) => Error): any
declare function step(): any
declare const p: Promise<number>

// Mirrors the repo style: ResultFn(async function* () { ... })
export async function* violation() {
  const data = yield* await fromPromise(p) // expect: no-yield-await
  return data
}


export async function* violationMultiLine() {
  const data = yield* await fromPromise( // expect: no-yield-await
    p,
    (error) => new Error(String(error)),
  )
  return data
}

export async function* passes() {
  const data = yield* fromPromise(p)
  const other = yield* step()
  const n = await p
  return [data, other, n]
}

// A plain `yield await x` (no star) is not what the rule targets
export async function* plainYieldAwait() {
  const q = yield await p
  return q
}
