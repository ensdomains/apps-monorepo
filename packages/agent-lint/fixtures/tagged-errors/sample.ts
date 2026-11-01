declare const err: (error: unknown) => unknown
declare const errAsync: (error: unknown) => unknown
type Result<T, E> = { readonly value: T; readonly error: E }
class NotFound extends Error {}
export const a = () => err(new Error('missing')) // expect: tagged-errors
export const b = () => errAsync(new Error('missing')) // expect: tagged-errors
export const c = () => err(new NotFound())
export type Bare = Result<number, Error> // expect: tagged-errors
export type Text = Result<number, string> // expect: tagged-errors
export type Tagged = Result<number, NotFound>
