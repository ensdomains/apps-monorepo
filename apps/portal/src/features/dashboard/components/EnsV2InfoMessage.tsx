import { ChevronDown, Megaphone } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'
import { ExternalLink } from 'react-external-link'
import { TimelineDisclosure } from '@/components/ui/timeline/TimelineDisclosure'
import { cn } from '@/lib/utils'

const InlineLink = ({
  href,
  children,
}: {
  readonly href: string
  readonly children: ReactNode
}) => (
  <ExternalLink
    href={href}
    className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
  >
    {children}
  </ExternalLink>
)

const RESOURCES: readonly { title: string; description: ReactNode }[] = [
  {
    title: 'Introducing ENSv2',
    description: (
      <>
        Read about the ENS protocol upgrade at the{' '}
        <InlineLink href="https://ens.domains/ensv2">ENSv2 info hub</InlineLink>
      </>
    ),
  },
  {
    title: 'Docs',
    description: (
      <>
        Jump to the{' '}
        <InlineLink href="https://docs.ens.domains/">ENS docs</InlineLink> or
        the article on{' '}
        <InlineLink href="https://ens.domains/blog/post/ensv2-architecture">
          contract updates
        </InlineLink>
      </>
    ),
  },
  {
    title: 'ENS App',
    description: (
      <>
        Use the{' '}
        <InlineLink href="https://app.ens.dev/dashboard">ENS App</InlineLink> to
        upgrade names to v2
      </>
    ),
  },
  {
    title: 'ENS Labs',
    description: (
      <>
        <InlineLink href="https://x.com/ensdomains">Follow on X</InlineLink> for
        updates or join developers on{' '}
        <InlineLink href="https://github.com/ensdomains">GitHub</InlineLink>
      </>
    ),
  },
]

export const EnsV2InfoMessage = () => {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()

  return (
    <div className="rounded-md bg-accent-fill p-4 text-accent-text dark:bg-entity-bg">
      <div className="flex flex-col items-end gap-4 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex w-full items-start gap-3 sm:items-center">
          <span className="flex size-7.5 shrink-0 items-center justify-center">
            <Megaphone className="size-6" aria-hidden />
          </span>
          <p className="text-p">
            <strong className="font-medium">ENS v2 is here!</strong> Same names,
            new architecture, more control
          </p>
        </div>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-md bg-neutral-0 px-3 text-p"
        >
          <ChevronDown
            className={cn(
              'size-4 transition-transform duration-150',
              isOpen && 'rotate-180',
            )}
            aria-hidden
          />
          More info
        </button>
      </div>
      <div id={panelId} inert={!isOpen}>
        <TimelineDisclosure isOpen={isOpen}>
          <ul className="flex flex-col gap-4 pt-4">
            {RESOURCES.map(({ title, description }) => (
              <li
                key={title}
                className="flex flex-col gap-1 rounded-md border border-lapis-400 px-4 py-3 sm:flex-row sm:justify-between sm:gap-4"
              >
                <span className="text-base font-medium">{title}</span>
                <span className="text-p sm:text-right">{description}</span>
              </li>
            ))}
          </ul>
        </TimelineDisclosure>
      </div>
    </div>
  )
}
