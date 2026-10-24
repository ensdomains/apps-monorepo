import { Trans } from '@lingui/react/macro'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ProfileRecords } from '@/features/profile/types'
import { getOtherRecordIssues } from './OtherRecordsTab.helpers'

/** Raw recovered values stay visible/editable even without a dedicated field. */
export const OtherRecordsTab = ({
  values,
  onChange,
  savedAbi,
}: {
  readonly values: ProfileRecords
  readonly savedAbi?: string
  readonly onChange: (
    value: Pick<ProfileRecords, 'unknown' | 'contentHash' | 'abi'>,
  ) => void
}) => {
  const id = useId()
  const [rowKeys, setRowKeys] = useState(() =>
    values.unknown.map(() => crypto.randomUUID()),
  )
  const update = (index: number, patch: { key?: string; value?: string }) =>
    onChange({
      ...values,
      unknown: values.unknown.map((record, currentIndex) =>
        currentIndex === index ? { ...record, ...patch } : record,
      ),
    })
  return (
    <div className="space-y-5">
      {getOtherRecordIssues(values, savedAbi).map((issue) => (
        <p className="text-destructive text-sm" key={issue} role="alert">
          {issue}
        </p>
      ))}
      <p className="text-muted-foreground text-sm">
        <Trans>
          Review custom records, content hash and contract ABI. Empty values
          remove a record.
        </Trans>
      </p>
      {values.unknown.map((record, index) => (
        <div
          className="space-y-2 rounded-lg border border-ens-quartz-200 p-3"
          key={rowKeys[index]}
        >
          <Input
            aria-label={`Record ${index + 1} key`}
            onChange={(event) => update(index, { key: event.target.value })}
            value={record.key}
          />
          <Textarea
            aria-label={`Record ${index + 1} value`}
            onChange={(event) => update(index, { value: event.target.value })}
            value={record.value}
          />
          <Button
            onClick={() => {
              setRowKeys((keys) =>
                keys.filter((_, currentIndex) => index !== currentIndex),
              )
              onChange({
                ...values,
                unknown: values.unknown.filter(
                  (_, currentIndex) => index !== currentIndex,
                ),
              })
            }}
            type="button"
            variant="ghost"
          >
            <Trans>Remove record</Trans>
          </Button>
        </div>
      ))}
      <Button
        onClick={() => {
          setRowKeys((keys) => [...keys, crypto.randomUUID()])
          onChange({
            ...values,
            unknown: [...values.unknown, { key: '', value: '' }],
          })
        }}
        type="button"
        variant="outline"
      >
        <Trans>Add custom record</Trans>
      </Button>
      <label className="block space-y-2" htmlFor={`${id}-contenthash`}>
        <span>
          <Trans>Content hash</Trans>
        </span>
        <Input
          id={`${id}-contenthash`}
          onChange={(event) =>
            onChange({ ...values, contentHash: event.target.value })
          }
          value={values.contentHash ?? ''}
        />
      </label>
      <label className="block space-y-2" htmlFor={`${id}-abi`}>
        <span>
          <Trans>Contract ABI (JSON)</Trans>
        </span>
        <Textarea
          id={`${id}-abi`}
          onChange={(event) => onChange({ ...values, abi: event.target.value })}
          value={values.abi ?? ''}
        />
      </label>
    </div>
  )
}
