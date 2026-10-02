import { useQuery } from '@tanstack/react-query'
import { match } from 'ts-pattern'
import type { Address } from 'viem'
import type { GetEnsOwnerReturnType } from '@/features/profile/hooks/useEnsOwner'
import { getExpectedWrapperRegistry } from '@/features/registry/utils/wrapperRegistry'
import { getNameRolesAccountsQueryOptions } from '@/features/roles/hooks/useNameRoleAccounts'
import {
  getResolverWarning,
  getSubregistryWarning,
  getTransferWarning,
  type SetterWarning,
  type TokenRoleHolders,
} from '@/features/roles/utils/missingPrivileges'
import { PrivilegeWarningBadge, RoleNames } from './PrivilegeWarningBadge'

type PrivilegeWarningProps = {
  readonly name: string
  readonly ownerData: NonNullable<GetEnsOwnerReturnType>
}

/**
 * The token's role holders, shaped by `select`. Shares its cache entry with the
 * Roles tab. Only ENSv2 names have token roles.
 *
 * The badges are advisory, so a failed or pending read renders nothing rather
 * than an error in the middle of a details row.
 */
const useTokenRoleWarning = <T,>(
  { name, ownerData }: PrivilegeWarningProps,
  select: (holders: TokenRoleHolders) => T,
) =>
  useQuery({
    ...getNameRolesAccountsQueryOptions({
      name,
      registryAddress: ownerData.registryAddress,
    }),
    select,
    enabled: ownerData.protocolVersion === 'ENSv2',
  }).data

const SetterWarningBadge = ({
  label,
  warning,
}: {
  readonly label: string
  readonly warning: SetterWarning | null | undefined
}) =>
  warning ? (
    <PrivilegeWarningBadge
      label={label}
      reason={
        <>
          Missing token <RoleNames roles={warning.missing} />
        </>
      }
    />
  ) : null

export const TransferPrivilegeWarning = (props: PrivilegeWarningProps) => {
  const warning = useTokenRoleWarning(props, (holders) =>
    getTransferWarning({ owner: props.ownerData.owner, holders }),
  )

  return match(warning)
    .with({ kind: 'cannot-transfer' }, () => (
      <PrivilegeWarningBadge
        label="Cannot transfer"
        reason={
          <>
            Missing token <RoleNames roles={['ROLE_CAN_TRANSFER_ADMIN']} />
          </>
        }
      />
    ))
    .with({ kind: 'cannot-transfer-safely' }, () => (
      <PrivilegeWarningBadge
        label="Cannot transfer safely"
        reason="Another address holds roles on this token"
      />
    ))
    .otherwise(() => null)
}

export const ResolverPrivilegeWarning = (props: PrivilegeWarningProps) => {
  const warning = useTokenRoleWarning(props, (holders) =>
    getResolverWarning({ owner: props.ownerData.owner, holders }),
  )

  return <SetterWarningBadge label="Resolver locked" warning={warning} />
}

export const SubregistryPrivilegeWarning = ({
  subregistry,
  chainId,
  ...props
}: PrivilegeWarningProps & {
  readonly subregistry: Address
  readonly chainId: number
}) => {
  const warning = useTokenRoleWarning(props, (holders) =>
    getSubregistryWarning({
      owner: props.ownerData.owner,
      holders,
      subregistry,
      wrapperRegistry: getExpectedWrapperRegistry({
        name: props.name,
        chainId,
      }),
    }),
  )

  return <SetterWarningBadge label="Subregistry locked" warning={warning} />
}
