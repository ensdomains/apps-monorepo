import { Trans, useLingui } from '@lingui/react/macro'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { useState } from 'react'
import { PatternAvatar } from '@/components/atoms/PatternAvatar/PatternAvatar'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { EXPLORER_URL } from '@/constants'
import type { ProfileRecords } from '@/features/profile/types'
import { useCopyFeedback } from '@/hooks/useCopyFeedback'
import { ExplorerEntityLink } from './ExplorerEntityLink'
import { ExplorerHistoryLink } from './ExplorerHistoryLink'
import { OtherRecordsTab } from './OtherRecordsTab'
import { getOtherRecordIssues } from './OtherRecordsTab.helpers'

interface AdvancedTabProps {
  readonly name: string
  readonly values: ProfileRecords
  readonly savedAbi?: string
  readonly onChange: (
    value: Pick<ProfileRecords, 'unknown' | 'contentHash' | 'abi'>,
  ) => void
}

export const AdvancedTab = ({
  name,
  values,
  savedAbi,
  onChange,
}: AdvancedTabProps) => {
  const { t } = useLingui()
  const { copied, copy } = useCopyFeedback()
  const [isLocalEditorOpen, setIsLocalEditorOpen] = useState(false)
  const hasValidationIssues = getOtherRecordIssues(values, savedAbi).length > 0
  const nameHref = EXPLORER_URL
    ? `${EXPLORER_URL}/${encodeURIComponent(name)}`
    : null

  return (
    <div className="space-y-5 text-ens-quartz-500 text-sm leading-relaxed">
      <div className="space-y-3">
        <h3 className="font-medium text-ens-quartz-700">
          <Trans>Advanced</Trans>
        </h3>
        {nameHref ? (
          <>
            <p>
              <Trans>
                The{' '}
                <a
                  className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  href={EXPLORER_URL ?? undefined}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  ENS Explorer app
                </a>{' '}
                is home to advanced features and details about this name.
              </Trans>
            </p>
            <div>
              <Trans>
                Visit{' '}
                <ExplorerEntityLink
                  actions={
                    <>
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={nameHref}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          <Trans>View name</Trans>
                        </a>
                      </Button>
                      <Button
                        aria-label={t`Copy name`}
                        onClick={() => copy(name)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {copied ? (
                          <Check aria-hidden className="size-4" />
                        ) : (
                          <Copy aria-hidden className="size-4" />
                        )}
                        {copied ? <Trans>Copied</Trans> : <Trans>Copy</Trans>}
                      </Button>
                    </>
                  }
                  actionsLabel={t`Name actions`}
                  className="bg-ens-lapis-bg text-ens-lapis-500"
                  href={nameHref}
                >
                  <span aria-hidden className="size-5 shrink-0">
                    <PatternAvatar
                      className="border-none shadow-none"
                      name={name}
                    />
                  </span>
                  <span className="truncate font-mono">{name}</span>
                </ExplorerEntityLink>{' '}
                to create and edit custom records, subnames, and permissions.
              </Trans>
            </div>
            <ExplorerHistoryLink href={`${nameHref}/history`} name={name} />
          </>
        ) : (
          <p>
            <Trans>
              ENS Explorer is not available on this network yet. You can edit
              advanced records here.
            </Trans>
          </p>
        )}
        <p>
          <Trans>
            Note: ENS Explorer is designed for developers! Keep the{' '}
            <a
              className="rounded-sm underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
              href="https://docs.ens.domains"
              rel="noopener noreferrer"
              target="_blank"
            >
              ENS docs
            </a>{' '}
            handy as you dive in.
          </Trans>
        </p>
      </div>
      <Collapsible
        onOpenChange={setIsLocalEditorOpen}
        open={!nameHref || hasValidationIssues || isLocalEditorOpen}
      >
        <CollapsibleTrigger
          className="group flex items-center gap-1.5 rounded-sm font-medium text-ens-quartz-700 focus-visible:outline-2 focus-visible:outline-offset-2"
          type="button"
        >
          <Trans>Edit records here</Trans>
          <ChevronDown
            aria-hidden
            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <OtherRecordsTab
            onChange={onChange}
            savedAbi={savedAbi}
            values={values}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
