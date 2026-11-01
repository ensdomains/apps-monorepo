export interface Profile {
  readonly name: string
  age: number // expect: readonly-members
}
export type Settings = {
  readonly theme: string
  locale: string // expect: readonly-members
}
export type Wrapped = Readonly<{ signal?: AbortSignal }>
export type Picked = Pick<{ id: string; name: string }, 'id'>
declare global {
  interface Window {
    __probe__?: string
  }
}
export const total = (values: number[]) => values.length // expect: readonly-members
export const first = (values: Array<string>) => values.length // expect: readonly-members
export const sum = (values: readonly number[]) => values.length
export const names = (values: ReadonlyArray<string>) => values.length
