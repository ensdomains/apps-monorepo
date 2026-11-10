import { useLingui } from '@lingui/react/macro'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { RecordType } from '@/features/profile/service/recordTypeLocks'
import { useIsRecordTypeLocked } from './LockedRecordTypes.context'

export const LockedRecordsNotice = ({
  type,
}: {
  readonly type: RecordType
}) => {
  const { t } = useLingui()
  const isLocked = useIsRecordTypeLocked(type)
  if (!isLocked) return null

  const messages: Record<RecordType, string> = {
    text: t`Your wallet doesn’t have permission to change this name’s text records.`,
    address: t`Your wallet doesn’t have permission to change this name’s addresses.`,
    contentHash: t`Your wallet doesn’t have permission to change this name’s content hash.`,
    abi: t`Your wallet doesn’t have permission to change this name’s contract ABI.`,
  }

  return (
    <Alert variant="info">
      <AlertDescription>{messages[type]}</AlertDescription>
    </Alert>
  )
}
