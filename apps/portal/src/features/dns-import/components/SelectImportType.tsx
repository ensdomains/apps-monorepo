import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { DnsImportType } from '../types'

const OPTIONS: readonly {
  readonly value: DnsImportType
  readonly title: string
  readonly lines: readonly string[]
}[] = [
  {
    value: 'offchain',
    title: 'Free off-chain import',
    lines: [
      'Your name will not have an on-chain token.',
      'This does not affect its ability to receive transactions or be used as a primary name.',
      'You will not be able to edit your profile from ENS.',
    ],
  },
  {
    value: 'onchain',
    title: 'On-chain import',
    lines: ['Your name will have an on-chain token.'],
  },
]

export const SelectImportType = ({
  type,
  onTypeChange,
  onBegin,
}: {
  readonly type: DnsImportType
  readonly onTypeChange: (type: DnsImportType) => void
  readonly onBegin: () => void
}) => (
  <div className="flex flex-col gap-6">
    <div className="rounded-xl border p-6 flex flex-col gap-5">
      <p className="text-p">
        Importing DNS names allows them to be used as ENS names.
      </p>
      <RadioGroup
        value={type}
        onValueChange={(value) => onTypeChange(value as DnsImportType)}
        className="gap-5"
      >
        {OPTIONS.map((option) => (
          <label
            key={option.value}
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
              {option.lines.map((line) => (
                <span key={line} className="text-sm text-muted-foreground">
                  {line}
                </span>
              ))}
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
    <Button className="w-full" onClick={onBegin}>
      Begin
    </Button>
  </div>
)
