import { Trash2 } from 'lucide-react'
import { type PropsWithChildren, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { CopyButton } from '@/components/CopyButton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { ResolverRolesAction } from '@/features/resolver/helpers/prepareResolverRolesIntent'
import { useResolverRolesMutations } from '@/features/resolver/hooks/useResolverRolesMutations'
import { buildResolverRolesTransactions } from '@/features/resolver/utils/buildResolverRolesTransactions'
import { useResetMutationsOnAccountChange } from '@/features/roles/hooks/useResetMutationsOnAccountChange'
import { TransactionModal } from '@/features/transaction-manager/components/TransactionModal'
import { useFlowAttempt } from '@/features/transaction-manager/hooks/useFlowAttempt'
import { useTransactionModal } from '@/features/transaction-manager/hooks/useTransactionModal'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  type AccountRemovalPlan,
  type AccountRoleGroup,
  type ResolverRevocation,
  type ResolverRole,
  ROOT_RESOURCE,
  resolverPermissions,
  resolverRoleGroupId,
} from '@/lib/roles/resolverRoles'
import {
  computeRoleChanges,
  hasPermissionsChanged,
  type Permission,
  roleToPermissions,
} from '@/lib/roles/rolesToPermissions'
import { cn } from '@/lib/utils'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

type ResolverRolesSidebarProps = PropsWithChildren<{
  /**
   * The row being edited, looked up by identity in the table's current data.
   * Null when nothing is selected or the selected row no longer exists.
   */
  readonly group: AccountRoleGroup | null
  /** Everything "Remove user" would revoke from `group`'s account. */
  readonly removalPlan: AccountRemovalPlan | null
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
  readonly resolverAddress: Address
  readonly canManageRoles: boolean
}>

const NO_ROLES: readonly ResolverRole[] = []
const NO_REVOCATIONS: readonly ResolverRevocation[] = []

