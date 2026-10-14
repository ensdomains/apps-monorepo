import type { ReactNode } from 'react'
import { EntityBadge } from '@/components/EntityBadge'
import type { DnsRecordSpec } from '../helpers/records'

const Row = ({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}) => (
  <div className="flex items-start gap-6">
    <span className="w-16 shrink-0 text-muted-foreground">{label}</span>
    {children}
  </div>
)

/**
 * The record the user must add at their DNS provider (Type / Name / Value),
 * plus a caller-provided "Found" row showing what the check discovered.
 */
export const DnsRecordTable = ({
  record,
  foundRow,
}: {
  readonly record: DnsRecordSpec
  readonly foundRow: ReactNode
}) => (
  <div className="rounded-xl border p-6 flex flex-col gap-4 text-p">
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-12">
      <Row label="Type">
        <span className="inline-flex h-5 items-center px-1 text-entity-base">
          {record.type}
        </span>
      </Row>
      <Row label="Name">
        <EntityBadge
          type="content"
          variant="default"
          copyValue={record.name}
          compact
        >
          {record.name}
        </EntityBadge>
      </Row>
    </div>
    <Row label="Value">
      <EntityBadge
        type="content"
        variant="default"
        format="wrap"
        // A sample value holds a placeholder, not an address — copying it
        // would only produce a record that can never verify.
        copyValue={record.isSample ? undefined : record.value}
        compact
      >
        {record.value}
      </EntityBadge>
    </Row>
    <div className="border-t pt-4">
      <Row label="Found">{foundRow}</Row>
    </div>
  </div>
)
