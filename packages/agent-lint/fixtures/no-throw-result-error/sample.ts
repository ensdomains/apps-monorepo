declare const result: { isErr(): boolean; isOk(): boolean; error: Error; value: number }
declare const state: { status: 'error' | 'ok'; error: Error }
declare function fromPromise(p: Promise<number>): Promise<{ isErr(): boolean; error: Error; value: number }>
declare const p: Promise<number>

export function unwrap(): number {
  if (result.isErr()) throw result.error // expect: no-throw-result-error
  return result.value
}

export async function bridge(): Promise<number> {
  return fromPromise(p).then((r) => {
    if (r.isErr()) {
      throw r.error // expect: no-throw-result-error
    }
    return r.value
  })
}

export function notAResult(): never {
  if (state.status === 'error') throw state.error
  throw new Error('unreachable')
}
