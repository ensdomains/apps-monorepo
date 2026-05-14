type Eth2LdName = {
  readonly label: string
  readonly name: string
}

export const normalizeEth2LdName = (name: string): Eth2LdName | null => {
  const normalized = name.toLowerCase()
  const labels = normalized.split('.')

  if (labels.length !== 2 || labels[1] !== 'eth' || !labels[0]) {
    return null
  }

  return {
    label: labels[0],
    name: normalized,
  }
}
