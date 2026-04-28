import type { FC, PropsWithChildren } from 'react'
import { BlockExplorerTxLink } from '@/components/BlockExplorerTxLink'
import { DataRow } from '@/components/DataRow'
import { AddressDisplay } from '@/components/table/EventsDataTable/AddressDisplay'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { RoleHistoryEntry } from '@/features/roles/hooks/useRoleHistory'
import { useIsMobile } from '@/hooks/use-mobile'
import { sepoliaWithEns } from '@/lib/wagmi'
import { formatTimestamp } from '@/utils/formatting/formatTimestamp'

const RoleList = ({ roles }: { readonly roles: readonly string[] }) => {
  if (roles.length === 0) {
    return <span className="text-muted-foreground text-sm">No roles</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <Badge key={role} variant="secondary">
          {role}
        </Badge>
      ))}
    </div>
  )
}

const RoleChanges = ({ entry }: { readonly entry: RoleHistoryEntry }) => {
  const added = entry.newRoles.filter((r) => !entry.oldRoles.includes(r))
  const removed = entry.oldRoles.filter((r) => !entry.newRoles.includes(r))

  if (added.length === 0 && removed.length === 0) {
    return <span className="text-muted-foreground text-sm">No change</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {added.map((role) => (
        <Badge key={`added-${role}`} variant="success">
          + {role}
        </Badge>
      ))}
      {removed.map((role) => (
        <Badge key={`removed-${role}`} variant="danger">
          - {role}
        </Badge>
      ))}
    </div>
  )
}

interface RoleHistorySidebarProps extends PropsWithChildren {
  readonly entry: RoleHistoryEntry | null
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const RoleHistorySidebar: FC<RoleHistorySidebarProps> = ({
  children,
  entry,
  open,
  setOpen,
}) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-220 bg-card p-0 flex flex-col h-dvh"
      >
        <div className="p-6 shrink-0 border-b">
          <SheetHeader>
            <SheetTitle className="font-sans text-heading font-medium">
              Role change
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {entry ? (
            <div className="p-6 flex flex-col gap-6">
              <div className="flex flex-col gap-4 p-6 border border-border rounded-sm">
                <DataRow label="Date">
                  <span>{formatTimestamp(BigInt(entry.timestamp))} UTC</span>
                </DataRow>

                <DataRow label="Account">
                  <AddressDisplay address={entry.account} />
                </DataRow>

                <DataRow label="Tx Hash">
                  <BlockExplorerTxLink
                    txHash={entry.transactionHash}
                    chainId={sepoliaWithEns.id}
                  />
                </DataRow>

                <DataRow label="Block">
                  <span>{entry.blockNumber}</span>
                </DataRow>

                <DataRow label="Network">
                  <span>Sepolia</span>
                </DataRow>
              </div>

              <div className="flex flex-col gap-4 p-6 border border-border rounded-sm">
                <DataRow label="Changes">
                  <RoleChanges entry={entry} />
                </DataRow>

                <DataRow label="Previous roles">
                  <RoleList roles={entry.oldRoles} />
                </DataRow>

                <DataRow label="New roles">
                  <RoleList roles={entry.newRoles} />
                </DataRow>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-center py-12">
              No role change selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
