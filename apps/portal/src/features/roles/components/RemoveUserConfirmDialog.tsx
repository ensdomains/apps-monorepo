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
import type { RemoveUserPlan } from '@/features/roles/utils/removeUserPlan'
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

type RemoveUserConfirmDialogProps = {
  readonly open: boolean
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
  open,
  onOpenChange,
  onConfirm,
  name,
  account,
  plan,
}: RemoveUserConfirmDialogProps) => {
  const { rolesToRevoke, lockoutRoles, frozenRoles, unauthorizedRoles } = plan

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              {name}, so once revoked nobody can grant{' '}
              {lockoutRoles.length === 1 ? 'it' : 'them'} back.
            </AlertDescription>
          </Alert>
        )}

        {frozenRoles.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              Transfer permission is kept. This account is the last one holding
              it, and without a holder {name} could never be transferred or sold
              again.
            </AlertDescription>
          </Alert>
        )}

        {unauthorizedRoles.length > 0 && (
          <Alert variant="warning">
            <AlertDescription>
              This user keeps {formatRoleList(unauthorizedRoles)} — your account
              isn't admin for {unauthorizedRoles.length === 1 ? 'it' : 'them'},
              so it can't be revoked from here.
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
