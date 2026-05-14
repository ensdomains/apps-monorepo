type Eth2LdName = {
  readonly label: string
  readonly name: string
}

type EthName = {
  readonly leafLabel: string
  readonly name: string
  readonly parentLabels: readonly string[]
}

export const normalizeEthName = (name: string): EthName | null => {
  const normalized = name.toLowerCase()
  const labels = normalized.split('.')
  const leafLabel = labels[0]

  if (
    labels.length < 2 ||
    labels.at(-1) !== 'eth' ||
    !leafLabel ||
    labels.some((label) => !label)
  ) {
    return null
  }

  return {
    leafLabel,
    name: normalized,
    parentLabels: labels.slice(1, -1).reverse(),
  }
}

export const normalizeEth2LdName = (name: string): Eth2LdName | null => {
  const ethName = normalizeEthName(name)

  if (!ethName || ethName.parentLabels.length > 0) {
    return null
  }

  return {
    label: ethName.leafLabel,
    name: ethName.name,
  }
}
