import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { getRegistrationDataQueryOptions } from '@/features/profile/hooks/useRegistrationData'
import { ExtensionDurationOrExpiryPicker } from '@/features/renew/components/ExtensionDurationOrExpiryPicker'
import { formatDateTime } from '@/utils/formatting/formatDateTime'
import { unixSecondsToPlainDateUtc } from '@/utils/temporal'
import {
  DEFAULT_SUBNAME_EXPIRY,
  isPastParentExpiry,
  readSubnameExpiryClock,
  type SubnameExpiry,
} from '../utils/subnameExpiry'

type ExpiryOptionProps = {
  readonly value: SubnameExpiry['type']
  readonly title: string
  readonly description: string
  readonly isRecommended?: boolean
}

const ExpiryOption = ({
  value,
  title,
  description,
  isRecommended = false,
}: ExpiryOptionProps) => (
  <label
    htmlFor={`subname-expiry-${value}`}
    className="flex items-start gap-3 cursor-pointer"
  >
    <RadioGroupItem
      id={`subname-expiry-${value}`}
      value={value}
      className="mt-0.5"
    />
    <div className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{title}</span>
        {isRecommended && (
          <Badge variant="secondary" className="text-small">
            Recommended
          </Badge>
        )}
      </span>
      <span className="text-p text-muted-foreground">{description}</span>
    </div>
  </label>
)

type SubnameExpiryFieldProps = {
  readonly parentName: string
  readonly expiry: SubnameExpiry
  readonly onExpiryChange: (expiry: SubnameExpiry) => void
  readonly disabled?: boolean
}

export const SubnameExpiryField = ({
  parentName,
  expiry,
  onExpiryChange,
  disabled = false,
}: SubnameExpiryFieldProps) => {
  const parentQuery = useQuery(
    getRegistrationDataQueryOptions({ name: parentName }),
  )
  const parentExpiry = parentQuery.data?.expiry ?? null
  const isPastParent =
    parentExpiry !== null &&
    isPastParentExpiry(expiry, readSubnameExpiryClock(), BigInt(parentExpiry))

  return (
    <FieldSet disabled={disabled}>
      <FieldLegend variant="label">Expiry</FieldLegend>
      <RadioGroup
        value={expiry.type}
        onValueChange={(value) =>
          onExpiryChange(
            value === 'span'
              ? { type: 'span', span: { type: 'years', years: 1 } }
              : DEFAULT_SUBNAME_EXPIRY,
          )
        }
        className="gap-4"
      >
        <ExpiryOption
          value="none"
          title={`Expires with ${parentName}`}
          description={`Lasts as long as ${parentName} stays registered.`}
          isRecommended
        />
        <ExpiryOption
          value="span"
          title="Set an expiry"
          description="Stops resolving on the date you pick, unless it’s extended."
        />
      </RadioGroup>
      {expiry.type === 'span' && (
        <ExtensionDurationOrExpiryPicker
          span={expiry.span}
          setSpan={(span) => onExpiryChange({ type: 'span', span })}
          disabled={disabled}
        />
      )}
      {isPastParent && (
        <Alert variant="warning">
          <AlertDescription>
            {parentName} expires on{' '}
            {formatDateTime(unixSecondsToPlainDateUtc(parentExpiry))}. The
            subname stops resolving then, unless {parentName} is renewed.
          </AlertDescription>
        </Alert>
      )}
      {expiry.type === 'span' && parentQuery.isError && (
        <p className="text-p text-muted-foreground">
          Couldn’t read when {parentName} expires, so this date isn’t checked
          against it.
        </p>
      )}
    </FieldSet>
  )
}
