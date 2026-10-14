import { TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { DnsImportType } from '../types'

const OPTIONS: readonly {
  readonly value: DnsImportType
  readonly title: string
  readonly description: string
  /** Shown under the option, before the next one, only while it is selected. */
  readonly notice?: string
}[] = [
  {
    value: 'onchain',
    title: 'Onchain import',
    description:
      'Your name will have an onchain token. Records and subnames may be edited here. Import in one transaction for the cost of gas.',
    notice:
      'Onchain DNS imports are currently supported by ENS v1. In the future it will be possible to migrate to ENS v2 functionality.',
  },
  {
    value: 'offchain',
    title: 'Offchain import',
    description:
      'Your name will not have an onchain token, and you will not be able to edit your profile from ENS. This name can receive transactions as an ETH address, which you may edit at your DNS provider.',
  },
]

export const SelectImportType = ({
  name,
  type,
  onTypeChange,
  onBegin,
}: {
  readonly name: string
  readonly type: DnsImportType
  readonly onTypeChange: (type: DnsImportType) => void
  readonly onBegin: () => void
}) => (
  <div className="flex flex-col gap-6">
    <div className="rounded-xl border p-6 flex flex-col gap-5">
      <p className="text-p">
        Choose how to import <strong className="font-medium">{name}</strong>.
        Both routes involve turning on DNSSEC and adding a TXT record at your
        DNS provider.
      </p>
      <RadioGroup
        value={type}
        onValueChange={(value) => onTypeChange(value as DnsImportType)}
        className="gap-5"
      >
        {OPTIONS.map((option) => (
          <div key={option.value} className="flex flex-col gap-5">
            <label
              htmlFor={`dns-import-type-${option.value}`}
              className="flex items-start gap-3 cursor-pointer"
            >
              <RadioGroupItem
                id={`dns-import-type-${option.value}`}
                value={option.value}
                className="mt-0.5"
              />
              <div className="flex flex-col gap-1">
                <span className="font-medium">{option.title}</span>
                <span className="text-p text-muted-foreground">
                  {option.description}
                </span>
              </div>
            </label>
            {option.notice && type === option.value && (
              <div className="flex items-start gap-2 rounded-sm bg-message-warning-fill p-3 text-p text-message-warning-text">
                <TriangleAlert
                  className="size-4 shrink-0 mt-0.5"
                  strokeWidth={1.5}
                />
                <span>{option.notice}</span>
              </div>
            )}
          </div>
        ))}
      </RadioGroup>
    </div>
    <Button className="w-full" onClick={onBegin}>
      Begin
    </Button>
  </div>
)
