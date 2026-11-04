declare function ResultFn<T>(fn: () => AsyncGenerator<unknown, T, unknown>): () => Promise<T>
declare function fromPromise<T>(p: Promise<T>): any
declare const p: Promise<number>


export const bad = ResultFn(async function* () {
  try { // expect: no-try-in-resultfn
    const n = yield* fromPromise(p)
    return n
  } catch {
    return 0
  }
})


export const good = ResultFn(async function* () {
  const n = yield* fromPromise(p)
  return n
})


export const plain = () => {
  try {
    return JSON.parse('1')
  } catch {
    return null
  }
}
