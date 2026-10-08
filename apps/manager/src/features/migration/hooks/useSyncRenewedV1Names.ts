import { qk } from '@ens-apps/utils/tanstack-query/queryKey'
import { useQueryClient } from '@tanstack/react-query'
import { useSelector } from '@xstate/react'
import { useEffect } from 'react'
import type { V1Domain } from '../service/v1SubgraphClient'
import { useMigrationUiContext } from '../state/migrationUi.context'

export const useSyncRenewedV1Names = (): void => {
  const { uiActor } = useMigrationUiContext()
  const queryClient = useQueryClient()
  const renewedDomains = useSelector(
    uiActor,
    (state) => state.context.renewedDomains,
  )
  const renewalOwner = useSelector(
    uiActor,
    (state) => state.context.renewal?.quote.ownerAddress,
  )

  useEffect(() => {
    if (!renewedDomains || !renewalOwner) return
    const renewed = new Map(renewedDomains.map((domain) => [domain.id, domain]))
    queryClient.setQueriesData<readonly V1Domain[]>(
      {
        queryKey: qk('migration', 'v1_names', {
          address: renewalOwner.toLowerCase(),
        }),
      },
      (domains) => domains?.map((domain) => renewed.get(domain.id) ?? domain),
    )
  }, [queryClient, renewedDomains, renewalOwner])
}
