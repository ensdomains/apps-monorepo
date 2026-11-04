declare const v: {
  readonly union: (items: ReadonlyArray<unknown>) => unknown
  readonly literal: (value: string | boolean | null) => unknown
  readonly string: () => unknown
  readonly picklist: (values: ReadonlyArray<string>) => unknown
}
export const a = v.union([v.literal('a'), v.literal('b')]) // expect: picklist-over-literal-union
export const b = v.picklist(['a', 'b'])
export const c = v.union([v.literal('a'), v.string()])
export const d = v.union([v.literal(true), v.literal(false)])
