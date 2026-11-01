import { queryOptions } from '@tanstack/react-query' // expect: lint/style/noRestrictedImports
import { ResultAsync } from 'neverthrow'

export const options = queryOptions({ queryKey: [], queryFn: () => 1 })
export const lifted = ResultAsync.fromPromise(Promise.resolve(1), () => 'x') // expect: lint/nursery/noJsRestrictedProperties
export function Card() { // expect: lint/nursery/useReactFunctionComponentDefinition
  return <div className="size-4" />
}
