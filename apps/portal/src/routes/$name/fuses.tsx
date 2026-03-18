import type { DecodedFuses } from '@ensdomains/ensjs/utils'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import type { ColumnDef } from '@tanstack/react-table'
import { Flame, Info } from 'lucide-react'
import { CopyableRecord } from '@/components/CopyableRecord'
import { DataTable } from '@/components/DataTable'
import { ErrorMessage } from '@/components/ErrorMessage'
import { LoadingMessage } from '@/components/LoadingMessage'
import { NotFoundMessage } from '@/components/NotFoundMessage'
import { Button } from '@/components/ui/button'
import { MessageCard } from '@/components/ui/message-card'
import { getWrapperDataQueryOptions } from '@/features/resolver/hooks/useWrapperData'

export const Route = createFileRoute('/$name/fuses')({
  component: RouteComponent,
  notFoundComponent: () => <NotFoundMessage />,
})

type FuseScope = 'Parent' | 'Owner'

interface FuseDefinition {
  name: string
  key: keyof typeof fuseKeys
  scope: FuseScope
  description: string
}

const fuseKeys = {
  PARENT_CANNOT_CONTROL: 'PARENT_CANNOT_CONTROL',
  IS_DOT_ETH: 'IS_DOT_ETH',
  CAN_EXTEND_EXPIRY: 'CAN_EXTEND_EXPIRY',
  CANNOT_UNWRAP: 'CANNOT_UNWRAP',
  CANNOT_BURN_FUSES: 'CANNOT_BURN_FUSES',
  CANNOT_TRANSFER: 'CANNOT_TRANSFER',
  CANNOT_SET_TTL: 'CANNOT_SET_TTL',
  CANNOT_CREATE_SUBDOMAIN: 'CANNOT_CREATE_SUBDOMAIN',
  CANNOT_APPROVE: 'CANNOT_APPROVE',
} as const

const fuseDefinitions: FuseDefinition[] = [
  {
    name: 'Parent Cannot Control',
    key: 'PARENT_CANNOT_CONTROL',
    scope: 'Parent',
    description: 'When burned, the parent name can no longer control this name',
  },
  {
    name: 'Is Dot ETH',
    key: 'IS_DOT_ETH',
    scope: 'Parent',
    description: 'Indicates this name is a .eth second-level domain',
  },
  {
    name: 'Can Extend Expiry',
    key: 'CAN_EXTEND_EXPIRY',
    scope: 'Parent',
    description: 'Allows the owner to extend the expiry of the name',
  },
  {
    name: 'Cannot Unwrap',
    key: 'CANNOT_UNWRAP',
    scope: 'Parent',
    description: 'When burned, the name cannot be unwrapped back to a DNS name',
  },
  {
    name: 'Cannot Burn Fuses',
    key: 'CANNOT_BURN_FUSES',
    scope: 'Owner',
    description: 'When burned, the owner can no longer burn fuses',
  },
  {
    name: 'Cannot Transfer',
    key: 'CANNOT_TRANSFER',
    scope: 'Owner',
    description: 'When burned, the name cannot be transferred',
  },
  {
    name: 'Cannot Set TTL',
    key: 'CANNOT_SET_TTL',
    scope: 'Owner',
    description: 'When burned, the TTL cannot be changed',
  },
  {
    name: 'Cannot Create Subname',
    key: 'CANNOT_CREATE_SUBDOMAIN',
    scope: 'Owner',
    description: 'When burned, subnames cannot be created',
  },
  {
    name: 'Cannot Approve',
    key: 'CANNOT_APPROVE',
    scope: 'Owner',
    description: 'When burned, token approvals are not allowed',
  },
]

type FuseRow = FuseDefinition & { isBurnt: boolean }

