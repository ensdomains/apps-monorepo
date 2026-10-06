import { normalize } from 'viem/ens'

type Eth2LdName = {
  readonly label: string
  readonly name: string
}

type EthName = {
  readonly leafLabel: string
  readonly name: string
  readonly parentLabelsRootFirst: readonly string[]
}

export const normalizeProfileName = (name: string): string | null => {
  let normalized: string

  try {
    normalized = normalize(name)
  } catch {
    return null
  }

  const labels = normalized.split('.')

  if (labels.length < 2 || labels.some((label) => !label)) {
    return null
  }

  return normalized
}

/** Add the suffix for a bare label, but never change the claimed identity. */
export const getCanonicalPrimaryName = (name: string): string | null => {
  const fullName = name.includes('.') ? name : `${name}.eth`
  return normalizeProfileName(fullName) === fullName ? fullName : null
}

export const requireCanonicalPrimaryName = (name: string): string => {
  const canonicalName = getCanonicalPrimaryName(name)
  if (!canonicalName) {
    throw new Error(
      'Cannot set primary name - the name is not ENSIP-15 canonical.',
    )
  }
  return canonicalName
}

export const normalizeEthName = (name: string): EthName | null => {
  const normalized = normalizeProfileName(name)

  if (!normalized) {
    return null
  }

  const labels = normalized.split('.')
  const leafLabel = labels[0]

  if (labels.at(-1) !== 'eth' || !leafLabel) {
    return null
  }

  return {
    leafLabel,
    name: normalized,
    parentLabelsRootFirst: labels.slice(1, -1).reverse(),
  }
}

// Normalizes a non-.eth name (e.g. a DNS name); bare labels are not
// DNS names here, they resolve as .eth candidates
export const normalizeDnsName = (name: string): string | null => {
  return normalizeProfileName(name)
}

export const normalizeEth2LdName = (name: string): Eth2LdName | null => {
  const ethName = normalizeEthName(name)

  if (!ethName || ethName.parentLabelsRootFirst.length > 0) {
    return null
  }

  return {
    label: ethName.leafLabel,
    name: ethName.name,
  }
}
