import type { MessageDescriptor } from '@lingui/core'
import { msg } from '@lingui/core/macro'
import { useLingui } from '@lingui/react'
import type { ValidationError as ValidationErrorType } from '@/features/register/utils'

interface ValidationErrorProps {
  error: ValidationErrorType
}

const errorTitles = {
  TOO_SHORT: msg`Too short`,
  INVALID_CHARACTER: msg`Invalid character`,
  INVALID_FORMAT: msg`Not a valid name format`,
} satisfies Record<NonNullable<ValidationErrorType>['type'], MessageDescriptor>

export const ValidationError = ({ error }: ValidationErrorProps) => {
  const { _ } = useLingui()

  if (!error) return null

  const title = _(errorTitles[error.type])
  const message = error.message

  return (
    <div className="flex items-center gap-4 rounded bg-[#fff2f2] p-[22px] shadow-[0px_20px_28px_0px_rgba(14,61,104,0.06)]">
      <div className="flex h-[33px] w-[33px] shrink-0 items-center justify-center rounded-lg bg-[rgba(245,63,63,0.2)]">
        <span className="font-black text-[#f53f3f] text-[17px] leading-[1.4] tracking-[-0.17px]">
          !
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-mono text-[#f53f3f] text-base leading-[1.1] tracking-[-0.32px]">
          {title}
        </p>
        <p className="text-ens-blue-dark text-sm leading-[0.96] tracking-[-0.28px]">
          {message}
        </p>
      </div>
    </div>
  )
}
