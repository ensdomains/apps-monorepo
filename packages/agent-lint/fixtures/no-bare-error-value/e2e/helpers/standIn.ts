import { fromThrowable } from 'neverthrow'

export const parseJson = fromThrowable(
  (text: string): unknown => JSON.parse(text),
  (): 'not JSON' => 'not JSON', // expect: no-bare-error-value
)
