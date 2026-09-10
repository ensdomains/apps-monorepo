import { useQuery } from '@tanstack/react-query'
import { type Address, isAddressEqual } from 'viem'
import type { ResolvedEnsOwner } from '@/utils/ens/resolveEnsOwner'
import { getV1NameStateQueryOptions } from '../v1/getV1NameState'
import { getV1TransferGate } from '../v1/rules'
import { useCanTransferName } from './useCanTransferName'

/**
 * Whether the connected wallet may transfer the name, whichever protocol holds
 * it — the yes/no the Transfer button needs. The transfer route applies the
 * same gates with reasons attached. False while loading: a button that appears
 * and then refuses is worse than one that arrives a beat late.
 *
 * V2: the wallet must own the token *and* hold `ROLE_CAN_TRANSFER_ADMIN`, since
 * the registry reverts the transfer without it. V1: `owner.owner` is not enough
 * to go on (an unwrapped 2LD splits registrant and controller), so the V1 gate
 * decides from the full ownership shape.
 */
export const useCanTransfer = ({
  name,
  owner,
  account,
}: {
  readonly name: string
  readonly owner: ResolvedEnsOwner | undefined
  readonly account: Address | undefined
}): boolean => {
  const isV2Owner =
    !!account &&
    owner?.protocolVersion === 'ENSv2' &&
    isAddressEqual(account, owner.owner)

  const { canTransfer: hasTransferRole } = useCanTransferName({
    name,
    registryAddress: owner?.registryAddress,
    account: owner?.owner,
    enabled: isV2Owner,
  })

  const v1StateQuery = useQuery({
    ...getV1NameStateQueryOptions({ name }),
    enabled: !!account && owner?.protocolVersion === 'ENSv1',
  })

  return (
    (isV2Owner && hasTransferRole) ||
    (!!account &&
      !!v1StateQuery.data &&
      getV1TransferGate(v1StateQuery.data, account).reason === 'ok')
  )
}
