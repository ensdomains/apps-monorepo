import { namehash } from 'viem/ens'

const INVALID_ENS_NAME = '[Invalid ENS Name]'

/** Preserve ENSjs's handling of names that do not hash to their subgraph id. */
export const validateSubgraphName = ({
  id,
  name,
}: {
  readonly id?: unknown
  readonly name: string | null
}): string | null => {
  if (!name || name.includes('[')) return name

  try {
    const hash = namehash(name)
    return id === undefined || hash === id ? name : hash
  } catch {
    return INVALID_ENS_NAME
  }
}

const validateValue = (value: unknown): void => {
  if (!value || typeof value !== 'object') return

  for (const child of Object.values(value)) validateValue(child)

  const name = Reflect.get(value, 'name')
  if (typeof name !== 'string') return

  Reflect.set(
    value,
    'name',
    validateSubgraphName({ id: Reflect.get(value, 'id'), name }),
  )
}

/** Validate every GraphQL object that selected both `name` and `id`. */
export const validateSubgraphNames = <Value>(value: Value): Value => {
  validateValue(value)
  return value
}
