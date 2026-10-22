import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'
import { useEnsName } from 'wagmi'
import { EntityBadge } from '@/components/EntityBadge'
import { getHcaOwnerQueryOptions } from '@/features/roles/hooks/useHcaOwner'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

/** A role holder as its primary name when one resolves; an HCA as the wallet it acts for, labelled. */
export const RoleAccountBadge = ({
  account,
}: {
  readonly account: Address
}) => {
  const { data: hcaOwner } = useQuery(getHcaOwnerQueryOptions({ account }))
  const subject = hcaOwner ?? account
  const { data: name } = useEnsName({ address: subject })
  const label = hcaOwner ? 'HCA' : undefined
  const hcaAddress = hcaOwner ? account : undefined

  if (name) {
    return (
      <EntityBadge
        variant="name"
        format="truncate"
        name={name}
        label={label}
        address={hcaOwner ? undefined : account}
        hcaAddress={hcaAddress}
        showAvatar
      >
        {name}
      </EntityBadge>
    )
  }

  return (
    <EntityBadge
      variant="address"
      address={subject}
      label={label}
      hcaAddress={hcaAddress}
    >
      {truncateAddress(subject, 6, 4)}
    </EntityBadge>
  )
}
