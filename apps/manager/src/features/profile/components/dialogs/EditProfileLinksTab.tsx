import { Pencil, Plus, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LinkItem, ProfileRecords } from '../../types'
import { useEditProfileDialogStatus } from './EditProfileDialog.context'
import {
  getLinkValidationIssues,
  type LinkValidationField,
  type LinkValidationIssue,
} from './EditProfileLinksTab.validation'
import { UpdateStatusPanel } from './UpdateStatusPanel'

interface LinkRow {
  readonly index: number
  readonly isDraft: boolean
  readonly key: string
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

const getIssue = (
  issues: readonly LinkValidationIssue[],
  index: number,
  field: LinkValidationField,
) =>
  issues.find((issue) => issue.index === index && issue.field === field)
    ?.message

const getLinkRows = (
  links: readonly LinkItem[],
  linkRowKeys: readonly string[],
  draftRowKeys: readonly string[],
): LinkRow[] => [
  ...links.map((link, index) => ({
    index,
    isDraft: false,
    key: linkRowKeys[index] ?? `link-${index}`,
    link,
  })),
  ...draftRowKeys.map((key, draftIndex) => ({
    index: links.length + draftIndex,
    isDraft: true,
    key,
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
  const nextRowKeyRef = useRef(0)
  const createRowKey = useCallback(() => {
    const rowKey = `link-row-${nextRowKeyRef.current}`
    nextRowKeyRef.current += 1
    return rowKey
  }, [])
  const [linkRowKeys, setLinkRowKeys] = useState(() =>
    values.links.map(() => createRowKey()),
  )
  const [draftRowKeys, setDraftRowKeys] = useState(() =>
    values.links.length === 0 ? [createRowKey()] : [],
  )
  const validationIssues = getLinkValidationIssues(values.links)
  const rows = getLinkRows(values.links, linkRowKeys, draftRowKeys)
  const titleInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    if (values.links.length === 0) {
      setDraftRowKeys((current) =>
        current.length === 0 ? [createRowKey()] : current,
      )
    }
  }, [createRowKey, values.links.length])

  useEffect(() => {
    setLinkRowKeys((current) => {
      if (current.length === values.links.length) {
        return current
      }

      if (current.length > values.links.length) {
        return current.slice(0, values.links.length)
      }

      return [
        ...current,
        ...Array.from(
          { length: values.links.length - current.length },
          createRowKey,
        ),
      ]
    })
  }, [createRowKey, values.links.length])

  const updateRow = (row: LinkRow, value: Partial<LinkItem>) => {
    if (row.isDraft) {
      const nextLink = { ...defaultLink(), ...value }
      if (isEmptyLink(nextLink)) {
        return
      }

      onLinksChange([...values.links, nextLink])
      setLinkRowKeys((current) => [...current, row.key])
      setDraftRowKeys((current) =>
        current.filter((draftRowKey) => draftRowKey !== row.key),
      )
      return
    }

    const nextLinks = updateLinkAtIndex(values.links, row.index, value)
    onLinksChange(normalizeLinks(nextLinks))
    setLinkRowKeys((current) =>
      nextLinks.flatMap((link, index) =>
        isEmptyLink(link) ? [] : [current[index] ?? createRowKey()],
      ),
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
    setLinkRowKeys((current) =>
      current.filter((_, linkIndex) => linkIndex !== index),
    )
  }

  const removeDraftRow = (key: string) => {
    setDraftRowKeys((current) =>
      current.filter((draftRowKey) => draftRowKey !== key),
    )
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
          const rowKey = row.key

          return (
            <div className="flex flex-col gap-1" key={rowKey}>
              <div className="flex items-center gap-1 text-[14px]">
                <span className="relative inline-flex max-w-55 items-center overflow-hidden">
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

                <button
                  aria-label={`Remove link ${row.index + 1}`}
                  className="-translate-y-1/2 absolute top-1/2 right-3 flex size-6 items-center justify-center rounded-sm text-ens-quartz-400 transition-colors hover:bg-ens-quartz-100 hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
                  disabled={isSaving}
                  onClick={() =>
                    row.isDraft
                      ? removeDraftRow(row.key)
                      : removeLink(row.index)
                  }
                  type="button"
                >
                  <X className="size-3.5" />
                </button>
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
          className="flex h-6 min-w-75 items-center gap-[11px] rounded-[15px] p-1 text-[14px] text-ens-quartz-500 leading-[0.96] tracking-[0.07px] transition-colors hover:text-ens-quartz-700 disabled:pointer-events-none disabled:opacity-50"
          disabled={isSaving}
          onClick={() =>
            setDraftRowKeys((current) => [...current, createRowKey()])
          }
          type="button"
        >
          <Plus className="size-4" />
          Add more
        </button>
      </div>
    </div>
  )
}
