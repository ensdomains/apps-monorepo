import type { Address } from 'viem'
import { getParentName, is2LD } from '@/utils/ens/tldHelpers'
import { useParentAuthority } from '../hooks/useParentAuthority'
import { useRegistryDetachImpact } from '../hooks/useRegistryDetachImpact'
import { useTransferDetachTargets } from '../hooks/useTransferDetachTargets'
import { useTransferName } from '../hooks/useTransferName'
import { useTransferRoleRevocations } from '../hooks/useTransferRoleRevocations'
import { SendNameForm } from './SendNameForm'

/**
 * The V2 side of the transfer form: role-gated detach options, registry-read
 * parent authority, and the ERC-1155 move.
 */
export const V2SendName = ({
  name,
  registryAddress,
  owner,
}: {
  readonly name: string
  readonly registryAddress: Address
  readonly owner: Address
}) => {
  // Only for subnames: a 2LD's parent is the `.eth` TLD, whose "owner" isn't a
  // counterparty the sender needs warning about.
  const parentName = is2LD(name) ? null : getParentName(name)

  const detachTargets = useTransferDetachTargets({
    name,
    registryAddress,
    owner,
  })

  // See `useParentAuthority` for why each power is a separate role check — the
  // important one is `canReclaimNow`, since `unregister()` is the live-name
  // path and waiting out an expiry is not the sender's protection.
  const authority = useParentAuthority({
    name,
    parentName,
    registryAddress,
    owner,
  })

  // Sized before the step can run: detaching the registry is the one option
  // whose damage lands on people who aren't party to the transfer. Reads the
  // subregistry `detachTargets` already resolved, so visibility and blast
  // radius can't describe different registries.
  const registryDetachImpact = useRegistryDetachImpact({
    subregistryAddress: detachTargets.subregistryAddress,
    owner,
  })

  // Registry roles are keyed on the label while the token is keyed on its id,
  // so a grant made from the roles page outlives the transfer. Read who holds
  // one before the form offers to hand the name over.
  const roleRevocations = useTransferRoleRevocations({
    name,
    registryAddress,
    owner,
  })

  const transfer = useTransferName({
    name,
    account: owner,
    subject: { kind: 'v2', registryAddress },
  })

  return (
    <SendNameForm
      owner={owner}
      detachTargets={detachTargets}
      registryDetachImpact={registryDetachImpact}
      roleRevocations={roleRevocations}
      parentWarning={
        parentName === null
          ? null
          : {
              parentName,
              isLoading: authority.isLoading,
              isError: authority.isError,
              parentIsSelf: authority.parentIsSelf,
              powers: [
                authority.canReclaimNow &&
                  'take it back at any time, without waiting for it to expire',
                authority.canReissueAfterExpiry &&
                  'issue it to someone else once it expires',
                authority.canRepointRegistry &&
                  `point ${parentName} at a different registry, which stops this name resolving no matter who owns it`,
              ].filter((power): power is string => typeof power === 'string'),
            }
      }
      transfer={transfer}
    />
  )
}
