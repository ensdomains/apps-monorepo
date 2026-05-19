import { useQuery } from '@tanstack/react-query'
import { Fragment } from 'react'
import { match } from 'ts-pattern'
import { type Address, zeroAddress } from 'viem'
import { EntityBadge } from '@/components/EntityBadge'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'
import { truncateAddress } from '@/utils/formatting/truncateAddress'
import { getRegistryLabelCountQueryOptions } from '../../hooks/useRegistryLabelCount'

type RegistryTreeItemProps = {
  chainId: number
  ownerData: NonNullable<GetEnsOwnerReturnType>
  index: number
  registriesCount: number
  address: Address
  label: string
}

export const RegistryTreeItem = ({
  chainId,
  ownerData,
  index,
  registriesCount,
  address,
  label,
}: RegistryTreeItemProps) => {
  const isRoot = index === 0
  const isParent = index === 1
  const isLast = index === registriesCount - 1

  console.log('registry tree item', { isRoot, isParent, isLast })

  const { data: summary } = useQuery({
    ...getRegistryLabelCountQueryOptions({ address }),
    enabled: isLast && address !== zeroAddress,
  })

  console.log('registry query', { address, summary })

  return (
    <div
      className="flex flex-col gap-2"
      style={{
        paddingLeft: `${50 * (index - 1)}px`,
      }}
    >
      <div className="flex items-center justify-start gap-2">
        {!isRoot ? (
          <Fragment>
            <RegistryTreePathIcon />
            <EntityBadge variant="name">{label}</EntityBadge>
          </Fragment>
        ) : null}

        <EntityBadge
          label={match({ isRoot, isParent, isLast })
            .with({ isRoot: true }, () => 'root registry')
            .with({ isParent: true }, () => 'parent registry')
            .with({ isLast: true }, () => 'permissioned registry')
            .with(
              { isRoot: false, isParent: false, isLast: false },
              () => undefined,
            )
            .exhaustive()}
          variant="contract"
          className="font-normal"
        >
          {truncateAddress(address, 6, 4, '...')}
        </EntityBadge>
        <span className="text-sm text-muted-foreground font-mono">
          Chain ID: {chainId}
        </span>
        <span className="text-sm text-muted-foreground font-mono">
          {ownerData.protocolVersion}
        </span>
      </div>
      {isLast ? (
        <dl className="grid grid-cols-2 max-w-sm pl-14 gap-4 text-sm text-muted-foreground -mt-2">
          <dt>Chain ID:</dt>
          <dd>{chainId}</dd>
          <dt>Protocol Version:</dt>
          <dd>{ownerData.protocolVersion}</dd>
          <dt>Created:</dt>
          <dd>
            <EntityBadge
              label={
                summary?.createdAt
                  ? (formatTimestamp(BigInt(summary.createdAt)) ?? undefined)
                  : undefined
              }
              variant="tx"
              className="font-normal"
            >
              {truncateAddress(ownerData.owner, 6, 4, '...')}
            </EntityBadge>
          </dd>
          <dt>Labels:</dt>
          <dd className="flex items-center gap-4">
            <span className="text-foreground">
              {summary?.labelCount ?? '—'}
            </span>
            {/* TODO: Add this button back when the new labels page is ready */}
            {/* <Button variant="outline" size="xs">
              View subnames <ArrowUpRight className="size-4" />
            </Button> */}
          </dd>
        </dl>
      ) : null}
    </div>
  )
}

const RegistryTreePathIcon = () => {
  return (
    <svg
      width="45"
      height="52"
      viewBox="0 0 45 52"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Registry tree path</title>
      <path
        d="M22 2V1H20V2H21H22ZM44.7071 28.7071C45.0976 28.3166 45.0976 27.6834 44.7071 27.2929L38.3431 20.9289C37.9526 20.5384 37.3195 20.5384 36.9289 20.9289C36.5384 21.3195 36.5384 21.9526 36.9289 22.3431L42.5858 28L36.9289 33.6569C36.5384 34.0474 36.5384 34.6805 36.9289 35.0711C37.3195 35.4616 37.9526 35.4616 38.3431 35.0711L44.7071 28.7071ZM21 2H20V24H21H22V2H21ZM25 28V29H44V28V27H25V28ZM21 24H20C20 26.7614 22.2386 29 25 29V28V27C23.3431 27 22 25.6569 22 24H21Z"
        fill="#C7C6C4"
      />
    </svg>
  )
}
