import type { Role } from '@ensdomains/ensjs/utils/v2'
import type { Address } from 'viem'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type {
  RemoveUserPlan,
  TransferRoleHold,
} from '@/features/roles/utils/removeUserPlan'
import { formatRoleLabel } from '@/lib/roles/formatRoleLabel'
import { isAdminRole } from '@/lib/roles/permissions'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

/** `formatRoleLabel` strips the `_ADMIN` suffix, so mark it back on explicitly. */
const formatRoleList = (roles: readonly Role[]) =>
  roles
    .map(
      (role) =>
        `${formatRoleLabel(role)}${isAdminRole(role) ? ' (admin)' : ''}`,
    )
    .join(', ')

const transferRoleHoldReason = (hold: TransferRoleHold, name: string) => {
  switch (hold) {
    case 'last-holder':
      return `This account is the last one holding it, and without a holder ${name} could never be transferred or sold again.`
    case 'owner':
      return `This account owns ${name}, which can only be transferred or sold while its owner holds it, whoever else does.`
    case 'owner-unknown':
      return `${name}'s owner couldn't be confirmed, and this account may be it: ${name} can only be transferred or sold while its owner holds it.`
  }
}

type RemoveUserConfirmDialogProps = {
  readonly isOpen: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onConfirm: () => void
  readonly name: string
  readonly account: Address | undefined
  readonly plan: RemoveUserPlan
}

/**
 * Names the exact roles Remove user will revoke, and why anything is held back.
 *
 * The old copy promised only that removal "would prohibit you from adding more
 * users", which described neither the roles being revoked nor the consequence —
 * see {@link RemoveUserPlan} for what the button is and isn't allowed to touch.
 */
export const RemoveUserConfirmDialog = ({
  isOpen,
  onOpenChange,
  onConfirm,
  name,
  account,
  plan,
}: RemoveUserConfirmDialogProps) => {
  const {
    rolesToRevoke,
    lockoutRoles,
    transferRoleHold,
    unauthorizedRoles,
    isRootAuthorityUnknown,
  } = plan
  const pronoun = (roles: readonly Role[]) =>
    roles.length === 1 ? 'it' : 'them'

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove user</DialogTitle>
          <DialogDescription>
            This revokes {formatRoleList(rolesToRevoke)} from{' '}
            {account ? truncateAddress(account, 6, 4) : 'this account'} on{' '}
            {name}. It can't be undone from this page.
          </DialogDescription>
        </DialogHeader>

        {lockoutRoles.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              No other account is admin for {formatRoleList(lockoutRoles)} on{' '}
              {name}
              {isRootAuthorityUnknown
                ? `, and registry-wide admins couldn't be checked, so once revoked it may not be possible to grant ${pronoun(lockoutRoles)} back.`
                : `, so once revoked nobody can grant ${pronoun(lockoutRoles)} back.`}
            </AlertDescription>
          </Alert>
        )}

        {transferRoleHold && (
          <Alert variant="warning">
            <AlertDescription>
              Transfer permission is kept.{' '}
              {transferRoleHoldReason(transferRoleHold, name)}
            </AlertDescription>
          </Alert>
        )}

        {unauthorizedRoles.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              This user keeps {formatRoleList(unauthorizedRoles)} —{' '}
              {isRootAuthorityUnknown
                ? `your registry-wide roles couldn't be read, so your account couldn't be confirmed as admin for ${pronoun(unauthorizedRoles)}`
                : `your account isn't admin for ${pronoun(unauthorizedRoles)}`}
              , so {unauthorizedRoles.length === 1 ? 'it' : 'they'} can't be
              revoked from here.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button variant="danger" onClick={onConfirm}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
