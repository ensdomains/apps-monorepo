import type { ReactNode } from 'react'
import { match, P } from 'ts-pattern'
import { cn } from '@/lib/utils'
import type { PaymentFlow, PaymentFundingSummary } from '../payment.types'
import { PaymentBreakdown } from './PaymentBreakdown'

export const PaymentReceipt = ({
  label,
  flow,
  funding,
  isQuoting = false,
  header,
  description,
}: {
  readonly label: string
  readonly flow: PaymentFlow
  readonly funding: PaymentFundingSummary | undefined
  readonly isQuoting?: boolean
  readonly header?: ReactNode
  readonly description?: ReactNode
}) => {
  const domainName = `${label}.eth`
  const length = Array.from(domainName).length
  return (
    <div className="flex w-full min-w-0 flex-col items-center gap-4 rounded-2xl bg-ens-quartz-50 p-6">
      {header}
      <span
        className={cn(
          'wrap-anywhere w-full min-w-0 whitespace-normal text-center font-medium font-semi-mono text-ens-gray leading-ens-none tracking-[-0.8px]',
          // Figma name sizes by length; no type-scale token matches them.
          match(length)
            .with(P.number.gt(43), () => 'text-[22px]')
            .with(P.number.gte(10), () => 'text-[32px]')
            .otherwise(() => 'text-[40px]'),
        )}
        title={domainName}
      >
        {domainName}
      </span>
      {description && (
        <p className="text-center text-ens-quartz-500 text-sm">{description}</p>
      )}
      <PaymentBreakdown flow={flow} funding={funding} isQuoting={isQuoting} />
    </div>
  )
}
