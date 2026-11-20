import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { useConnection } from 'wagmi'
import { chain } from '@/config'
import { paletteHandoff } from '@/features/command-palette/handoff'
import { usePaletteHandoff } from '@/features/command-palette/usePaletteHandoff'
import { getEnsOwnerQueryOptions } from '@/features/profile/hooks/useEnsOwner'
import {
  getRenewalGateReadiness,
  isSupportedRenewalTarget,
} from '../utils/paletteHandoff'
import { useCanExtend } from './useCanExtend'

const NOOP = () => {}

// Reject terminal destinations that never mount the normal renewal button.
export const useRenewalPaletteGate = (
  name: string,
  hasResolverError: boolean,
) => {
  const { address } = useConnection()
  const snapshot = useSyncExternalStore(
    paletteHandoff.subscribe,
    paletteHandoff.getSnapshot,
    paletteHandoff.getSnapshot,
  )
  const pending = snapshot.pending?.intent
  const isRequested = pending?.kind === 'renew' && pending.name === name
  const isSupported = isSupportedRenewalTarget(name)
  const ownerQuery = useQuery({
    ...getEnsOwnerQueryOptions({ name }),
    enabled: isRequested && isSupported,
  })
  const eligibility = useCanExtend({
    name,
    protocolVersion: ownerQuery.data?.protocolVersion ?? 'ENSv2',
    enabled:
      isRequested &&
      isSupported &&
      !ownerQuery.isPending &&
      !ownerQuery.isError,
  })

  usePaletteHandoff({
    kind: 'renew',
    name,
    chainId: chain.id,
    account: address,
    readiness: getRenewalGateReadiness({
      name,
      ownerStatus: ownerQuery.status,
      eligibility,
      hasResolverError,
    }),
    onOpen: NOOP,
  })
}
