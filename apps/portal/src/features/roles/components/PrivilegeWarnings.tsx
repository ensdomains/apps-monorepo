import { match } from 'ts-pattern'
import type { Address } from 'viem'
import { getExpectedWrapperRegistry } from '@/features/registry/utils/wrapperRegistry'
import {
  type TokenRoleWarningParams,
  useTokenRoleWarning,
} from '@/features/roles/hooks/useTokenRoleWarning'
import {
  getResolverWarning,
  getSubregistryWarning,
  getTransferWarning,
  type SetterWarning,
} from '@/features/roles/utils/missingPrivileges'
import { PrivilegeWarningBadge, RoleNames } from './PrivilegeWarningBadge'

// The badges are advisory, so a pending or failed read renders nothing rather
// than an error in the middle of a details row.

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

export const TransferPrivilegeWarning = (props: TokenRoleWarningParams) => {
  const { warning } = useTokenRoleWarning(props, (holders) =>
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

export const ResolverPrivilegeWarning = (props: TokenRoleWarningParams) => {
  const { warning } = useTokenRoleWarning(props, (holders) =>
    getResolverWarning({ owner: props.ownerData.owner, holders }),
  )

  return <SetterWarningBadge label="Resolver locked" warning={warning} />
}

export const SubregistryPrivilegeWarning = ({
  subregistry,
  chainId,
  ...props
}: TokenRoleWarningParams & {
  readonly subregistry: Address
  readonly chainId: number
}) => {
  const { warning } = useTokenRoleWarning(props, (holders) =>
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
