import { useEffect } from 'react'
import type { Address } from 'viem'
import { readL2FundingRecord } from '../service/l2FundingPersistence'
import { findL2Source, getL2FundingRoute } from '../service/l2FundingRoute'
import type { RegistrationV2UiActor } from './registrationUi.context'

/**
 * Picks the owner's in-flight bridge back up when the payment picker opens,
 * rather than offering a second one while the first is still arriving.
 */
export const useL2FundingResume = ({
  uiActor,
  ownerAddress,
}: {
  readonly uiActor: RegistrationV2UiActor
  readonly ownerAddress: Address | null | undefined
}) => {
  useEffect(() => {
    if (!ownerAddress) return
    const record = readL2FundingRecord(ownerAddress)
    const source = record && findL2Source(record.sourceChainId)
    if (!record || !source) return
    uiActor.send({
      type: 'pricing.funding.resume',
      route: getL2FundingRoute({
        owner: ownerAddress,
        source,
        amountOut: record.amountOut,
      }),
      record,
    })
  }, [ownerAddress, uiActor])
}
