import { isAddress } from 'viem'
import type { PaletteEntity } from './core/types'

export const getRouteEntity = (
  parameters: readonly Readonly<Record<string, unknown>>[],
): PaletteEntity | undefined => {
  const name = parameters.findLast(
    (params) => typeof params.name === 'string',
  )?.name
  if (typeof name === 'string') return { type: 'name', name }
  const address = parameters
    .flatMap((params) => [params.addr, params.address])
    .findLast(
      (value) =>
        typeof value === 'string' && isAddress(value, { strict: false }),
    )
  if (typeof address === 'string' && isAddress(address, { strict: false })) {
    return { type: 'address', address }
  }
  return undefined
}