const EditPermissionList = ({
  editedPermissions,
  onChange,
  canManageRoles,
  canGrant,
  disabled,
}: {
  readonly editedPermissions: Map<string, Permission>
  readonly onChange: (
    roleKey: string,
    type: 'admin' | 'manager',
    checked: boolean,
  ) => void
  readonly canManageRoles: boolean
  /** False for argument-scoped rows: roles there can only be revoked. */
  readonly canGrant: boolean
  readonly disabled: boolean
}) => (
  <div className="border border-border rounded-sm overflow-hidden">
    {resolverPermissions.map((permission, index) => {
      const rolePerms = editedPermissions.get(permission.key) || {
        admin: false,
        manager: false,
      }

      return (
        <div
          key={permission.key}
          className={cn(
            'flex items-center justify-between px-6 py-4 gap-4',
            index !== 0 && 'border-t border-border',
          )}
        >
          <div className="flex flex-col gap-1 flex-1 min-w-64">
            <div className="font-medium">{permission.title}</div>
            <div className="text-sm text-muted-foreground">
              {permission.description}
            </div>
          </div>
          <div className="flex items-center gap-4 flex-1 min-w-64 justify-end">
            <div className="flex items-center gap-2 min-w-24">
              <Checkbox
                id={`${permission.key}-manager`}
                checked={rolePerms.manager}
                disabled={
                  !canManageRoles ||
                  disabled ||
                  (!canGrant && !rolePerms.manager)
                }
                onCheckedChange={(checked) =>
                  onChange(permission.key, 'manager', checked as boolean)
                }
              />
              <Label
                htmlFor={`${permission.key}-manager`}
                className={cn(
                  'font-medium cursor-pointer',
                  canManageRoles ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                User
              </Label>
            </div>
            <div className="flex items-center gap-2 min-w-24">
              <Checkbox
                id={`${permission.key}-admin`}
                checked={rolePerms.admin}
                disabled
              />
              <Label
                htmlFor={`${permission.key}-admin`}
                className={cn(
                  'font-medium cursor-pointer',
                  canManageRoles ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                Admin
              </Label>
            </div>
          </div>
        </div>
      )
    })}
  </div>
)

/** Which grant this row is, and whether the account holds others. */
const RoleScopeSummary = ({
  group,
  otherScopeCount,
}: {
  readonly group: AccountRoleGroup
  readonly otherScopeCount: number
}) => (
  <p className="text-sm text-muted-foreground">
    {group.isRoot
      ? 'Global roles (all names)'
      : `Roles scoped to ${group.resourceLabel}. Scoped roles can be revoked here; grant new ones from Add user.`}
    {otherScopeCount > 0 &&
      ` This account also holds roles on ${otherScopeCount} other ${otherScopeCount === 1 ? 'scope' : 'scopes'}; Remove user revokes those too.`}
  </p>
)

/** Confirms "Remove user", listing every scope that will be revoked. */
const RemoveUserDialog = ({
  open,
  onOpenChange,
  account,
  revocations,
  isPending,
  onConfirm,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly account: Address
  readonly revocations: readonly ResolverRevocation[]
  readonly isPending: boolean
  readonly onConfirm: () => void
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Remove user</DialogTitle>
        <DialogDescription>
          Revoke every role {truncateAddress(account, 6, 4)} holds on this
          resolver, one transaction per scope. This can't be undone.
        </DialogDescription>
        <ul className="flex flex-col gap-1 text-sm">
          {revocations.map((revocation) => (
            <li
              key={revocation.resource.toString()}
              className={cn(
                revocation.resource !== ROOT_RESOURCE && 'font-mono',
              )}
            >
              {revocation.resourceLabel}
            </li>
          ))}
        </ul>
      </DialogHeader>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button
          type="button"
          variant="danger"
          onClick={onConfirm}
          disabled={isPending || revocations.length === 0}
        >
          {isPending ? 'Removing...' : 'Remove'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)

export const ResolverRolesSidebar = ({
  children,
  group,
  removalPlan,
  open,
  setOpen,
  resolverAddress,
  canManageRoles,
}: ResolverRolesSidebarProps) => {
  const isMobile = useIsMobile()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingAction, setPendingAction] =
    useState<ResolverRolesAction | null>(null)

  const { closeModal, clearTransaction } = useTransactionModal()
  // Names the attempt currently in the modal, so a second save or removal in
  // the same session can't be served by the first one's finished actor.
  const attempt = useFlowAttempt()
  const {
    saveMutation,
    removeUserMutation,
    isWalletConnected,
    connectedAddress,
  } = useResolverRolesMutations(resolverAddress)

  const selectedAccount = group?.account as Address | undefined
  const decodedRoles = group?.decodedRoles ?? NO_ROLES
  const resource = group ? BigInt(group.resource) : ROOT_RESOURCE
  const originalPermissions = useMemo(
    () => roleToPermissions(decodedRoles),
    [decodedRoles],
  )

  const [editedPermissions, setEditedPermissions] = useState<
    Map<string, Permission>
  >(new Map())

  // The draft belongs to one row and to the roles it was seeded from. Re-seed
  // when the sheet opens, when another row is selected and when a refetch
  // changes this row's roles, so a draft never moves to another account or
  // resource, and is never diffed against roles it wasn't built from.
  const draftSource =
    open && group
      ? `${resolverRoleGroupId(group)}|${group.decodedRoles.join(',')}`
      : null
  const [seededFrom, setSeededFrom] = useState<string | null>(null)
  if (draftSource !== seededFrom) {
    setSeededFrom(draftSource)
    if (group) setEditedPermissions(roleToPermissions(group.decodedRoles))
  }

  const hasChanges = hasPermissionsChanged(
    originalPermissions,
    editedPermissions,
  )
  const { rolesToGrant, rolesToRevoke } = computeRoleChanges(
    [...decodedRoles],
    editedPermissions,
  )

  const revocations =
    removalPlan?.type === 'complete' ? removalPlan.revocations : NO_REVOCATIONS

  useResetMutationsOnAccountChange(
    selectedAccount,
    saveMutation,
    removeUserMutation,
  )

  const handleSaveChanges = () => {
    if (
      !group ||
      !selectedAccount ||
      !connectedAddress ||
      saveMutation.isPending
    )
      return
    setPendingAction({
      type: 'save',
      resource,
      resourceLabel: group.resourceLabel,
      account: selectedAccount,
      rolesToGrant,
      rolesToRevoke,
    })
    attempt.start(connectedAddress)
  }

  const handleRemoveUser = () => {
    setConfirmOpen(false)
    if (
      !selectedAccount ||
      revocations.length === 0 ||
      !connectedAddress ||
      removeUserMutation.isPending
    )
      return

    removeUserMutation.reset()
    setPendingAction({
      type: 'remove',
      account: selectedAccount,
      revocations,
    })
    attempt.start(connectedAddress)
  }

  const handlePermissionChange = (
    roleKey: string,
    permissionType: 'admin' | 'manager',
    checked: boolean,
  ) => {
    setEditedPermissions((prev) => {
      const newMap = new Map(prev)
      const current = newMap.get(roleKey) || { admin: false, manager: false }
      newMap.set(roleKey, { ...current, [permissionType]: checked })
      return newMap
    })
  }

  // Built from the confirmed snapshot, not from `group`: the table refetches
  // between steps, and the remaining steps must still send what was confirmed.
  const transactions = buildResolverRolesTransactions(
    pendingAction,
    resolverAddress,
    {
      save: (action, id) => saveMutation.mutate({ ...action, id }),
      revoke: (params) => removeUserMutation.mutate(params),
      done: () => {
        closeModal()
        clearTransaction()
        setPendingAction(null)
        attempt.end()
        setOpen(false)
      },
    },
    attempt.scope,
  )

  const isSelf = Boolean(
    selectedAccount &&
      connectedAddress &&
      selectedAccount.toLowerCase() === connectedAddress.toLowerCase(),
  )

  const canEdit = canManageRoles && !isSelf
  const mutationError = saveMutation.error ?? removeUserMutation.error

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="bg-background p-0"
      >
        <div className="h-full overflow-y-auto">
          <div className="p-6 flex flex-col gap-6 h-full">
            <SheetHeader className="p-0 flex flex-row items-center justify-between gap-4">
              <SheetTitle className="font-sans text-h2 flex items-center gap-1">
                {selectedAccount
                  ? truncateAddress(selectedAccount, 6, 4)
                  : 'Role Details'}
                {selectedAccount && <CopyButton value={selectedAccount} />}
              </SheetTitle>
              {canEdit && selectedAccount && (
                <Button
                  variant="outline"
                  disabled={
                    removeUserMutation.isPending ||
                    !isWalletConnected ||
                    revocations.length === 0
                  }
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 className="size-4" />
                  Remove user
                </Button>
              )}
            </SheetHeader>

            {group ? (
              <div className="flex flex-col gap-6">
                <RoleScopeSummary
                  group={group}
                  otherScopeCount={
                    revocations.filter((r) => r.resource !== resource).length
                  }
                />

                {canEdit && removalPlan?.type === 'unreadable' && (
                  <Alert variant="destructive">
                    <AlertDescription>
                      {removalPlan.reason === 'incomplete'
                        ? "The role list is incomplete, so this account can't be fully removed from this page."
                        : "This account holds a grant whose scope can't be read, so it can't be fully removed from this page."}
                    </AlertDescription>
                  </Alert>
                )}

                {mutationError && (
                  <Alert variant="destructive">
                    <AlertDescription>{mutationError.message}</AlertDescription>
                  </Alert>
                )}

                <div className={cn(isSelf && 'opacity-50 pointer-events-none')}>
                  <EditPermissionList
                    editedPermissions={editedPermissions}
                    onChange={handlePermissionChange}
                    canManageRoles={canEdit}
                    canGrant={group.isRoot}
                    disabled={saveMutation.isPending}
                  />
                </div>

                {canEdit && (
                  <div className="flex justify-end">
                    <Button
                      variant="default"
                      disabled={
                        !hasChanges ||
                        saveMutation.isPending ||
                        !isWalletConnected
                      }
                      onClick={handleSaveChanges}
                    >
                      {saveMutation.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-center py-12">
                No role selected
              </div>
            )}
          </div>
        </div>

        {selectedAccount && (
          <RemoveUserDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            account={selectedAccount}
            revocations={revocations}
            isPending={removeUserMutation.isPending}
            onConfirm={handleRemoveUser}
          />
        )}
        <TransactionModal transactions={transactions} />
      </SheetContent>
    </Sheet>
  )
}
