import { useQuery } from '@tanstack/react-query'
import { PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { useConnection } from 'wagmi'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useFirstToExpire } from '@/features/profile/hooks/useFirstToExpire'
import { getRegistrationDataQueryOptions } from '@/features/profile/hooks/useRegistrationData'
import { getVersionedResourceQueryOptions } from '@/features/roles/hooks/useVersionedResource'
import type { ResourceId } from '@/lib/resource/resourceId'
import { ethAncestorsOf } from '@/utils/names/addressNames'
import { getHasRolesQueryOptions } from '../hooks/useHasRoles'
import { getExpiryChange } from '../utils/subnameExpiry'
import { ChangeSubnameExpiry } from './ChangeSubnameExpiry'

type SubnameExpiryActionProps = {
  readonly name: string
  /** The registry the subname lives in */
  readonly registryAddress: Address
  readonly parentName: string
  /** The names above it that it lapses with */
  readonly namesAbove: readonly string[]
  readonly resource: ResourceId
}

const SubnameExpiryAction = ({
  name,
  registryAddress,
  parentName,
  namesAbove,
  resource,
}: SubnameExpiryActionProps) => {
  const { address: account } = useConnection()
  const [isEditing, setIsEditing] = useState(false)
  const { data: registration } = useQuery(
    getRegistrationDataQueryOptions({ name }),
  )
  const { firstToExpire } = useFirstToExpire(namesAbove)
  const { data: canRenew } = useQuery({
    ...getHasRolesQueryOptions({
      registryAddress,
      resource,
      roles: ['ROLE_RENEW'],
      account: account as Address,
    }),
    enabled: Boolean(account),
  })

  const change = getExpiryChange({
    expiryDate:
      registration &&
      (registration.expiry ? new Date(registration.expiry * 1000) : null),
    nowMs: Date.now(),
    canRenew: canRenew === true,
    expiresWithName: firstToExpire?.name,
  })

  return match(change)
    .with({ type: 'change' }, ({ expiryDate }) => (
      <>
        <Button variant="outline" size="xs" onClick={() => setIsEditing(true)}>
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
        {isEditing && (
          <ChangeSubnameExpiry
            parentName={parentName}
            registryAddress={registryAddress}
            subname={{ name, resourceId: resource, expiryDate }}
            onClose={() => setIsEditing(false)}
          />
        )}
      </>
    ))
    .with({ type: 'blocked' }, ({ reason }) => (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="xs"
            aria-disabled="true"
            className="cursor-not-allowed opacity-50"
          >
            <PencilIcon className="size-4" />
            Edit
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-pretty">
          {reason}
        </TooltipContent>
      </Tooltip>
    ))
    .with({ type: 'none' }, () => null)
    .exhaustive()
}

/** "Edit" beside an ENSv2 subname's expiry, for an account that holds ROLE_RENEW on it. */
export const EditSubnameExpiry = ({
  name,
  registryAddress,
}: {
  readonly name: string
  /** The registry the subname lives in */
  readonly registryAddress: Address
}) => {
  // None for a 2LD, which renews through the registrar instead.
  const namesAbove = ethAncestorsOf({
    name,
    expiryDate: null,
    protocolVersion: 'ENSv2',
  })
  const [parentName] = namesAbove
  // The same read the transfer warning makes, so its versioned id is what the role check asks about.
  const { data: resource } = useQuery({
    ...getVersionedResourceQueryOptions({ name, registryAddress }),
    enabled: Boolean(parentName),
  })

  return parentName && resource ? (
    <SubnameExpiryAction
      name={name}
      registryAddress={registryAddress}
      parentName={parentName}
      namesAbove={namesAbove}
      resource={resource}
    />
  ) : null
}
