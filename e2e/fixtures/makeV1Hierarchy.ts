import type { Address } from 'viem'
import type { privateKeyToAccount } from 'viem/accounts'

import { CHILD_FUSES, makeV1Subname } from './makeV1Subname.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type V1HierarchyConfig = {
  rootLabel: string
  childLabels: string[]
  ownerAddress: Address
  ownerAccount: ReturnType<typeof privateKeyToAccount>
  /** Additional fuses per level. Index 0 = 2LD, 1 = first child, etc. */
  fusesPerLevel?: number[]
}

// ---------------------------------------------------------------------------
// makeV1Hierarchy
// ---------------------------------------------------------------------------

/**
 * Creates a locked multi-level NameWrapper hierarchy under an existing locked 2LD.
 * The caller is responsible for creating the root 2LD via makeV1Name with type:'locked'.
 */
export async function makeV1Hierarchy(
  config: V1HierarchyConfig,
): Promise<string[]> {
  const {
    rootLabel,
    childLabels,
    ownerAddress,
    ownerAccount,
    fusesPerLevel = [],
  } = config

  const allNames: string[] = [`${rootLabel}.eth`]

  for (let i = 0; i < childLabels.length; i++) {
    // parentLabel is everything before the first dot of the previous name.
    // e.g. for "sub.alice.eth" the parentLabel passed to makeV1Subname is "alice" (2LD)
    // and for "deep.sub.alice.eth" it is "sub.alice" (the full non-.eth part of the parent).
    const parentFullName = allNames[allNames.length - 1]
    // Strip the trailing ".eth" to get the parentName argument expected by makeV1Subname.
    const parentName = parentFullName.slice(0, -'.eth'.length)

    const childLabel = childLabels[i]
    // This builds a LOCKED chain, so every level burns PARENT_CANNOT_CONTROL
    // and CANNOT_UNWRAP. `makeV1Subname` no longer adds PCC implicitly — it
    // could not, because the copy path needs a child with no fuses at all.
    const childFuses = CHILD_FUSES.LOCKED_CHILD | (fusesPerLevel[i + 1] ?? 0)

    const childName = await makeV1Subname({
      parentName,
      childLabel,
      ownerAddress,
      ownerAccount,
      parentOwnerAccount: ownerAccount,
      fuses: childFuses,
    })

    allNames.push(childName)
  }

  return allNames
}
