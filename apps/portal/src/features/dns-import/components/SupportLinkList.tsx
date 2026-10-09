import { Fragment } from 'react'

type SupportLinkListProps = {
  readonly title: string
  readonly items: readonly { readonly label: string; readonly href: string }[]
}

/** Registrar help links shown under a DNS check, as one sentence. */
export const SupportLinkList = ({ title, items }: SupportLinkListProps) => (
  <p className="text-p text-muted-foreground">
    {title}{' '}
    {items.map((item, index) => (
      <Fragment key={item.label}>
        {index > 0 && ', '}
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
        >
          {item.label}
        </a>
      </Fragment>
    ))}
  </p>
)
