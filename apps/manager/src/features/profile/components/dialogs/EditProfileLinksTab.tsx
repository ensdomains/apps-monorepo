import { Pencil, Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LinkItem, ProfileRecords } from '../../types'
import { isSafeHttpUrl } from '../../utils/safeUrl'
import { useEditProfileDialogStatus } from './EditProfileDialog.context'
import { UpdateStatusPanel } from './UpdateStatusPanel'

type LinkValidationField = 'name' | 'url'

interface LinkValidationIssue {
  readonly field: LinkValidationField
  readonly index: number
  readonly message: string
}

interface LinkRow {
  readonly draftIndex?: number
  readonly index: number
  readonly isDraft: boolean
  readonly link: LinkItem
}

interface EditProfileLinksTabProps {
  readonly onLinksChange: (links: ProfileRecords['links']) => void
  readonly values: ProfileRecords
}

const defaultLink = (): LinkItem => ({
  name: '',
  url: '',
})

const isEmptyLink = (link: LinkItem) =>
  link.name.trim() === '' && link.url.trim() === ''

const normalizeLinks = (links: readonly LinkItem[]): LinkItem[] =>
  links.filter((link) => !isEmptyLink(link))

export const getLinkValidationIssues = (
  links: readonly LinkItem[],
): LinkValidationIssue[] =>
  links.flatMap((link, index) => {
    const issues: LinkValidationIssue[] = []

    if (isEmptyLink(link)) {
      return issues
    }

    if (link.name.trim() === '') {
      issues.push({ field: 'name', index, message: 'Enter a title' })
    }

    if (link.url.trim() === '') {
      issues.push({ field: 'url', index, message: 'Enter a link' })
    } else if (!isSafeHttpUrl(link.url)) {
      issues.push({ field: 'url', index, message: 'Enter a valid URL' })
    }

    return issues
  })

const getIssue = (
  issues: readonly LinkValidationIssue[],
  index: number,
  field: LinkValidationField,
) =>
  issues.find((issue) => issue.index === index && issue.field === field)
    ?.message

const getLinkRows = (
  links: readonly LinkItem[],
  draftRows: number,
): LinkRow[] => [
  ...links.map((link, index) => ({
    index,
    isDraft: false,
    link,
  })),
  ...Array.from({ length: draftRows }, (_, draftIndex) => ({
    draftIndex,
    index: links.length + draftIndex,
    isDraft: true,
    link: defaultLink(),
  })),
]

const updateLinkAtIndex = (
  links: readonly LinkItem[],
  index: number,
  value: Partial<LinkItem>,
) =>
  links.map((link, linkIndex) =>
    linkIndex === index ? { ...link, ...value } : link,
  )