function RouteComponent() {
  const { name } = Route.useParams()

  const wrapperDataQuery = useQuery({
    ...getWrapperDataQueryOptions({ name }),
  })

  if (wrapperDataQuery.isLoading) {
    return <LoadingMessage title="Loading fuses..." />
  }

  if (wrapperDataQuery.error) {
    return (
      <ErrorMessage
        title="Failed to load fuses"
        description={wrapperDataQuery.error.cause?.message}
      />
    )
  }

  const wrapperData = wrapperDataQuery.data

  if (!wrapperData) {
    return <V2NameMessage />
  }

  const fuses = wrapperData.fuses as DecodedFuses | undefined
  const expiry = wrapperData.expiry
  const hasBurnedFuses =
    fuses?.parent &&
    Object.values(fuses.parent).some((v) => typeof v === 'boolean' && v)

  const data: FuseRow[] = fuseDefinitions.map((fuse) => ({
    ...fuse,
    isBurnt: isFuseBurnt(fuse.key, fuses),
  }))

  return (
    <div className="flex flex-col gap-6 max-w-screen-2xl mx-auto px-6 py-6 w-full">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-medium">Fuses</h1>
          <Button variant="secondary" className="gap-2">
            <Flame className="w-4 h-4 text-lapis-500" />
            Burn fuses
          </Button>
        </div>
      </div>

      <div className="flex gap-2 items-start max-w-[800px]">
        <Info className="w-8 h-8 text-quartz-500 shrink-0" />
        <p className="text-quartz-500 text-sm">
          A fuse is a permission or perk that can be granted/revoked on a name.
          As the name implies, once the fuse is "burned", it cannot be unburned.{' '}
          <a
            href="https://docs.ens.domains/wrapper/fuses"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lapis-500 underline decoration-dotted hover:decoration-solid"
          >
            Learn more about Fuses in the documentation
          </a>
          .
        </p>
      </div>

      {hasBurnedFuses && expiry && (
        <div className="border border-border rounded-2xl p-6 flex gap-4 items-center">
          <p className="font-medium whitespace-nowrap">Fuse expiry</p>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-sm truncate">
              {new Date(Number(expiry) * 1000).toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short',
              })}
            </span>
            <CopyableRecord value={expiry.toString()} />
          </div>
        </div>
      )}

      <div className="border border-border rounded-2xl overflow-hidden">
        <DataTable columns={columns} data={data} />
      </div>
    </div>
  )
}

const columns: ColumnDef<FuseRow>[] = [
  {
    accessorKey: 'name',
    header: 'Fuse',
    cell: ({ row }) => {
      const { name } = row.original
      return (
        <div className="flex items-center gap-1">
          <span className="font-mono">{name}</span>
          <Info className="w-5 h-5 text-quartz-500 cursor-help" />
        </div>
      )
    },
  },
  {
    accessorKey: 'scope',
    header: 'Scope',
    cell: ({ row }) => {
      const { scope } = row.original
      return scope
    },
  },
  {
    accessorKey: 'isBurnt',
    header: 'Burnt',
    cell: ({ row }) => {
      const { isBurnt } = row.original
      return (
        <div
          className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
            isBurnt ? 'bg-orange-50' : 'bg-quartz-50'
          }`}
        >
          {isBurnt ? (
            <Flame className="w-4 h-4" />
          ) : (
            <span className="w-4 h-4 flex items-center justify-center">✗</span>
          )}
          {isBurnt ? 'True' : 'False'}
        </div>
      )
    },
  },
]

const V2NameMessage = () => (
  <MessageCard
    icon={<Info className="size-8" />}
    title="Fuses not available"
    description={
      <>
        <p>Fuses are not available for ENSv2 names.</p>
        <p className="text-quartz-500 text-sm mt-2">
          Only ENSv1 names have fuses.
        </p>
      </>
    }
  />
)

function isFuseBurnt(
  fuseKey: keyof typeof fuseKeys,
  fuses?: DecodedFuses,
): boolean {
  if (!fuses) return false
  const parentFuses = fuses.parent as DecodedFuses['parent'] &
    Record<string, unknown>
  const childFuses = fuses.child as DecodedFuses['child'] &
    Record<string, unknown>
  if (parentFuses && parentFuses[fuseKey] === true) return true
  if (childFuses && childFuses[fuseKey] === true) return true
  return false
}
