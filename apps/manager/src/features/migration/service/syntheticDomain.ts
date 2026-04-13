// TEMP: dev-only helper to build synthetic V1Domain objects for the
// custom-name migration input. Remove along with the UI before prod.
import { type Address, namehash } from 'viem'
import { labelhash } from 'viem/ens'
import { FUSES } from './classifyNames'
import type { V1Domain } from './v1SubgraphClient'

export type CustomTokenType = 'unwrapped' | 'unlocked' | 'locked-2ld'

export type CustomNameSeed = {
  name: string
  tokenType: CustomTokenType
}

export const buildSyntheticDomain = (
  name: string,
  owner: Address,
  tokenType: CustomTokenType,
): V1Domain => {
  const normalized = name.toLowerCase().trim()
  const [label = '', ...rest] = normalized.split('.')
  const parentName = rest.join('.')
  const ownerId = owner.toLowerCase()
  const nowSec = Math.floor(Date.now() / 1000).toString()
  const expiry = (Math.floor(Date.now() / 1000) + 365 * 24 * 3600).toString()
  const ownerRef = { id: ownerId }
  const base = {
    id: namehash(normalized),
    labelName: label,
    labelhash: labelhash(label),
    name: normalized,
    isMigrated: true,
    createdAt: nowSec,
    resolvedAddress: null,
    resolver: null,
    owner: ownerRef,
    registrant: ownerRef,
    parent: parentName
      ? { name: parentName, id: namehash(parentName), wrappedDomain: null }
      : null,
    registration:
      parentName === 'eth'
        ? { registrationDate: nowSec, expiryDate: expiry }
        : null,
  }
  if (tokenType === 'unwrapped') {
    return { ...base, wrappedOwner: null, wrappedDomain: null }
  }
  const fuses =
    tokenType === 'locked-2ld'
      ? FUSES.CANNOT_UNWRAP | FUSES.PARENT_CANNOT_CONTROL | FUSES.IS_DOT_ETH
      : 0
  return {
    ...base,
    wrappedOwner: ownerRef,
    wrappedDomain: { expiryDate: expiry, fuses },
  }
}