export const EditProfileLinksTab = ({
  onLinksChange,
  values,
}: EditProfileLinksTabProps) => {
  const { errorMessage, isSaving, isSuccess, txHash } =
    useEditProfileDialogStatus()
  const [draftRows, setDraftRows] = useState(() =>
    values.links.length === 0 ? 1 : 0,
  )
  const validationIssues = getLinkValidationIssues(values.links)
  const rows = getLinkRows(values.links, draftRows)
  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (values.links.length === 0) {
      setDraftRows((current) => Math.max(current, 1))
    }
  }, [values.links.length])

  const updateRow = (row: LinkRow, value: Partial<LinkItem>) => {
    if (row.isDraft) {
      const nextLink = { ...defaultLink(), ...value }
      if (isEmptyLink(nextLink)) {
        return
      }

      onLinksChange([...values.links, nextLink])
      setDraftRows((current) => Math.max(current - 1, 0))
      return
    }

    onLinksChange(
      normalizeLinks(updateLinkAtIndex(values.links, row.index, value)),
    )
  }

  const trimRowValue = (row: LinkRow, field: keyof LinkItem) => {
    if (row.isDraft) {
      return
    }

    updateRow(row, { [field]: row.link[field].trim() })
  }

  const removeLink = (index: number) => {
    onLinksChange(values.links.filter((_, linkIndex) => linkIndex !== index))
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="flex flex-col gap-1.5">
        <p className="font-bold font-sans text-[#525252] text-[16px] leading-[0.96] tracking-[-0.32px]">
          Links
        </p>
        <p className="text-[16px] text-ens-quartz-400 leading-[1.2]">
          Add links to your website, portfolio, or anything you want to share.
        </p>
      </div>

      <UpdateStatusPanel
        errorMessage={errorMessage}
        hasValidationIssues={validationIssues.length > 0}
        isSaving={isSaving}
        isSuccess={isSuccess}
        txHash={txHash}
      />

      <div className="flex flex-col gap-4 overflow-hidden">
        {rows.map((row) => {
          const nameError = row.isDraft
            ? undefined
            : getIssue(validationIssues, row.index, 'name')
          const urlError = row.isDraft
            ? undefined
            : getIssue(validationIssues, row.index, 'url')
          const rowKey = `link-${row.index}`

          return (
            <div className="flex flex-col gap-1" key={rowKey}>
              <div className="flex items-center gap-1 text-[14px]">
                <span className="relative inline-flex max-w-[220px] items-center overflow-hidden">
                  <span
                    aria-hidden
                    className="invisible h-5 whitespace-pre text-[14px] text-ens-quartz-500 leading-[0.96] tracking-[0.07px]"
                  >
                    {row.link.name || 'Link Title'}
                  </span>
                  <input
                    aria-invalid={Boolean(nameError)}
                    aria-label={`Link ${row.index + 1} title`}
                    className={cn(
                      'absolute inset-0 h-5 w-full min-w-0 bg-transparent p-0 text-[14px] text-ens-quartz-500 leading-[0.96] tracking-[0.07px] outline-none placeholder:text-ens-quartz-400 disabled:opacity-50',
                      nameError && 'text-destructive',
                    )}
                    disabled={isSaving}
                    onBlur={() => trimRowValue(row, 'name')}
                    onChange={(event) =>
                      updateRow(row, { name: event.target.value })
                    }
                    placeholder="Link Title"
                    ref={(element) => {
                      titleInputRefs.current[rowKey] = element
                    }}
                    value={row.link.name}
                  />
                </span>
                <button
                  aria-label={`Edit link ${row.index + 1} title`}
                  className="flex size-5 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
                  disabled={isSaving}
                  onClick={() => titleInputRefs.current[rowKey]?.focus()}
                  type="button"
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>

              <div className="relative min-w-0 flex-1">
                <input
                  aria-invalid={Boolean(urlError)}
                  aria-label={`Link ${row.index + 1} URL`}
                  className={cn(
                    'h-11 w-full rounded-sm border border-[#d4d4d4] bg-transparent py-4 pr-10 pl-4 text-[12px] text-ens-quartz-900 outline-none transition-colors placeholder:text-ens-quartz-400 focus-visible:border-ens-lapis-500 disabled:pointer-events-none disabled:opacity-50',
                    urlError &&
                      'border-destructive focus-visible:border-destructive',
                  )}
                  disabled={isSaving}
                  onBlur={() => trimRowValue(row, 'url')}
                  onChange={(event) =>
                    updateRow(row, { url: event.target.value })
                  }
                  placeholder="https://your-link.com"
                  value={row.link.url}
                />

                {!row.isDraft && (
                  <button
                    aria-label={`Remove link ${row.index + 1}`}
                    className="-translate-y-1/2 absolute top-1/2 right-3 flex size-6 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
                    disabled={isSaving}
                    onClick={() => removeLink(row.index)}
                    type="button"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              {(nameError || urlError) && (
                <div className="flex flex-col gap-0.5 text-destructive text-xs">
                  {nameError && <p>{nameError}</p>}
                  {urlError && <p>{urlError}</p>}
                </div>
              )}
            </div>
          )
        })}

        <button
          className="flex h-6 min-w-[300px] items-center gap-[11px] rounded-[15px] p-1 text-[14px] text-ens-quartz-500 leading-[0.96] tracking-[0.07px] transition-colors hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={isSaving}
          onClick={() => setDraftRows((current) => current + 1)}
          type="button"
        >
          <Plus className="size-4" />
          Add more
        </button>
      </div>
    </div>
  )
}
