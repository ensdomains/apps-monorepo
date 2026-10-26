import { Trans } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

/** "What will I sign?" under the action, holding the longer approval explanation. */
export const PaymentHelp = ({ children }: { readonly children: ReactNode }) => (
  <Collapsible className="flex w-full flex-col items-center gap-3">
    <CollapsibleTrigger className="rounded px-2 py-1 text-ens-quartz-500 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ens-blue">
      <Trans>What will I sign?</Trans>
    </CollapsibleTrigger>
    <CollapsibleContent className="w-full rounded-xl bg-ens-quartz-50 p-4 text-left text-ens-quartz-500 text-sm">
      <p className="mb-1 font-medium text-ens-quartz-900">
        <Trans>What will I sign?</Trans>
      </p>
      {children}
    </CollapsibleContent>
  </Collapsible>
)
