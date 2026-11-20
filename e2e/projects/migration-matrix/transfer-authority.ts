import { zeroAddress } from 'viem'
import type { Probe } from './probes.js'

// Only a complete loaded refusal title counts. Incidental expiry words in a
// profile or an unfinished form must not satisfy the permission assertion.
export const legacyTransferDenialTitle =
  /^(Not authorized|You manage this name but don.t own it|.+ is in its grace period|.+ has expired|Transfer not available|Transfer permanently disabled|This subname is out of the parent.s control|Can.t reassign this subname from here|Reclaim the parent first|Permission Denied|Connect your wallet|Wallet Not Connected)$/

/** A live subname can move through its holder or its controlling parent. */
export function legacyTransferAuthority(
  permissions: { transfer: Probe; transferAsParent?: Probe },
  state?: { wrappedSubnameHolder: string },
) {
  const routes = {
    holder: permissions.transfer,
    parent: permissions.transferAsParent,
  }
  // A cleared wrapper holder cannot be transferred. setSubnodeOwner may still
  // authorize re-issuing that label, which needs a separate creation workflow.
  // Do not infer this from the timestamp alone: an unlocked name can retain its
  // effective holder after that timestamp.
  const requiresReissue =
    state?.wrappedSubnameHolder.toLowerCase() === zeroAddress
  const allowedRoutes = requiresReissue
    ? []
    : Object.entries(routes)
        .filter(([, probe]) => probe?.result === 'ALLOWED')
        .map(([route]) => route)
  const blocked = Object.values(routes).find(
    (probe) => probe?.result === 'BLOCKED',
  )
  return {
    oracleVersion: 'v1-holder-and-parent-transfer-v2',
    routes,
    allowedRoutes,
    requiresReissue,
    reissueAsParent: requiresReissue ? permissions.transferAsParent : undefined,
    result: requiresReissue
      ? 'DENIED'
      : allowedRoutes.length
        ? 'ALLOWED'
        : blocked
          ? 'BLOCKED'
          : 'DENIED',
    detail: requiresReissue
      ? 'The live wrapper reports no effective holder. Parent re-issue authority is separate from transferring an existing name.'
      : blocked?.detail,
  } as const
}
