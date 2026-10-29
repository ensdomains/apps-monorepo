import { Trans } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/card'
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
import { profileTileClassName } from './ProfileCard'
import { getDisplayHost, getSafeProfileHref } from './ProfileView.helpers'

const getContactRecordValue = (records: ProfileRecords | null, key: string) =>
  records?.contact.find((record) => record.key === key)?.value?.trim()

// Language codes stay uppercase (EN). Place names and timezones keep the
// saved casing, so they are not restyled as a second label.
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
          className="wrap-anywhere line-clamp-2 max-w-[50ch] text-ens-quartz-500 text-sm leading-normal"
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
            <Trans>Profile Description</Trans>
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
      <span className="flex size-5 shrink-0 items-center justify-center text-ens-quartz-500 leading-none">
        {icon}
      </span>
      <span className="min-w-0 truncate font-sans text-[13px] leading-none tracking-[0.2px]">
        {value}
      </span>
    </div>
  )
}

export const ProfileAbout = ({
  canEdit = false,
  className,
  records,
  primaryName,
}: {
  readonly canEdit?: boolean
  readonly className?: string
  readonly records: ProfileRecords | null
  readonly primaryName?: string
}) => {
  const websiteHref = records?.base.url
    ? getSafeProfileHref(records.base.url)
    : undefined
  const fullName = records?.base.name?.trim()
  const description = records?.base.description?.trim()
  const timezone = getContactRecordValue(records, 'timezone')
  const language = formatLanguage(records?.base.language)
  const location = getContactRecordValue(records, 'location')

  const hasContent = Boolean(
    fullName || description || websiteHref || timezone || language || location,
  )

  if (!primaryName && !canEdit && !hasContent) return null

  return (
    <Card
      asChild
      className={cn(
        profileTileClassName,
        'wrap-anywhere flex min-h-0 w-full min-w-0 flex-1',
        primaryName ? 'min-h-47 p-6 xl:min-h-45' : 'p-6 xl:min-h-45.5',
        className,
      )}
    >
      <section>
        <div
          className={cn(
            'grid w-full min-w-0',
            primaryName
              ? 'gap-3'
              : 'gap-8 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start xl:justify-between xl:gap-8',
          )}
        >
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-3">
              {primaryName ? (
                <NamePill
                  className="bg-[var(--theme-color,var(--color-ens-lapis-500))] text-white"
                  label={primaryName}
                />
              ) : (
                <h2 className="min-w-0 text-base text-ens-quartz-700 leading-normal">
                  <span className="block">
                    {fullName || <Trans>Profile Description</Trans>}
                  </span>
                </h2>
              )}
              {websiteHref ? (
                <a
                  className="mt-1 inline-flex max-w-[50%] shrink-0 items-center gap-1 font-sans text-(--theme-color) text-sm leading-normal hover:opacity-80 xl:hidden"
                  href={websiteHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <span className="min-w-0 truncate">
                    {getDisplayHost(websiteHref)}
                  </span>
                  <MSymbol
                    className="ms-opsz-20 ms-wght-300 shrink-0 text-[20px] leading-none xl:ms-opsz-14 xl:text-[14px]"
                    symbol="arrow_outward"
                  />
                </a>
              ) : null}
            </div>
            {description ? (
              <ProfileDescription description={description} />
            ) : null}
            {!description && canEdit ? (
              <p className="mt-3 text-ens-quartz-400 text-sm leading-normal">
                <Trans>Share a fun fact about this name</Trans>
              </p>
            ) : null}
            {websiteHref ? (
              <a
                className="mt-3 hidden max-w-full items-center gap-1 font-sans text-(--theme-color) text-sm leading-normal hover:opacity-80 xl:inline-flex"
                href={websiteHref}
                rel="noopener noreferrer"
                target="_blank"
              >
                <span className="min-w-0">{getDisplayHost(websiteHref)}</span>
                <MSymbol
                  className="ms-opsz-20 ms-wght-300 shrink-0 text-[20px] leading-none xl:ms-opsz-14 xl:text-[14px]"
                  symbol="arrow_outward"
                />
              </a>
            ) : null}
          </div>
          {primaryName ? null : (
            <div
              className={cn(
                'flex min-w-0 items-start gap-4 xl:flex-col xl:items-start xl:gap-1.5 xl:justify-self-end',
                location &&
                  (timezone || language) &&
                  'max-xl:flex-row-reverse max-xl:justify-between',
              )}
            >
              {timezone || language ? (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <AboutMetaItem
                    icon={
                      <MSymbol
                        className="ms-opsz-20 ms-wght-300"
                        symbol="language"
                      />
                    }
                    value={timezone}
                  />
                  <AboutMetaItem
                    icon={
                      <MSymbol
                        className="ms-opsz-20 ms-wght-300"
                        symbol="translate"
                      />
                    }
                    value={language}
                  />
                </div>
              ) : null}
              <AboutMetaItem
                icon={
                  <MSymbol
                    className="ms-opsz-20 ms-wght-300"
                    symbol="distance"
                  />
                }
                value={location}
              />
            </div>
          )}
        </div>
      </section>
    </Card>
  )
}
