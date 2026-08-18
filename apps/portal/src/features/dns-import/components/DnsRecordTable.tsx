import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { DnsRecordSpec } from '../helpers/records'

const CopyValue = ({ value }: { readonly value: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-6"
      aria-label={`Copy ${value}`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

const Row = ({
  label,
  children,
}: {
  readonly label: string
  readonly children: React.ReactNode
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
  readonly foundRow: React.ReactNode
}) => (
  <div className="rounded-xl border p-6 flex flex-col gap-4 text-sm">
    <div className="flex flex-col sm:flex-row gap-4 sm:gap-12">
      <Row label="Type">
        <span className="font-mono">{record.type}</span>
      </Row>
      <Row label="Name">
        <span className="inline-flex items-center gap-1 font-mono">
          {record.name}
          <CopyValue value={record.name} />
        </span>
      </Row>
    </div>
    <Row label="Value">
      <span className="inline-flex items-start gap-1 font-mono break-all">
        {record.value}
        <CopyValue value={record.value} />
      </span>
    </Row>
    <div className="border-t pt-4">
      <Row label="Found">{foundRow}</Row>
    </div>
  </div>
)
