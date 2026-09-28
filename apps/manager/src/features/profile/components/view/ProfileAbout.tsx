import { Trans } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { cardSurfaceTreatmentClassName } from '@/components/ui/card-surface'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { MSymbol } from '@/components/ui/material-symbol'
import { NamePill } from '@/features/dashboard/components/NamePill'
import type { ProfileRecords } from '@/features/profile/types'
import { cn } from '@/lib/utils'
import { getDisplayHost, getSafeProfileHref } from './ProfileView.helpers'

const getContactRecordValue = (records: ProfileRecords | null, key: string) =>
  records?.contact.find((record) => record.key === key)?.value?.trim()

const formatLanguage = (language: string | undefined) =>
  language
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .join(', ')
    .toUpperCase()

const useHasHiddenDescription = (description: string) => {
  const descriptionRef = useRef<HTMLParagraphElement>(null)
  const [hasHiddenContent, setHasHiddenContent] = useState(false)

  useEffect(() => {
    const element = descriptionRef.current
    if (!element) return

    const updateOverflow = () => {
      setHasHiddenContent(
        description.length > 0 &&
          element.scrollHeight > element.clientHeight + 1,
      )
    }

    updateOverflow()
    const resizeObserver = new ResizeObserver(updateOverflow)
    resizeObserver.observe(element)
    return () => resizeObserver.disconnect()
  }, [description])

  return { descriptionRef, hasHiddenContent }
}

const ProfileDescription = ({
  description,
}: {
  readonly description: string
}) => {
  const { descriptionRef, hasHiddenContent } =
    useHasHiddenDescription(description)

  return (
    <Dialog>
      <div className="mt-3">
        <p
          className="wrap-anywhere line-clamp-2 text-ens-quartz-500 text-sm leading-normal"
          ref={descriptionRef}
        >
          {description}
        </p>
        {hasHiddenContent ? (
          <DialogTrigger asChild>
            <button
              className="mt-1 font-medium text-(--theme-color) text-sm hover:underline focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2"
              type="button"
            >
              <Trans>Show more</Trans>
            </button>
          </DialogTrigger>
        ) : null}
      </div>
      <DialogContent className="overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>About</Trans>
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="wrap-anywhere min-h-0 overflow-y-auto whitespace-pre-wrap text-ens-quartz-700 text-sm leading-normal">
          {description}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  )
}

const AboutMetaItem = ({
  icon,
  value,
}: {
  readonly icon: React.ReactNode
  readonly value: string | undefined
}) => {
  if (!value) return null

  return (
    <div className="flex min-w-0 items-center gap-1 text-ens-quartz-700">
      <span className="flex size-5 shrink-0 items-center justify-center text-ens-quartz-700 leading-none lg:landscape:size-6">
        {icon}
      </span>
      <span className="min-w-0 text-[12px] leading-4.5 lg:landscape:text-sm lg:landscape:leading-normal">
        {value}
      </span>
    </div>
  )
}

export const ProfileAbout = ({
  className,
  records,
  primaryName,
}: {
  readonly className?: string
  readonly records: ProfileRecords | null
  readonly primaryName?: string
}) => {
  const websiteHref = records?.base.url
    ? getSafeProfileHref(records.base.url)
    : undefined
  const fullName = records?.base.name?.trim()
  const timezone = getContactRecordValue(records, 'timezone')
  const language = formatLanguage(records?.base.language)
  const location = getContactRecordValue(records, 'location')?.toUpperCase()

  return (
    <section
      className={cn(
        'wrap-anywhere flex min-h-0 min-w-0 flex-1',
        primaryName
          ? `${cardSurfaceTreatmentClassName} min-h-47 rounded-xl p-6 lg:landscape:min-h-45 lg:landscape:max-w-158.75`
          : 'rounded-none border-0 bg-transparent p-0 shadow-none lg:landscape:min-h-45.5 lg:landscape:max-w-158.75 lg:landscape:rounded-xl lg:landscape:border-[0.25px] lg:landscape:border-ens-quartz-300 lg:landscape:bg-white lg:landscape:p-6 lg:landscape:shadow-ens-card',
        className,
      )}
    >
      <div
        className={cn(
          'grid w-full min-w-0',
          primaryName
            ? 'gap-3'
            : 'gap-8 lg:landscape:grid-cols-[minmax(0,346.5px)_228px] lg:landscape:gap-3',
        )}
      >
        <div className="min-w-0">
          {primaryName ? (
            <NamePill
              className="bg-[var(--theme-color,var(--color-ens-lapis-500))] text-white"
              label={primaryName}
            />
          ) : (
            <h2 className="text-base text-ens-quartz-700 leading-normal">
              <span className="block">{fullName || <Trans>About</Trans>}</span>
            </h2>
          )}
          {records?.base.description ? (
            <ProfileDescription description={records.base.description} />
          ) : null}
          {websiteHref ? (
            <a
              className="mt-1 inline-flex max-w-full items-center gap-1 font-mono text-(--theme-color) text-sm leading-normal hover:opacity-80"
              href={websiteHref}
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="min-w-0">{getDisplayHost(websiteHref)}</span>
              <MSymbol
                className="ms-opsz-20 ms-wght-300 shrink-0"
                symbol="arrow_outward"
              />
            </a>
          ) : null}
        </div>
        {primaryName ? null : (
          <div className="grid min-w-0 grid-cols-3 gap-4 lg:landscape:flex lg:landscape:flex-col lg:landscape:justify-start lg:landscape:gap-1.5">
            <AboutMetaItem
              icon={
                <MSymbol
                  className="ms-opsz-20 ms-wght-300 text-[20px] lg:landscape:ms-opsz-24 lg:landscape:text-[24px]"
                  symbol="language"
                />
              }
              value={timezone}
            />
            <AboutMetaItem
              icon={
                <MSymbol
                  className="ms-opsz-20 ms-wght-300 text-[20px] lg:landscape:ms-opsz-24 lg:landscape:text-[24px]"
                  symbol="translate"
                />
              }
              value={language}
            />
            <AboutMetaItem
              icon={
                <MSymbol
                  className="ms-opsz-20 ms-wght-300 text-[20px] lg:landscape:ms-opsz-24 lg:landscape:text-[24px]"
                  symbol="distance"
                />
              }
              value={location}
            />
          </div>
        )}
      </div>
    </section>
  )
}
