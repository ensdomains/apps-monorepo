import type { Address } from 'viem'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import type { ProtocolVersion } from '@/utils/types'
import { useSubnameOwnerNotice } from '../../hooks/useSubnameOwnerNotice'

/** Tells the owner of a subname in an outdated registry that the parent name's owner has to upgrade it. */
export const SubnameOwnerNotice = (props: {
  readonly name: string
  readonly owner: Address
  readonly protocolVersion: ProtocolVersion
}) => {
  const { isShown, parentName } = useSubnameOwnerNotice(props)
  if (!isShown) return null

  return (
    <Alert className="p-5 gap-2" variant="warning">
      <AlertTitle>Upgrade required</AlertTitle>
      <AlertDescription>
        This subname is using a registry running on an older version that has
        since been fixed. Until <strong>{parentName}</strong> updates it, no new
        subnames or role changes can be made here. Existing subnames will
        continue to work as normal. Contact the parent name owner to update to
        the latest registry.
      </AlertDescription>
    </Alert>
  )
}
