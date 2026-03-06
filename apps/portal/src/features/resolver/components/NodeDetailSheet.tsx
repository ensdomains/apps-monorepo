import { Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type {
  ResolverNode,
  ResolverRole,
} from '@/features/resolver/hooks/useResolverOverview'
import { useIsMobile } from '@/hooks/use-mobile'
import { truncateAddress } from '@/utils/formatting/truncateAddress'

interface NodeDetailSheetProps extends PropsWithChildren {
  readonly node: ResolverNode | null
  readonly roles: readonly ResolverRole[]
  readonly open: boolean
  readonly setOpen: React.Dispatch<React.SetStateAction<boolean>>
}

export const NodeDetailSheet = ({
  children,
  node,
  roles,
  open,
  setOpen,
}: NodeDetailSheetProps) => {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={setOpen} defaultOpen={false}>
      {children}
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="sm:max-w-[640px] bg-white p-0 flex flex-col h-dvh"
      >
        <div className="p-6 shrink-0 border-b">
          <SheetHeader className="p-0 flex flex-row items-center justify-between">
            <SheetTitle className="font-sans text-heading font-medium">
              {node?.name ?? 'Node Details'}
            </SheetTitle>
            {node && (
              <Button variant="secondary" size="sm" asChild>
                <Link to="/$name" params={{ name: node.name }}>
                  Go to name
                </Link>
              </Button>
            )}
          </SheetHeader>
        </div>

        <div className="flex-1 overflow-y-auto">
          {node ? (
            <div className="flex flex-col gap-0">
              <section className="p-6 border-b flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Records</h3>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/$name/records" params={{ name: node.name }}>
                      <ExternalLink className="size-3.5" />
                      Go to records
                    </Link>
                  </Button>
                </div>
              </section>

              <section className="p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">Roles</h3>
                  <Button variant="secondary" size="sm" asChild>
                    <Link
                      to="/resolver/$address/roles"
                      params={{
                        address: node.resolver?.address ?? '',
                      }}
                    >
                      <ExternalLink className="size-3.5" />
                      Go to roles
                    </Link>
                  </Button>
                </div>
                {roles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No roles assigned for this node.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Role Bitmap</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={`${role.account}-${role.roleBitmap}`}>
                          <TableCell className="font-mono text-xs">
                            <div className="flex items-center gap-1">
                              {truncateAddress(role.account)}
                              <CopyButton value={role.account} />
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {role.roleBitmap}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </section>
            </div>
          ) : (
            <div className="text-quartz-400 text-center py-12">
              No node selected
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
